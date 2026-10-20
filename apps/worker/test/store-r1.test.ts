import { DEFAULT_RULES, type Rules } from '@walt/core';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';
import { PgStore } from '../src/store/pg.js';
import { MissingMigrationError, redactPersonal, VersionConflictError, type Store } from '../src/store/types.js';
import { freshPglite, pgliteDb } from './pglite.js';

const F1 = '22222222-2222-4222-8222-222222222222';
const P1 = '11111111-1111-4111-8111-111111111111';
const P1b = '11111111-1111-4111-8111-bbbbbbbbbbbb';
const F2 = '33333333-3333-4333-8333-333333333333';
const P2 = '44444444-4444-4444-8444-444444444444';

interface Fixture {
  store: Store;
  /** Moves a job's lease into the past (as if its worker died). */
  expireLease(jobId: string): Promise<void>;
  /** Makes a job ready now (skips its backoff). */
  makeReady(jobId: string): Promise<void>;
  close(): Promise<void>;
}

async function memoryFixture(): Promise<Fixture> {
  const store = new MemoryStore();
  const at = new Date().toISOString();
  store.factories.push({ id: F1, name: 'Faro', assistant_name: 'a', created_at: at }, { id: F2, name: 'Otra', assistant_name: 'b', created_at: at });
  for (const [id, factory] of [[P1, F1], [P1b, F1], [P2, F2]] as const) {
    store.projects.push({
      id, factory_id: factory, name: id, client_name: 'C', repo_owner: 'Owner', repo_name: id, default_branch: 'main', mode: 'contenido',
      config_path: 'walt.config.json', site_url: null, created_at: at,
    });
  }
  store.rules.push({ project_id: P1, version: 1, rules: { ...structuredClone(DEFAULT_RULES), policy_text: 'Si toca la API es delicado', config: { template: 'generic' } } as Rules });
  return {
    store,
    async expireLease(id) {
      store.jobs.find((j) => j.id === id)!.lease_until = new Date(Date.now() - 1000).toISOString();
    },
    async makeReady(id) {
      store.jobs.find((j) => j.id === id)!.run_after = new Date(Date.now() - 1000).toISOString();
    },
    close: async () => {},
  };
}

async function pgFixture(): Promise<Fixture> {
  const pg = await freshPglite();
  await pg.query(`insert into factories (id, name, assistant_name) values ($1, 'Faro', 'a'), ($2, 'Otra', 'b')`, [F1, F2]);
  await pg.query(
    `insert into projects (id, factory_id, name, client_name, repo_owner, repo_name) values
     ($1, $4, 'p1', 'C', 'Owner', 'r1'), ($2, $4, 'p1b', 'C', 'Owner', 'r1b'), ($3, $5, 'p2', 'C', 'Owner', 'r2')`,
    [P1, P1b, P2, F1, F2],
  );
  await pg.query(
    `insert into rules (project_id, version, policies, limits, policy_text, config) values ($1, 1, $2::jsonb, $3::jsonb, 'Si toca la API es delicado', '{"template":"generic"}')`,
    [P1, JSON.stringify(DEFAULT_RULES.policies), JSON.stringify(DEFAULT_RULES.limits)],
  );
  const store = new PgStore(pgliteDb(pg));
  return {
    store,
    async expireLease(id) {
      await pg.query(`update jobs set lease_until = now() - interval '1 second' where id = $1`, [id]);
    },
    async makeReady(id) {
      await pg.query(`update jobs set run_after = now() - interval '1 second' where id = $1`, [id]);
    },
    close: () => store.close(),
  };
}

