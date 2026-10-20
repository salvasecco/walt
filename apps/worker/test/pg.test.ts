import type { PGlite } from '@electric-sql/pglite';
import { createFakeProvider } from '@walt/ai';
import { assistantName, copy, DEFAULT_RULES, SEED_IDS } from '@walt/core';
import { bakeryContent } from '@walt/core/fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { noScreenshots } from '../src/capture.js';
import { ConsoleChannel } from '../src/channel/console.js';
import { CommandPoller } from '../src/commands.js';
import { Worker } from '../src/pipeline.js';
import { FakeSiteRepo } from '../src/site/repo.js';
import { PgStore } from '../src/store/pg.js';
import { notImplementedAgent } from './helpers.js';
import { freshPglite, pgliteDb } from './pglite.js';

describe('PgStore sobre la migración real (PGlite)', () => {
  let pg: PGlite;
  let store: PgStore;
  let worker: Worker;
  const channel = new ConsoleChannel(null);
  const repo = new FakeSiteRepo(null);

  beforeAll(async () => {
    pg = await freshPglite();
    await pg.query('insert into factories (id, name, assistant_name) values ($1, $2, $3)', [SEED_IDS.agency, 'Estudio Faro', assistantName('Estudio Faro')]);
    await pg.query(
      `insert into projects (id, factory_id, name, client_name, repo_owner, repo_name, site_url) values ($1, $2, 'Panadería Mabel', 'Mabel', 'salvasecco', 'walt-demo', 'https://sitio.example')`,
      [SEED_IDS.project, SEED_IDS.agency],
    );
    await pg.query('insert into rules (project_id, version, policies, limits) values ($1, 1, $2::jsonb, $3::jsonb)', [
      SEED_IDS.project, JSON.stringify(DEFAULT_RULES.policies), JSON.stringify(DEFAULT_RULES.limits),
    ]);
    await pg.query(`insert into content_versions (project_id, status, content, published_at) values ($1, 'viva', $2::jsonb, now())`, [
      SEED_IDS.project, JSON.stringify(bakeryContent()),
    ]);
    await pg.query(`insert into invites (token, project_id, role, max_uses, expires_at) values ('tok', $1, 'cliente', 1, now() + interval '1 day'), ('tokA', $1, 'agencia', 1, now() + interval '1 day')`, [SEED_IDS.project]);
    store = new PgStore(pgliteDb(pg));
    worker = new Worker({
      store, channel, repo, ai: createFakeProvider(), screenshots: noScreenshots, agent: notImplementedAgent,
      secrets: [], defaultSiteUrl: 'http://localhost:3001', log: () => {},
    });
  });
  afterAll(async () => {
    await store.close();
  });

  const price = async () => {
    const live = await store.getLiveVersion(SEED_IDS.project);
    return (live!.content as { products: { id: string; price: number }[] }).products[0]!.price;
  };

  it('invitación, pedido, aprobación, publicación y vuelta atrás', async () => {
    await worker.handle({ kind: 'start', chatId: 9_000_000_001, fromName: 'Mabel', token: 'tok', updateId: 1 });
    await worker.handle({ kind: 'start', chatId: 9_000_000_002, fromName: 'Faro', token: 'tokA', updateId: 2 });
    expect(channel.sent.at(-2)!.text).toBe(copy.bienvenida('el asistente de Estudio Faro'));
    const contact = (await store.getContactByChat(9_000_000_001))!;
    expect(contact.telegram_chat_id).toBe(9_000_000_001);

    await worker.handle({ kind: 'text', chatId: 9_000_000_001, fromName: 'Mabel', text: 'subí el pan flauta a 95', updateId: 3 });
    await worker.handle({ kind: 'text', chatId: 9_000_000_001, fromName: 'Mabel', text: 'subí el pan flauta a 95', updateId: 3 });
    await worker.idle();
    const req = (await store.latestRequestOfContact(contact.id, ['esperando_cliente']))!;
    // 0004 renames the categories (a legacy 'permitido' is stored as 'simple').
    expect(['permitido', 'simple']).toContain(req.category);
    expect(req.confidence).toBe(0.9);
    expect(req.changes).toEqual([{ pointer: '/products/0/price', before: 80, after: 95 }]);

    await worker.handle({ kind: 'callback', chatId: 9_000_000_001, fromName: 'Mabel', data: `ok:${req.short_id}`, updateId: 4 });
    await worker.idle();
    expect(await price()).toBe(95);
    const published = (await store.getRequest(req.id))!;
    expect(published.status).toBe('publicado');
    const live = (await store.getLiveVersion(SEED_IDS.project))!;
    expect(live.id).toBe(published.live_version_id);
    expect(live.git_commit_sha).toBeTruthy();
    expect(await store.countAutoPublishedSince(SEED_IDS.project, '2000-01-01T00:00:00Z')).toBe(1);

    await worker.handle({ kind: 'callback', chatId: 9_000_000_001, fromName: 'Mabel', data: `undo:${req.short_id}`, updateId: 5 });
    await worker.idle();
    expect(await price()).toBe(80);
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from content_versions where status = 'viva'");
    expect(rows[0]!.n).toBe(1);

    const events = await pg.query<{ step: string }>('select step from events where request_id = $1 and status = $2 order by id', [req.id, 'ok']);
    expect(events.rows.map((e) => e.step)).toEqual(
      expect.arrayContaining(['recibido', 'interpretado', 'gate', 'decidido', 'borrador', 'enviado', 'aprobado_cliente', 'publicado', 'commit', 'revertido']),
    );
    const msgs = await pg.query<{ n: number }>('select count(*)::int as n from messages where contact_id = $1', [contact.id]);
    expect(msgs.rows[0]!.n).toBeGreaterThan(5);
  });

  it('comandos del panel y presupuestos', async () => {
    await worker.handle({ kind: 'text', chatId: 9_000_000_001, fromName: 'Mabel', text: 'quiero que la gente pueda reservar tortas online' });
    await worker.idle();
    const contact = (await store.getContactByChat(9_000_000_001))!;
    const req = (await store.latestRequestOfContact(contact.id, ['cotizado']))!;
    expect(req.quote_id).toBeTruthy();
    expect((await store.listQuotes(SEED_IDS.project, 20))[0]!.amount_usd).toBeGreaterThan(0);
    await pg.query(`insert into commands (type, request_id, payload) values ('enviar_presupuesto', $1, '{"amount_usd": 500}'::jsonb)`, [req.id]);
    expect(await new CommandPoller(store, worker, [], () => {}).tick()).toBe(1);
    const { rows } = await pg.query<{ status: string }>('select status from commands');
    expect(rows[0]!.status).toBe('hecho');
    expect((await store.getQuote(req.quote_id!))!.status).toBe('enviado');
    expect(channel.sent.at(-1)!.text).toMatch(/USD 500/);
  });
});
