import { SEED_IDS, type ProjectRow } from '@dale/core';
import { bakeryConfig, bakeryContent } from '@dale/core/fixtures';
import type { Context } from 'grammy';
import { describe, expect, it } from 'vitest';
import { keyboard, toIncoming } from '../src/channel/telegram.js';
import { montevideoIso, normalizeReply } from '../src/pipeline.js';
import { Queue, withTimeout } from '../src/queue.js';
import { GitHubSiteRepo, serializeContent } from '../src/site/repo.js';

const project: ProjectRow = {
  id: SEED_IDS.project, factory_id: SEED_IDS.agency, name: 'P', client_name: 'Mabel', repo_owner: 'o', repo_name: 'r',
  default_branch: 'main', mode: 'contenido', config_path: 'dale.config.json', site_url: null, created_at: '',
};

describe('Telegram', () => {
  const ctx = (update: object) => {
    const u = { update_id: 10, ...update } as Record<string, unknown>;
    const msg = u.message as Record<string, unknown> | undefined;
    const cq = u.callback_query as Record<string, unknown> | undefined;
    return { update: u, chat: { id: 5 }, from: { first_name: 'Ma', last_name: 'Bel' }, message: msg, callbackQuery: cq } as unknown as Context;
  };
  it('mapea /start, texto, botones y fotos', () => {
    expect(toIncoming(ctx({ message: { text: '/start abc_DEF' } }), 't')).toMatchObject({ kind: 'start', token: 'abc_DEF', chatId: 5, fromName: 'Ma Bel', updateId: 10 });
    expect(toIncoming(ctx({ message: { text: 'hola' } }), 't')).toMatchObject({ kind: 'text', text: 'hola' });
    expect(toIncoming(ctx({ callback_query: { data: 'ok:ABC' } }), 't')).toMatchObject({ kind: 'callback', data: 'ok:ABC' });
    expect(toIncoming(ctx({ message: { photo: [] } }), 't')).toMatchObject({ kind: 'other' });
    expect(toIncoming(ctx({ message: { voice: { file_id: 'f' } } }), 't')).toMatchObject({ kind: 'voice' });
  });
  it('arma el teclado con filas y links', () => {
    const kb = keyboard([[{ text: 'Dale', data: 'ok:A' }, { text: 'No', data: 'no:A' }], [{ text: 'Panel', url: 'https://p.example' }]]);
    expect(kb!.inline_keyboard).toEqual([
      [{ text: 'Dale', callback_data: 'ok:A' }, { text: 'No', callback_data: 'no:A' }],
      [{ text: 'Panel', url: 'https://p.example' }],
    ]);
    expect(keyboard([])).toBeUndefined();
  });
});

describe('GitHub (octokit simulado)', () => {
  function fakeOctokit(opts: { conflictOnce?: boolean } = {}) {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    let conflict = !!opts.conflictOnce;
    const files: Record<string, string> = {
      'dale.config.json': JSON.stringify(bakeryConfig()),
      'content/site.schema.json': '{"type":"object"}',
      'content/site.json': JSON.stringify(bakeryContent()),
    };
    return {
      calls,
      repos: {
        getContent: async (a: { path: string }) => {
          calls.push({ op: 'get', args: a });
          if (!(a.path in files)) throw Object.assign(new Error('nf'), { status: 404 });
          return { data: { sha: `sha-${a.path}`, encoding: 'base64', content: Buffer.from(files[a.path]!).toString('base64') } };
        },
        createOrUpdateFileContents: async (a: Record<string, unknown>) => {
          calls.push({ op: 'put', args: a });
          if (conflict) {
            conflict = false;
            throw Object.assign(new Error('conflict'), { status: 409 });
          }
          return { data: { commit: { sha: 'c0ffee' } } };
        },
      },
    };
  }
  it('lee el contrato y commitea el JSON con el sha actual', async () => {
    const o = fakeOctokit();
    const repo = new GitHubSiteRepo('x', o as never);
    const { config, schema } = await repo.loadContract(project);
    expect(config.content).toBe('content/site.json');
    expect(schema).toEqual({ type: 'object' });
    const sha = await repo.commitContent(project, config, { a: 1 }, 'dale: algo (#ABC)');
    expect(sha).toBe('c0ffee');
    const put = o.calls.find((c) => c.op === 'put')!.args;
    expect(put).toMatchObject({ owner: 'o', repo: 'r', path: 'content/site.json', branch: 'main', message: 'dale: algo (#ABC)', sha: 'sha-content/site.json' });
    expect(Buffer.from(put.content as string, 'base64').toString()).toBe(serializeContent({ a: 1 }));
  });
  it('reintenta una vez si el archivo cambió en el medio', async () => {
    const o = fakeOctokit({ conflictOnce: true });
    const repo = new GitHubSiteRepo('x', o as never);
    expect(await repo.commitContent(project, bakeryConfig(), {}, 'm')).toBe('c0ffee');
    expect(o.calls.filter((c) => c.op === 'put')).toHaveLength(2);
  });
});

describe('utilidades', () => {
  it('cola con concurrencia 1 y máximo', async () => {
    const q = new Queue('t', 2);
    const order: number[] = [];
    const job = (n: number) => async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push(n);
    };
    expect(q.push(job(1))).toBe(true);
    expect(q.push(job(2))).toBe(true);
    expect(q.push(job(3))).toBe(false);
    await q.onIdle();
    expect(order).toEqual([1, 2]);
  });
  it('timeout', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'Algo')).rejects.toThrow(/Algo: se pasó el tiempo/);
  });
  it('hora de Montevideo y respuestas cortas', () => {
    expect(montevideoIso(new Date('2026-10-17T17:00:00.123Z'))).toBe('2026-10-17T14:00:00-03:00');
    expect(normalizeReply('  Sí,  DALE ')).toBe('si, dale');
  });
});
