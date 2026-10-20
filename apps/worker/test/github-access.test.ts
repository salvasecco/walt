import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitHubAccessError, githubTokenSource } from '@walt/agent';
import { createFakeProvider } from '@walt/ai';
import { assistantName, DEFAULT_RULES, loadEnv, SEED_IDS } from '@walt/core';
import { bakeryContent } from '@walt/core/fixtures';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentFromEnv, buildApp } from '../src/app.js';
import { ConsoleChannel } from '../src/channel/console.js';
import { runWithWork } from '../src/context.js';
import { loadExtraEnv } from '../src/extra-env.js';
import { MemoryStore, seedMemory } from '../src/store/memory.js';

const NOWHERE = mkdtempSync(join(tmpdir(), 'walt-gh-'));
const env = loadEnv({
  homeFile: join(NOWHERE, 'none.env'),
  cwd: NOWHERE,
  overrides: { GITHUB_MODE: 'real', GITHUB_TOKEN: 'ghp_token_de_la_instancia_1234567890', LLM_PROVIDER: 'fake', TELEGRAM_MODE: 'console', SCREENSHOTS: 'off' },
});
const extra = loadExtraEnv({ homeFile: join(NOWHERE, 'none.env'), cwd: NOWHERE, overrides: { WORKER_ID: 'w' } });

const OTHER_AGENCY = '55555555-5555-4555-8555-555555555555';
const OTHER_PROJECT = '66666666-6666-4666-8666-666666666666';
const OTHER_CHAT = 909_090_909;

function storeWithAnotherAgency(repo = { owner: 'victima', name: 'privado' }): MemoryStore {
  const store = new MemoryStore();
  seedMemory(store, { agencyName: 'Estudio Faro', siteUrl: 'https://sitio.example', repo: 'salvasecco/walt-demo', content: bakeryContent() });
  const at = new Date().toISOString();
  store.factories.push({ id: OTHER_AGENCY, name: 'Otra agencia', assistant_name: assistantName('Otra agencia'), created_at: at });
  store.projects.push({
    id: OTHER_PROJECT, factory_id: OTHER_AGENCY, name: 'Proyecto ajeno', client_name: 'X', repo_owner: repo.owner, repo_name: repo.name,
    default_branch: 'main', mode: 'contenido', config_path: 'walt.config.json', site_url: 'https://otro.example', created_at: at,
  });
  store.rules.push({ project_id: OTHER_PROJECT, version: 1, rules: structuredClone(DEFAULT_RULES) });
  store.versions.push({
    id: globalThis.crypto.randomUUID(), version: 1, publish_key: null, project_id: OTHER_PROJECT, request_id: null, parent_id: null,
    status: 'viva', content: bakeryContent(), git_commit_sha: null, git_error: null, published_at: at, created_at: at,
  });
  return store;
}

/** Any call to GitHub during the test is recorded and fails. */
let githubCalls: string[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  githubCalls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('github.com')) {
      githubCalls.push(url);
      throw new Error('la prueba no deja llamar a GitHub');
    }
    return realFetch(input, init);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const tokensFor = (store: MemoryStore) =>
  githubTokenSource({
    app: null,
    fallbackToken: env.GITHUB_TOKEN,
    fallbackFactories: [SEED_IDS.agency],
    findInstallation: (f, o) => store.githubInstallation(f, o),
  });

describe('GITHUB_TOKEN solo para la agencia de la instancia', () => {
  it('el agente no toca el repo de otra agencia sin su instalación de la App, con o sin contexto de trabajo', async () => {
    const store = storeWithAnotherAgency();
    const lane = agentFromEnv(env, { store, tokens: tokensFor(store) });
    const repo = { owner: 'victima', name: 'privado', defaultBranch: 'main' };
    await expect(runWithWork({ projectId: OTHER_PROJECT }, () => lane.mergeChange({ repo, prNumber: 1 }))).rejects.toBeInstanceOf(GitHubAccessError);
    await expect(lane.revertChange({ repo, mergeSha: 'abc', shortId: 'ABCDEF' })).rejects.toBeInstanceOf(GitHubAccessError);
    await expect(lane.closeChange!({ repo, prNumber: 1 })).rejects.toBeInstanceOf(GitHubAccessError);
    const req = await store.createRequest({ short_id: 'GHA001', project_id: OTHER_PROJECT, contact_id: null, raw_text: 'agregá un botón' });
    await expect(lane.runCodeChange({ repo, requestId: req.id, shortId: req.short_id, instruction: 'x' })).rejects.toBeInstanceOf(GitHubAccessError);
    expect(githubCalls).toEqual([]);
  });

  it('un repo conectado por dos agencias es ambiguo fuera de un trabajo: tampoco usa el token de la instancia', async () => {
    const store = storeWithAnotherAgency({ owner: 'salvasecco', name: 'walt-demo' });
    const lane = agentFromEnv(env, { store, tokens: tokensFor(store) });
    await expect(lane.closeChange!({ repo: { owner: 'salvasecco', name: 'walt-demo', defaultBranch: 'main' }, prNumber: 1 })).rejects.toBeInstanceOf(GitHubAccessError);
    expect(githubCalls).toEqual([]);
  });

  it('con su instalación, la otra agencia usa la App y no el token de la instancia', async () => {
    const store = storeWithAnotherAgency();
    store.installations.push({ id: 'i', factory_id: OTHER_AGENCY, installation_id: 7, account_login: 'Victima', account_type: 'User', suspended_at: null, created_at: '' });
    const seen: string[] = [];
    const tokens = githubTokenSource({
      app: null,
      fallbackToken: env.GITHUB_TOKEN,
      fallbackFactories: [SEED_IDS.agency],
      findInstallation: async (f, o) => {
        const inst = await store.githubInstallation(f, o);
        if (inst) seen.push(`${f}:${inst.installation_id}`);
        return inst;
      },
    });
    // Without the App configured the installation cannot be used: still no instance token for that agency.
    await expect(tokens.tokenFor({ factoryId: OTHER_AGENCY, owner: 'victima' })).rejects.toBeInstanceOf(GitHubAccessError);
    expect(await tokens.tokenFor({ factoryId: SEED_IDS.agency, owner: 'salvasecco' })).toEqual({ token: env.GITHUB_TOKEN, source: 'token' });
    expect(seen).toEqual([]);
  });

  it('de punta a punta: el pedido de un proyecto de otra agencia sin instalación se deriva con un mensaje claro y no toca GitHub', async () => {
    const store = storeWithAnotherAgency();
    await store.ensureContact({ project_id: OTHER_PROJECT, role: 'cliente', display_name: 'Cliente ajeno', telegram_chat_id: OTHER_CHAT });
    const app = await buildApp(env, { channel: new ConsoleChannel(null), store, ai: createFakeProvider(), transcribe: null, durable: true, extra, log: () => {} });
    await app.intake({ kind: 'text', chatId: OTHER_CHAT, fromName: 'X', text: 'subí el pan flauta a 95', updateId: 1 });
    await app.idle();
    const req = store.requests.at(-1)!;
    expect(req.project_id).toBe(OTHER_PROJECT);
    expect(req.status).toBe('derivado');
    expect(req.error).toMatch(/GitHub App de Walt no está instalada en victima/);
    expect(githubCalls).toEqual([]);
    await app.close();
  });
});