describe.each([
  ['memoria', memoryFixture],
  ['Postgres (PGlite + migraciones reales)', pgFixture],
])('Store del R1 en %s', (_name, make) => {
  let fx: Fixture;
  let store: Store;
  const opened: Fixture[] = [];
  beforeEach(async () => {
    fx = await make();
    opened.push(fx);
    store = fx.store;
  });
  afterAll(async () => {
    for (const f of opened) await f.close();
  });

  it('detecta 0004 y devuelve la política y la config de las reglas', async () => {
    expect((await store.schema()).r1).toBe(true);
    const r = (await store.latestRules(P1))?.rules as Record<string, unknown> | undefined;
    expect(r?.policy_text).toBe('Si toca la API es delicado');
    expect(r?.config).toEqual({ template: 'generic' });
  });

  it('encola una sola vez por dedupe_key', async () => {
    const a = await store.enqueueJob({ kind: 'incoming', projectId: P1, dedupeKey: 'tg:1', payload: { text: 'hola' } });
    const b = await store.enqueueJob({ kind: 'incoming', projectId: P1, dedupeKey: 'tg:1', payload: { text: 'hola' } });
    expect(a.inserted).toBe(true);
    expect(b).toEqual({ id: a.id, inserted: false });
  });

  it('un trabajo a la vez por proyecto y cola, en orden; otros proyectos y la cola del agente siguen', async () => {
    const j1 = await store.enqueueJob({ kind: 'k', projectId: P1 });
    const j2 = await store.enqueueJob({ kind: 'k', projectId: P1 });
    const j3 = await store.enqueueJob({ kind: 'k', projectId: P2 });
    const agent = await store.enqueueJob({ kind: 'run_agent', projectId: P1, queue: 'agent' });
    const c1 = await store.claimJob('w1', ['default'], 60);
    expect(c1?.id).toBe(j1.id);
    expect(c1?.status).toBe('running');
    expect(c1?.attempts).toBe(1);
    const c2 = await store.claimJob('w2', ['default'], 60);
    expect(c2?.id).toBe(j3.id); // P1 is busy: P2 goes next
    expect(await store.claimJob('w3', ['default'], 60)).toBeNull();
    expect((await store.claimJob('w4', ['agent'], 60))?.id).toBe(agent.id);
    expect(await store.completeJob(j1.id, 'w1')).toBe(true);
    expect(await store.completeJob(j1.id, 'w1')).toBe(false);
    expect((await store.claimJob('w3', ['default'], 60))?.id).toBe(j2.id);
  });

  it('reintenta con backoff y pasa al dead letter al agotar los intentos', async () => {
    const { id } = await store.enqueueJob({ kind: 'k', projectId: P1, maxAttempts: 2 });
    const other = await store.enqueueJob({ kind: 'k', projectId: P1 });
    await store.claimJob('w', ['default'], 60);
    const f1 = await store.failJob(id, 'w', 'se cayó el modelo');
    expect(f1?.status).toBe('pending');
    expect(f1?.dead).toBe(false);
    expect(Date.parse(f1!.run_after)).toBeGreaterThan(Date.now() + 2_000); // 5 s ± 25 %
    // Strict order inside the project: the next job waits for the retry.
    expect(await store.claimJob('w', ['default'], 60)).toBeNull();
    await fx.makeReady(id);
    expect((await store.claimJob('w', ['default'], 60))?.id).toBe(id);
    const f2 = await store.failJob(id, 'w', 'otra vez');
    expect(f2).toMatchObject({ status: 'failed', dead: true, last_error: 'otra vez', attempts: 2 });
    expect((await store.claimJob('w', ['default'], 60))?.id).toBe(other.id);
  });

  it('un error que no se reintenta va directo al dead letter', async () => {
    const { id } = await store.enqueueJob({ kind: 'k' });
    await store.claimJob('w', ['default'], 60);
    expect(await store.failJob(id, 'w', 'payload inválido', { retry: false })).toMatchObject({ status: 'failed', dead: true, attempts: 1 });
  });

  it('un lease vencido vuelve a la cola y otro worker lo toma', async () => {
    const { id } = await store.enqueueJob({ kind: 'k', projectId: P1, requestId: null });
    await store.claimJob('w1', ['default'], 60);
    expect(await store.heartbeatJob(id, 'w1', 60)).toBe(true);
    await fx.expireLease(id);
    const again = await store.claimJob('w2', ['default'], 60);
    expect(again).toMatchObject({ id, locked_by: 'w2', attempts: 2 });
    expect(await store.heartbeatJob(id, 'w1', 60)).toBe(false);
    expect(await store.completeJob(id, 'w1')).toBe(false);
    const summary = await store.jobsSummary();
    expect(summary.find((s) => s.status === 'running')?.total).toBe(1);
  });

  it('dice qué pedidos tienen trabajos activos', async () => {
    const req = await store.createRequest({ short_id: 'ACT001', project_id: P1, contact_id: null, raw_text: 'hola' });
    const idle = await store.createRequest({ short_id: 'ACT002', project_id: P1, contact_id: null, raw_text: 'chau' });
    await store.enqueueJob({ kind: 'process_request', projectId: P1, requestId: req.id });
    expect([...(await store.requestsWithActiveJobs([req.id, idle.id]))]).toEqual([req.id]);
    expect(await store.countFactoryRequestsSince(F1, '2000-01-01T00:00:00Z')).toBe(2);
    expect(await store.countFactoryRequestsSince(F2, '2000-01-01T00:00:00Z')).toBe(0);
  });

  it('reetiqueta y recupera los parecidos solo de la misma agencia', async () => {
    const a = await store.createRequest({ short_id: 'LAB001', project_id: P1, contact_id: null, raw_text: 'subí el pan flauta a 95' });
    const b = await store.createRequest({ short_id: 'LAB002', project_id: P1, contact_id: null, raw_text: 'agregá un login con google' });
    const c = await store.createRequest({ short_id: 'LAB003', project_id: P2, contact_id: null, raw_text: 'subí el pan flauta a 100' });
    await store.updateRequest(a.id, { category: 'delicado' as never });
    const label = await store.labelRequest(a.id, 'simple', 'es un precio', null);
    expect(label).toMatchObject({ request_id: a.id, factory_id: F1, from_category: 'delicado', to_category: 'simple', reason: 'es un precio' });
    await store.labelRequest(b.id, 'delicado');
    await store.labelRequest(c.id, 'nuevo');
    const similar = await store.similarLabeledRequests(F1, 'subí la flauta a 120', 5);
    expect(similar.map((x) => x.raw_text)).toEqual(['subí el pan flauta a 95', 'agregá un login con google']);
    expect(similar[0]!.similarity).toBeGreaterThan(similar[1]!.similarity);
    expect(similar[0]!.to_category).toBe('simple');
    // The latest label of a request wins.
    await store.labelRequest(a.id, 'delicado', 'me equivoqué');
    expect((await store.similarLabeledRequests(F1, 'pan flauta', 1))[0]).toMatchObject({ to_category: 'delicado', reason: 'me equivoqué' });
  });

  it('da los ejemplos del prompt de decisión: parecidos, de la agencia y sin datos personales', async () => {
    const a = await store.createRequest({ short_id: 'EXA001', project_id: P1, contact_id: null, raw_text: 'subí el pan flauta a 95 y avisale a ana@mail.com' });
    const b = await store.createRequest({ short_id: 'EXA002', project_id: P1, contact_id: null, raw_text: 'quiero cobrar con mercado pago' });
    await store.labelRequest(a.id, 'simple', 'un precio no es delicado');
    await store.labelRequest(b.id, 'nuevo');
    const ex = await store.similarExamples({ factoryId: F1, projectId: P1, text: 'subí la flauta a 120', limit: 8 });
    expect(ex).toEqual([{ text: 'subí el pan flauta a 95 y avisale a [email]', category: 'simple', previous: null, reason: 'un precio no es delicado' }]);
    expect(await store.similarExamples({ factoryId: F2, text: 'subí la flauta a 120', limit: 8 })).toEqual([]);
  });

  it('publica con locking optimista e idempotencia', async () => {
    const live = await store.createVersion({ project_id: P1, content: { v: 0 }, status: 'borrador' });
    expect((await store.publishVersion(P1, live.id)).already).toBe(false);
    const d1 = await store.createVersion({ project_id: P1, parent_id: live.id, content: { v: 1 } });
    const d2 = await store.createVersion({ project_id: P1, parent_id: live.id, content: { v: 2 } });
    const r1 = await store.publishVersion(P1, d1.id, { key: `publish:x` });
    expect(r1.already).toBe(false);
    expect(r1.version).toBe(2);
    expect((await store.publishVersion(P1, d1.id)).already).toBe(true);
    expect((await store.publishVersion(P1, d2.id, { key: 'publish:x' })).already).toBe(true);
    await expect(store.publishVersion(P1, d2.id)).rejects.toBeInstanceOf(VersionConflictError);
    expect((await store.getLiveVersion(P1))?.id).toBe(d1.id);
  });

  it('BYOK: la clave del proyecto pisa la de la agencia y la config dice el modo', async () => {
    expect(await store.getAiSettings(F1, P1)).toBeNull();
    await store.setAiKey(F1, null, 'sk-ant-agencia-xxxxxxxxxxxxxxxxxxxx1111');
    await store.setAiKey(F1, P1, 'sk-ant-proyecto-xxxxxxxxxxxxxxxxxxx2222');
    expect(await store.getAiKey(F1, P1)).toBe('sk-ant-proyecto-xxxxxxxxxxxxxxxxxxx2222');
    expect(await store.getAiKey(F1, P1b)).toBe('sk-ant-agencia-xxxxxxxxxxxxxxxxxxxx1111');
    expect(await store.getAiKey(F2, P2)).toBeNull();
    expect(await store.getAiSettings(F1, P1)).toMatchObject({ mode: 'byok', key_hint: '2222', project_id: P1 });
    expect(await store.getAiSettings(F1, P1b)).toMatchObject({ mode: 'byok', key_hint: '1111', project_id: null });
    // Rotating keeps one secret per scope.
    await store.setAiKey(F1, null, 'sk-ant-agencia-xxxxxxxxxxxxxxxxxxxx3333');
    expect(await store.getAiKey(F1, P1b)).toBe('sk-ant-agencia-xxxxxxxxxxxxxxxxxxxx3333');
  });

  it('créditos: recarga idempotente, uso que descuenta y gasto del período', async () => {
    expect(await store.creditWallet(F1, 10, 'manual:1')).toEqual({ already: false, balanceUsd: 10 });
    expect((await store.creditWallet(F1, 10, 'manual:1')).already).toBe(true);
    const r = await store.recordUsage({ factoryId: F1, projectId: P1, kind: 'ai', mode: 'credits', model: 'claude-sonnet-5-5', inputTokens: 1000, outputTokens: 100, costUsd: 0.003, priceUsd: 0.0039 });
    expect(r.balanceUsd).toBeCloseTo(9.9961, 6);
    await store.recordUsage({ factoryId: F1, projectId: P1, kind: 'ai', mode: 'byok', costUsd: 0.01, priceUsd: 0 });
    expect((await store.getWallet(F1))?.balance_usd).toBeCloseTo(9.9961, 6);
    const since = await store.usageSince(F1, '2000-01-01T00:00:00Z');
    expect(since.calls).toBe(2);
    expect(since.costUsd).toBeCloseTo(0.013, 6);
    expect(since.priceUsd).toBeCloseTo(0.0039, 6);
    expect((await store.usageSince(F1, '2000-01-01T00:00:00Z', P1b)).calls).toBe(0);
  });

  it('idempotencia de webhooks con clave de texto', async () => {
    expect(await store.markProcessed('wa:wamid.1', 'whatsapp')).toBe(true);
    expect(await store.markProcessed('wa:wamid.1', 'whatsapp')).toBe(false);
    expect(await store.markUpdateProcessed(77)).toBe(true);
    expect(await store.markUpdateProcessed(77)).toBe(false);
  });
});

