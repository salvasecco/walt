import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeProvider, type AiProvider } from '@walt/ai';
import { copy, loadEnv, SEED_IDS, type Usage } from '@walt/core';
import { bakeryContent } from '@walt/core/fixtures';
import { describe, expect, it } from 'vitest';
import { buildApp, type App, type BuildOptions } from '../src/app.js';
import { ConsoleChannel } from '../src/channel/console.js';
import { JOB, reapStuck, UpdateIntake } from '../src/durable.js';
import { loadExtraEnv } from '../src/extra-env.js';
import { createLogger } from '../src/log.js';
import { JobRunner } from '../src/queue.js';
import { FakeSiteRepo } from '../src/site/repo.js';
import { MemoryStore, seedMemory } from '../src/store/memory.js';
import { AGENCY_CHAT, CLIENT_CHAT, livePrice, okAgent } from './helpers.js';

const NOWHERE = mkdtempSync(join(tmpdir(), 'walt-durable-'));
const env = loadEnv({ homeFile: join(NOWHERE, 'none.env'), cwd: NOWHERE, overrides: { LLM_PROVIDER: 'fake', GITHUB_MODE: 'fake', TELEGRAM_MODE: 'console', SCREENSHOTS: 'off' } });
const extra = loadExtraEnv({ homeFile: join(NOWHERE, 'none.env'), cwd: NOWHERE, overrides: { WORKER_ID: 'test-worker' } });

/** A fake model with real-looking usage, so the ledger has costs. */
function pricedAi(base: AiProvider = createFakeProvider(), tag = 'walt'): AiProvider & { tag: string } {
  const usage: Usage = { model: 'claude-sonnet-5-5', inputTokens: 10_000, outputTokens: 1_000 };
  return {
    tag,
    name: base.name,
    interpret: async (i) => ({ ...(await base.interpret(i)), usage }),
    answerConsulta: async (i) => ({ ...(await base.answerConsulta(i)), usage }),
    draftQuote: async (i) => ({ ...(await base.draftQuote(i)), usage }),
    transcribe: (a, m) => base.transcribe(a, m),
  };
}

async function durableApp(opts: Partial<BuildOptions> = {}): Promise<{ app: App; store: MemoryStore; channel: ConsoleChannel; logs: string[] }> {
  const store = new MemoryStore();
  seedMemory(store, { agencyName: 'Estudio Faro', siteUrl: 'https://sitio.example', repo: 'salvasecco/walt-demo', content: bakeryContent() });
  await store.ensureContact({ project_id: SEED_IDS.project, role: 'cliente', display_name: 'Mabel', telegram_chat_id: CLIENT_CHAT });
  await store.ensureContact({ project_id: SEED_IDS.project, role: 'agencia', display_name: 'Faro', telegram_chat_id: AGENCY_CHAT });
  const channel = new ConsoleChannel(null);
  const logs: string[] = [];
  const app = await buildApp(env, {
    channel,
    store,
    ai: createFakeProvider(),
    agent: okAgent(),
    repo: new FakeSiteRepo(null),
    transcribe: null,
    durable: true,
    extra,
    log: (l) => logs.push(l),
    ...opts,
  });
  return { app, store, channel, logs };
}

const text = (t: string, updateId?: number) => ({ kind: 'text' as const, chatId: CLIENT_CHAT, fromName: 'Mabel', text: t, updateId });
const press = (data: string, updateId?: number, chatId = CLIENT_CHAT) => ({ kind: 'callback' as const, chatId, fromName: 'x', data, updateId });

