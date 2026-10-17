import * as agentLane from '@walt/agent';
import { createAi, createTranscriber, type AiProvider } from '@walt/ai';
import { redact, type WaltEnv } from '@walt/core';
import { bakeryContent } from '@walt/core/fixtures';
import { noScreenshots, PlaywrightScreenshotter, type Screenshotter } from './capture.js';
import { ConsoleChannel } from './channel/console.js';
import type { Channel } from './channel/types.js';
import { CommandPoller } from './commands.js';
import { Worker, type AgentLane, type WorkerDeps } from './pipeline.js';
import { FakeSiteRepo, GitHubSiteRepo, type SiteRepo } from './site/repo.js';
import { MemoryStore, seedMemory } from './store/memory.js';
import { SupabaseStore, serviceClient } from './store/supabase.js';
import type { Store } from './store/types.js';

export const LOCAL_SITE_URL = 'http://localhost:3001';

export interface BuildOptions {
  channel?: Channel;
  store?: Store;
  ai?: AiProvider;
  repo?: SiteRepo;
  screenshots?: Screenshotter;
  agent?: AgentLane;
  /** Voice transcriber; default from OPENAI_API_KEY (null = no audios). */
  transcribe?: WorkerDeps['transcribe'];
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

/** The code lane (`@walt/agent`) bound to this worker's env (with the fake fallbacks). Built lazily. */
export function agentFromEnv(env: WaltEnv): AgentLane {
  return {
    runCodeChange: (input) => agentLane.runCodeChange(input, agentLane.createAgentDeps(env)),
    mergeChange: (input) => agentLane.mergeChange(input, agentLane.createHost(env)),
    revertChange: (input) => agentLane.revertChange(input, agentLane.createHost(env)),
    waitForDeploy: (input) => agentLane.waitForDeploy(input, agentLane.createHost(env)),
  };
}

/**
 * Store from the environment: Supabase over HTTPS (service role) when SUPABASE_URL and the key are set,
 * otherwise in memory with the seed. SUPABASE_DB_URL is not used: the network only allows 443.
 */
export async function storeFromEnv(env: WaltEnv): Promise<Store> {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return new SupabaseStore(serviceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY));
  return memoryStore(env);
}

/** In-memory store loaded with the same data as the seed. */
export function memoryStore(env: WaltEnv): Store {
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
export async function buildApp(env: WaltEnv, opts: BuildOptions = {}): Promise<App> {
  const log = opts.log ?? ((l: string) => console.log(redact(l, env.secrets)));
  const store = opts.store ?? (await storeFromEnv(env));
  const channel = opts.channel ?? new ConsoleChannel();
  const screenshots =
    opts.screenshots ?? (env.SCREENSHOTS === 'on' ? new PlaywrightScreenshotter(undefined, (m) => log(`[captura] ${m}`)) : noScreenshots);
  screenshots.warm?.();
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
    panelUrl: env.PANEL_URL,
    transcribe: opts.transcribe !== undefined ? opts.transcribe : createTranscriber(env),
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