describe('github_installations', () => {
  it('busca la instalación de la agencia por dueño del repo, sin mayúsculas', async () => {
    const fx = await memoryFixture();
    const store = fx.store as MemoryStore;
    store.installations.push({ id: 'i', factory_id: F1, installation_id: 42, account_login: 'EstudioFaro', account_type: 'Organization', suspended_at: null, created_at: '' });
    expect((await store.githubInstallation(F1, 'estudiofaro'))?.installation_id).toBe(42);
    expect(await store.githubInstallation(F2, 'estudiofaro')).toBeNull();
  });
});

describe('base sin 0004 (el worker nuevo con la base de hoy)', () => {
  it('lo detecta, traduce las categorías nuevas al escribir y no rompe', async () => {
    const pg = await freshPglite({ upTo: '0003' });
    await pg.query(`insert into factories (id, name, assistant_name) values ($1, 'Faro', 'a')`, [F1]);
    await pg.query(`insert into projects (id, factory_id, name, client_name, repo_owner, repo_name) values ($1, $2, 'p', 'C', 'o', 'r')`, [P1, F1]);
    await pg.query(`insert into rules (project_id, version, policies, limits) values ($1, 1, '{}', '{}')`, [P1]);
    const store = new PgStore(pgliteDb(pg));
    const schema = await store.schema();
    expect(schema.r1).toBe(false);
    expect(schema.missing).toContain('jobs');
    const req = await store.createRequest({ short_id: 'OLD001', project_id: P1, contact_id: null, raw_text: 'subí el pan' });
    expect((await store.updateRequest(req.id, { category: 'simple' as never })).category).toBe('permitido');
    expect((await store.updateRequest(req.id, { category: 'delicado' as never })).category).toBe('riesgoso');
    expect((await store.updateRequest(req.id, { category: 'consulta' })).category).toBe('consulta');
    expect(await store.latestRules(P1)).toEqual({ version: 1, rules: { policies: {}, limits: {} } });
    expect(await store.similarExamples({ factoryId: F1, text: 'pan', limit: 5 })).toEqual([]);
    expect(await store.getAiSettings(F1, P1)).toBeNull();
    expect(await store.recordUsage({ factoryId: F1, kind: 'ai', mode: 'platform', costUsd: 0.01, priceUsd: 0 })).toEqual({ balanceUsd: null });
    await expect(store.enqueueJob({ kind: 'k' })).rejects.toBeInstanceOf(MissingMigrationError);
    const live = await store.createVersion({ project_id: P1, content: {}, status: 'borrador' });
    expect(await store.publishVersion(P1, live.id)).toEqual({ already: false, version: null });
    expect((await store.getLiveVersion(P1))?.id).toBe(live.id);
    await store.close();
  });

  it('saca e-mails y teléfonos de un ejemplo', () => {
    expect(redactPersonal('llamame al +598 99 123 456 o escribí a juan.perez@gmail.com')).toBe('llamame al [teléfono] o escribí a [email]');
    expect(redactPersonal('subí el pan a 95')).toBe('subí el pan a 95');
    expect(redactPersonal('la torta grande a 1.250.000')).toBe('la torta grande a 1.250.000');
  });
});