describe('cola durable de punta a punta (memoria)', () => {
  it('pedido, vista previa, Dale y publicación pasan por trabajos; un update repetido entra una vez', async () => {
    const { app, store, channel } = await durableApp();
    expect(app.mode).toBe('durable');
    await app.intake(text('subí el pan flauta a 95', 1));
    await app.intake(text('subí el pan flauta a 95', 1));
    await app.idle();
    const req = store.requests.at(-1)!;
    expect(store.requests).toHaveLength(1);
    expect(req.status).toBe('esperando_cliente');
    expect(store.jobs.map((j) => [j.kind, j.status])).toEqual([[JOB.incoming, 'done'], [JOB.processRequest, 'done']]);
    expect(store.jobs[0]!.project_id).toBe(SEED_IDS.project);
    expect(store.jobs[1]!.request_id).toBe(req.id);

    await app.intake(press(`ok:${req.short_id}`, 2));
    await app.idle();
    expect(store.requests[0]!.status).toBe('publicado');
    expect(livePrice(store, 'pan-flauta')).toBe(95);
    expect(channel.sent.filter((m) => m.chatId === CLIENT_CHAT).map((m) => m.text)).toContain(copy.publicado());
    expect(store.jobs.every((j) => j.status === 'done')).toBe(true);
    await app.close();
  });

  it('el agente corre en su propia cola sin frenar los cambios simples del proyecto', async () => {
    const agent = okAgent();
    const { app, store } = await durableApp({ agent });
    store.projects[0]!.mode = 'codigo';
    await app.intake(text('agregá una sección de testimonios con tres opiniones', 1));
    await app.idle();
    const req = store.requests.at(-1)!;
    expect(store.jobs.find((j) => j.kind === JOB.runAgent)).toMatchObject({ queue: 'agent', status: 'done', request_id: req.id });
    expect(agent.calls.some((c) => c.startsWith('run:'))).toBe(true);
    // R1: a simple code change with its preview goes straight to the client (no agency).
    expect(store.requests.at(-1)!.status).toBe('esperando_cliente');
    await app.close();
  });

  it('un trabajo que falla se reintenta y, al agotar los intentos, el pedido pasa a derivado', async () => {
    const { app, store } = await durableApp();
    const req = await store.createRequest({ short_id: 'FAIL01', project_id: SEED_IDS.project, contact_id: store.contacts[0]!.id, raw_text: 'subí el pan flauta a 95' });
    let failures = 2;
    const original = store.getRequest.bind(store);
    store.getRequest = async (id: string) => {
      if (failures > 0) {
        failures--;
        throw new Error('se cortó la conexión con la base');
      }
      return original(id);
    };
    const { id } = await store.enqueueJob({ kind: JOB.processRequest, projectId: SEED_IDS.project, requestId: req.id, maxAttempts: 2 });
    await app.idle();
    expect(store.jobs.find((j) => j.id === id)).toMatchObject({ status: 'pending', attempts: 1, last_error: 'se cortó la conexión con la base' });
    store.jobs.find((j) => j.id === id)!.run_after = new Date(Date.now() - 1).toISOString();
    await app.idle();
    expect(store.jobs.find((j) => j.id === id)).toMatchObject({ status: 'failed', dead: true, attempts: 2 });
    expect((await store.getRequest(req.id))!.status).toBe('derivado');
    expect(app.runner!.stats.dead).toBe(1);
    await app.close();
  });

  it('un trabajo de un worker que se cayó se retoma cuando vence su lease', async () => {
    const { app, store } = await durableApp();
    await store.enqueueJob({ kind: JOB.incoming, projectId: SEED_IDS.project, payload: text('subí el pan flauta a 95', 9), dedupeKey: 'tg:9' });
    const lost = (await store.claimJob('worker-que-murio', ['default'], 120))!;
    await app.idle();
    expect(store.jobs[0]!.status).toBe('running');
    store.jobs[0]!.lease_until = new Date(Date.now() - 1).toISOString();
    await app.idle();
    expect(store.jobs.find((j) => j.id === lost.id)).toMatchObject({ status: 'done', attempts: 2, locked_by: 'test-worker' });
    expect(store.requests.at(-1)!.status).toBe('esperando_cliente');
    await app.close();
  });

  it('los comandos del panel entran una vez a la cola y corren en orden', async () => {
    const { app, store, channel } = await durableApp();
    store.addCommand({ type: 'proponer', payload: { project_id: SEED_IDS.project, text: '¿Armamos la promo del Día de la Madre?' } });
    expect(await app.commands.tick()).toBe(1);
    expect(await app.commands.tick()).toBe(0);
    await app.idle();
    expect(store.commands[0]!.status).toBe('hecho');
    expect(store.jobs.filter((j) => j.kind === JOB.command)).toHaveLength(1);
    expect(channel.sent.filter((m) => m.text.includes('Día de la Madre'))).toHaveLength(1);
    await app.close();
  });

  it('el reaper deriva lo colgado sin trabajo y respeta lo que tiene un trabajo activo', async () => {
    const { app, store } = await durableApp();
    const contact = store.contacts[0]!.id;
    const stuck = await store.createRequest({ short_id: 'STK001', project_id: SEED_IDS.project, contact_id: contact, raw_text: 'a', status: 'publicando' });
    const busy = await store.createRequest({ short_id: 'STK002', project_id: SEED_IDS.project, contact_id: contact, raw_text: 'b', status: 'interpretando' });
    const fresh = await store.createRequest({ short_id: 'STK003', project_id: SEED_IDS.project, contact_id: contact, raw_text: 'c', status: 'publicando' });
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    for (const r of store.requests) if (r.id !== fresh.id) r.updated_at = old;
    await store.enqueueJob({ kind: JOB.processRequest, projectId: SEED_IDS.project, requestId: busy.id, runAfter: new Date(Date.now() + 60_000).toISOString() });
    expect(await reapStuck(app.worker, store, 5 * 60_000)).toBe(1);
    await app.worker.idle();
    expect((await store.getRequest(stuck.id))!.status).toBe('derivado');
    expect((await store.getRequest(busy.id))!.status).toBe('interpretando');
    expect((await store.getRequest(fresh.id))!.status).toBe('publicando');
    await app.close();
  });

  it('límite por agencia: pasado el tope, un pedido nuevo recibe "mucho trabajo" y no se crea', async () => {
    const { app, store, channel } = await durableApp({ limits: { agencyRequests: 1 } });
    await app.intake(text('subí el pan flauta a 95', 1));
    await app.idle();
    await app.intake(text('cambiá el horario del sábado de 9 a 13', 2));
    await app.idle();
    expect(store.requests).toHaveLength(1);
    expect(channel.sent.filter((m) => m.chatId === CLIENT_CHAT).at(-1)!.text).toBe(copy.colaLlena());
    await app.close();
  });

  it('límite de ráfaga por chat en la entrada', async () => {
    const store = new MemoryStore();
    const intake = new UpdateIntake(store, () => {}, () => {}, { max: 2, windowMs: 60_000 });
    expect(await intake.accept(text('a', 1))).toBe(true);
    expect(await intake.accept(text('b', 2))).toBe(true);
    expect(await intake.accept(text('c', 3))).toBe(false);
    expect(store.jobs).toHaveLength(2);
  });
});

