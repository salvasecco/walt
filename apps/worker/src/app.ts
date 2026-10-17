import * as agentLane from '@dale/agent';
import { createAi, type AiProvider } from '@dale/ai';
import { redact, type DaleEnv } from '@dale/core';
import { bakeryContent } from '@dale/core/fixtures';
import { noScreenshots, PlaywrightScreenshotter, type Screenshotter } from './capture.js';
import { ConsoleChannel } from './channel/console.js';
import type { Channel } from './channel/types.js';
import { CommandPoller } from './commands.js';
import { Worker, type AgentLane, type WorkerDeps } from './pipeline.js';
import { FakeSiteRepo, GitHubSiteRepo, type SiteRepo } from './site/repo.js';
import { MemoryStore, seedMemory } from './store/memory.js';
import { PgStore, postgresDb } from './store/pg.js';
import type { Store } from './store/types.js';

export const LOCAL_SITE_URL = 'http://localhost:3001';

export interface BuildOptions {
  channel?: Channel;
  store?: Store;
  ai?: AiProvider;
  repo?: SiteRepo;
  screenshots?: Screenshotter;
  agent?: AgentLane;
  log?: (l: string) => void;
  onEvent?: WorkerDeps['onEvent'];
}

export interface App {
  worker: Worker;
  store: Store;
  channel: Channel;
  commands: CommandPoller;
  close(): Promise<void>;
}

/** The code lane (`@dale/agent`) bound to this worker's env (with the fake fallbacks). Built lazily. */
export function agentFromEnv(env: DaleEnv): AgentLane {
  return {
    runCodeChange: (input) => agentLane.runCodeChange(input, agentLane.createAgentDeps(env)),
    mergeChange: (input) => agentLane.mergeChange(input, agentLane.createHost(env)),
    revertChange: (input) => agentLane.revertChange(input, agentLane.createHost(env)),
  };
}

/** Store from the environment: Postgres with SUPABASE_DB_URL, otherwise in memory with the seed. */
export async function storeFromEnv(env: DaleEnv): Promise<Store> {
  if (env.SUPABASE_DB_URL) return new PgStore(await postgresDb(env.SUPABASE_DB_URL));
  const mem = new MemoryStore();
  seedMemory(mem, {
    agencyName: env.DEMO_AGENCY_NAME,
    siteUrl: env.DEMO_SITE_URL ?? LOCAL_SITE_URL,
    repo: env.DEMO_REPO,
    content: bakeryContent(),
  });
  return mem;
}

/** Wires the worker from `loadEnv({ fallbackToFake: true })`. */
export async function buildApp(env: DaleEnv, opts: BuildOptions = {}): Promise<App> {
  const log = opts.log ?? ((l: string) => console.log(redact(l, env.secrets)));
  const store = opts.store ?? (await storeFromEnv(env));
  const channel = opts.channel ?? new ConsoleChannel();
  const screenshots =
    opts.screenshots ?? (env.SCREENSHOTS === 'on' ? new PlaywrightScreenshotter(undefined, (m) => log(`[captura] ${m}`)) : noScreenshots);
  const ai = opts.ai ?? createAi(env);
  const repo = opts.repo ?? (env.GITHUB_MODE === 'real' && env.GITHUB_TOKEN ? new GitHubSiteRepo(env.GITHUB_TOKEN) : new FakeSiteRepo());
  const worker = new Worker({
    store,
    channel,
    ai,
    repo,
    screenshots,
    agent: opts.agent ?? agentFromEnv(env),
    secrets: env.secrets,
    defaultSiteUrl: env.DEMO_SITE_URL ?? LOCAL_SITE_URL,
    panelUrl: process.env.PANEL_URL || undefined,
    canTranscribe: ai.name !== 'fake' && !!env.OPENAI_API_KEY,
    log,
    onEvent: opts.onEvent,
  });
  const commands = new CommandPoller(store, worker, env.secrets, log);
  return {
    worker,
    store,
    channel,
    commands,
    async close() {
      commands.stop();
      await worker.idle();
      await screenshots.close();
      await store.close();
    },
  };
}