describe('modos de IA por agencia', () => {
  it('sin configuración usa la clave de Walt y anota el costo en el ledger (modo platform, sin cobro)', async () => {
    const { app, store } = await durableApp({ ai: pricedAi() });
    await app.intake(text('subí el pan flauta a 95', 1));
    await app.idle();
    expect(store.ledger).toHaveLength(1);
    expect(store.ledger[0]).toMatchObject({ mode: 'platform', factory_id: SEED_IDS.agency, request_id: store.requests[0]!.id, price_usd: 0 });
    expect(store.ledger[0]!.cost_usd).toBeCloseTo(0.03, 6);
    await app.close();
  });

  it('créditos: sin saldo no corre y el pedido pasa a derivado; con saldo descuenta costo más margen', async () => {
    const { app, store, channel } = await durableApp({ ai: pricedAi() });
    store.aiSettings.push({
      id: 's1', factory_id: SEED_IDS.agency, project_id: null, mode: 'credits', secret_id: null, key_hint: null, key_validated_at: null,
      monthly_cap_usd: null, request_cap_usd: null, alert_pct: 80, model_classify: null, model_code: null, created_at: '', updated_at: '',
    });
    await app.intake(text('subí el pan flauta a 95', 1));
    await app.idle();
    expect(store.requests[0]).toMatchObject({ status: 'derivado' });
    expect(store.requests[0]!.error).toMatch(/saldo/);
    expect(channel.sent.filter((m) => m.chatId === CLIENT_CHAT).at(-1)!.text).toBe(copy.derivado());

    await store.creditWallet(SEED_IDS.agency, 5, 'manual:1');
    app.tenant.invalidate();
    await app.intake(text('subí el pan flauta a 96', 2));
    await app.idle();
    expect(store.requests[1]!.status).toBe('esperando_cliente');
    const usage = store.ledger.find((l) => l.kind === 'ai')!;
    expect(usage).toMatchObject({ mode: 'credits' });
    expect(usage.price_usd).toBeCloseTo(0.039, 6);
    expect((await store.getWallet(SEED_IDS.agency))!.balance_usd).toBeCloseTo(5 - 0.039, 6);
    await app.close();
  });

  it('BYOK: usa un proveedor con la clave de la agencia y la redacta de los logs', async () => {
    const KEY = 'sk-ant-api03-de-la-agencia-1234567890';
    const created: string[] = [];
    const lines: string[] = [];
    const { app, store } = await durableApp({
      ai: pricedAi(),
      makeAi: ({ key }) => {
        created.push(key ?? '');
        return pricedAi(createFakeProvider(), 'agencia');
      },
      logger: createLogger({ format: 'json', write: (l) => lines.push(l) }),
    });
    await store.setAiKey(SEED_IDS.agency, null, KEY);
    await app.intake(text('subí el pan flauta a 95', 1));
    await app.idle();
    expect(created).toEqual([KEY]);
    expect(store.ledger[0]).toMatchObject({ mode: 'byok', price_usd: 0 });
    app.logger.line(`error del proveedor con la clave ${KEY}`);
    expect(lines.at(-1)).toContain('[secreto]');
    expect(lines.join('\n')).not.toContain(KEY);
    await app.close();
  });

  it('Claude Code de la agencia: el cambio de código no lo corre Walt y se avisa', async () => {
    const agent = okAgent();
    const { app, store } = await durableApp({ agent });
    store.projects[0]!.mode = 'codigo';
    store.aiSettings.push({
      id: 's2', factory_id: SEED_IDS.agency, project_id: SEED_IDS.project, mode: 'claude_code', secret_id: null, key_hint: null, key_validated_at: null,
      monthly_cap_usd: null, request_cap_usd: null, alert_pct: 80, model_classify: null, model_code: null, created_at: '', updated_at: '',
    });
    await app.intake(text('agregá una sección de testimonios con tres opiniones', 1));
    await app.idle();
    expect(agent.calls.filter((c) => c.startsWith('run:'))).toEqual([]);
    expect(store.requests.at(-1)!.status).toBe('derivado');
    expect(store.requests.at(-1)!.error).toMatch(/Claude Code/);
    await app.close();
  });

  it('tope mensual: pasado el tope no llama al modelo', async () => {
    const { app, store } = await durableApp({ ai: pricedAi() });
    store.aiSettings.push({
      id: 's3', factory_id: SEED_IDS.agency, project_id: null, mode: 'byok', secret_id: 'sec', key_hint: '7890', key_validated_at: null,
      monthly_cap_usd: 0.01, request_cap_usd: null, alert_pct: 80, model_classify: null, model_code: null, created_at: '', updated_at: '',
    });
    store.vault.set('sec', 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxx7890');
    await store.recordUsage({ factoryId: SEED_IDS.agency, kind: 'ai', mode: 'byok', costUsd: 0.02, priceUsd: 0 });
    await app.intake(text('subí el pan flauta a 95', 1));
    await app.idle();
    expect(store.requests[0]!.status).toBe('derivado');
    expect(store.requests[0]!.error).toMatch(/tope de gasto/);
    await app.close();
  });
});

describe('JobRunner con hilos reales', () => {
  it('corre proyectos distintos en paralelo y nunca dos del mismo proyecto', async () => {
    const store = new MemoryStore();
    const events: string[] = [];
    const gates = new Map<string, () => void>();
    const runner = new JobRunner({
      store,
      workerId: 'w',
      pollMs: 5,
      queues: [{ name: 'default', concurrency: 3, leaseSeconds: 60, timeoutMs: 5_000 }],
      handlers: {
        k: async (job) => {
          const name = (job.payload as { name: string }).name;
          events.push(`start ${name}`);
          await new Promise<void>((r) => gates.set(name, r));
          events.push(`end ${name}`);
        },
      },
    });
    await store.enqueueJob({ kind: 'k', projectId: 'p1', payload: { name: 'p1-a' } });
    await store.enqueueJob({ kind: 'k', projectId: 'p1', payload: { name: 'p1-b' } });
    await store.enqueueJob({ kind: 'k', projectId: 'p2', payload: { name: 'p2-a' } });
    runner.start();
    const until = async (cond: () => boolean) => {
      for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
    };
    await until(() => events.length === 2);
    expect(events.sort()).toEqual(['start p1-a', 'start p2-a']);
    gates.get('p1-a')!();
    await until(() => gates.has('p1-b'));
    expect(events.indexOf('end p1-a')).toBeLessThan(events.indexOf('start p1-b'));
    gates.get('p2-a')!();
    gates.get('p1-b')!();
    await until(() => store.jobs.every((j) => j.status === 'done'));
    await runner.stop(1_000);
    expect(store.jobs.map((j) => j.status)).toEqual(['done', 'done', 'done']);
  });
});
