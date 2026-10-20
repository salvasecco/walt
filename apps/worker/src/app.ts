import * as agentLane from '@walt/agent';
import type { GitHubTokenSource } from '@walt/agent';
import { createAi, createTranscriber, type AiProvider } from '@walt/ai';
import { redact, type WaltEnv } from '@walt/core';
import { bakeryContent } from '@walt/core/fixtures';
import { noScreenshots, PlaywrightScreenshotter, type Screenshotter } from './capture.js';
import { ConsoleChannel } from './channel/console.js';
import type { Channel, Incoming } from './channel/types.js';
import { CommandPoller } from './commands.js';
import { currentWork } from './context.js';
import { Cron, CommandIntake, DEFAULT_LIMITS, DurableWorker, durableHandlers, onDeadJob, UpdateIntake, type DurableLimits } from './durable.js';
import { loadExtraEnv, type ExtraEnv } from './extra-env.js';
import { prometheus, type ReadinessCheck } from './health.js';
import { createLogger, type Logger } from './log.js';
import { Worker, type AgentLane, type WorkerDeps } from './pipeline.js';
import { DEFAULT_QUEUES, JobRunner } from './queue.js';
import { Breakers, guardAgent, guardAi, guardChannel, guardScreenshots, guardSiteRepo } from './resilience.js';
import { FakeSiteRepo, GitHubSiteRepo, type SiteRepo } from './site/repo.js';
import { MemoryStore, seedMemory } from './store/memory.js';
import { SupabaseStore, serviceClient } from './store/supabase.js';
import type { SchemaInfo, Store } from './store/types.js';
import { TenantAi } from './tenant.js';

export const LOCAL_SITE_URL = 'http://localhost:3001';

export interface BuildOptions {
  channel?: Channel;
  store?: Store;
  /** Walt's model provider (platform mode). Default from LLM_PROVIDER, behind the model breaker. */
  ai?: AiProvider;
  /** Provider with an agency's key or another model (BYOK). Default: Anthropic with that key. */
  makeAi?: (opts: { key: string | null; model: string | null }) => AiProvider;
  repo?: SiteRepo;
  screenshots?: Screenshotter;
  agent?: AgentLane;
  /** Voice transcriber; default from OPENAI_API_KEY (null = no audios). */
  transcribe?: WorkerDeps['transcribe'];
  log?: (l: string) => void;
  logger?: Logger;
  onEvent?: WorkerDeps['onEvent'];
  /**
   * Durable queue in Postgres (`jobs`): `auto` uses it with Supabase and migration 0004; `true` requires it
   * (any store with the R1 methods, the memory one included); `false`, the in-memory queue as before.
   * Default false: dry-run, e2e and tests keep the in-memory path unless they ask.
   */
  durable?: boolean | 'auto';
  extra?: ExtraEnv;
  limits?: Partial<DurableLimits>;
  breakers?: Breakers;
}

export interface App {
  worker: Worker;
  store: Store;
  channel: Channel;
  /** Panel commands: enqueued as jobs (durable) or run by the poller (memory). */
  commands: { start(): void; stop(): void; tick(): Promise<number> };
  mode: 'durable' | 'memoria';
  /** What the database supports (0004 or not). */
  schema: SchemaInfo;
  runner: JobRunner | null;
  cron: Cron | null;
  breakers: Breakers;
  tenant: TenantAi;
  logger: Logger;
  /** Entry for channel updates: enqueued (durable) or handled right away (memory). */
  intake(u: Incoming): Promise<void>;
  /** Waits until everything queued is done: the in-memory queues and, in durable mode, the jobs this process can take now. */
  idle(): Promise<void>;
  readiness(extra?: Record<string, () => Promise<ReadinessCheck>>): Record<string, () => Promise<ReadinessCheck>>;
  metrics(): Promise<string>;
  close(): Promise<void>;
}

/**
 * The code lane bound to this worker's env: for each operation it picks the agency's GitHub App
 * installation (or GITHUB_TOKEN) and, for the agent, the agency's AI mode (BYOK key, credits, caps),
 * and records the agent's cost in the ledger. With GITHUB_MODE=fake, the local host as before.
 */
export function agentFromEnv(env: WaltEnv, deps: { store?: Store; tokens?: GitHubTokenSource | null; tenant?: TenantAi | null; onSecret?: (s: string) => void } = {}): AgentLane {
  const { store, tokens, tenant } = deps;

  /**
   * Project of the operation: the job's, the request's, or (outside a job: console, dry-run) the only agency
   * with that repo. Unknown or ambiguous → null, and then only an App installation can serve it.
   */
  const projectOf = async (repo: { owner: string; name: string }, requestId?: string): Promise<{ id: string; factoryId: string } | null> => {
    if (!store) return null;
    let projectId = currentWork()?.projectId ?? null;
    if (!projectId && requestId) projectId = (await store.getRequest(requestId))?.project_id ?? null;
    if (projectId) {
      const project = await store.getProject(projectId);
      return project ? { id: project.id, factoryId: project.factory_id } : null;
    }
    const byRepo = await store.projectsByRepo(repo.owner, repo.name);
    const factories = new Set(byRepo.map((p) => p.factory_id));
    return byRepo.length > 0 && factories.size === 1 ? { id: byRepo[0]!.id, factoryId: byRepo[0]!.factory_id } : null;
  };

  const hostFor = async (repo: { owner: string; name: string }, requestId?: string): Promise<{ host: agentLane.CodeHost; secrets: string[] }> => {
    if (env.GITHUB_MODE !== 'real' || !tokens) return { host: agentLane.createHost(env), secrets: [] };
    const project = await projectOf(repo, requestId);
    // Throws GitHubAccessError (before touching GitHub) when the agency has neither an installation nor the right to the instance's token.
    const t = await tokens.tokenFor({ factoryId: project?.factoryId ?? null, owner: repo.owner });
    return { host: new agentLane.GitHubHost(t.token), secrets: [t.token] };
  };

  return {
    async runCodeChange(input) {
      const { host, secrets } = await hostFor(input.repo, input.requestId);
      const project = await projectOf(input.repo, input.requestId);
      const res = tenant ? await tenant.resolve(project?.id ?? null, input.requestId) : null;
      // BYOK: the agent runs with the agency's key (and it is redacted like the other secrets).
      const keyEnv = res?.key ? { LLM_PROVIDER: 'anthropic' as const, ANTHROPIC_API_KEY: res.key } : {};
      const model = res?.settings?.model_code ?? env.MODEL_AGENT;
      const agentEnv: WaltEnv = { ...env, ...keyEnv, MODEL_AGENT: model, secrets: [...env.secrets, ...secrets, ...(res?.key ? [res.key] : [])] };
      const runner = agentLane.createClaudeAgentRunner(agentEnv);
      let costUsd = 0;
      const metered: agentLane.AgentRunner = async (i) => {
        const out = await runner(i);
        costUsd += out.costUsd ?? 0;
        return out;
      };
      try {
        return await agentLane.runCodeChange(input, { host, runner: metered, secrets: agentEnv.secrets, models: agentLane.agentModels(model) });
      } finally {
        if (tenant && res) await tenant.record(res, input.requestId, 'agent', null, costUsd);
      }
    },
    async mergeChange(input) {
      return agentLane.mergeChange(input, (await hostFor(input.repo)).host);
    },
    async revertChange(input) {
      return agentLane.revertChange(input, (await hostFor(input.repo)).host);
    },
    async closeChange(input) {
      return agentLane.closeChange(input, (await hostFor(input.repo)).host);
    },
    async waitForDeploy(input) {
      return agentLane.waitForDeploy(input, (await hostFor(input.repo)).host);
    },
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

const NIL = '00000000-0000-4000-8000-000000000000';

/** Wires the worker from `loadEnv({ fallbackToFake: true })`. */
export async function buildApp(env: WaltEnv, opts: BuildOptions = {}): Promise<App> {
  const extra = opts.extra ?? loadExtraEnv();
  const logger = opts.logger ?? createLogger({ format: 'text', secrets: [...env.secrets, ...extra.secrets], write: opts.log });
  const log = opts.log ?? ((l: string) => logger.line(redact(l, env.secrets)));
  const store = opts.store ?? (await storeFromEnv(env));
  const schema = await store.schema().catch((err): SchemaInfo => {
    log(`[worker] no pude ver el esquema de la base: ${redact(err instanceof Error ? err.message : String(err), env.secrets)}`);
    return { r1: false, missing: ['(sin conexión)'] };
  });
  const durable = opts.durable === true || (opts.durable === 'auto' && store.kind === 'postgres' && schema.r1);
  if (opts.durable === true && !schema.r1) throw new Error(`La cola durable necesita la migración 0004 (falta: ${schema.missing.join(', ')}): pnpm db:migrate --copy 0004`);

  const breakers = opts.breakers ?? new Breakers({ onChange: (state, name) => log(`[circuito] ${name}: ${state === 'open' ? 'abierto (pausado)' : state === 'half_open' ? 'probando' : 'cerrado'}`) });
  const channel = opts.channel ?? new ConsoleChannel();
  const screenshots = guardScreenshots(
    opts.screenshots ?? (env.SCREENSHOTS === 'on' ? new PlaywrightScreenshotter(undefined, (m) => log(`[captura] ${m}`)) : noScreenshots),
    breakers.hosting,
    log,
  );
  screenshots.warm?.();

  const platform = opts.ai ?? guardAi(createAi(env), breakers.model, log);
  const makeAi =
    opts.makeAi ??
    (({ key, model }: { key: string | null; model: string | null }) =>
      guardAi(
        createAi({ ...env, ...(key ? { LLM_PROVIDER: 'anthropic' as const, ANTHROPIC_API_KEY: key } : {}), ...(model ? { MODEL_INTERPRET: model } : {}) }),
        breakers.model,
        log,
      ));
  const tenant = new TenantAi({ store, platform, makeProvider: makeAi, onSecret: (k) => logger.addSecrets([k]), log });

  const tokens =
    env.GITHUB_MODE === 'real'
      ? agentLane.githubTokenSource({
          app: extra.githubApp,
          fallbackToken: env.GITHUB_TOKEN ?? null,
          findInstallation: (factoryId, owner) => store.githubInstallation(factoryId, owner),
          onToken: (t) => logger.addSecrets([t]),
          // GITHUB_TOKEN only for the instance's own agencies; the rest, only with their App installation.
          fallbackFactories: extra.tokenFactories,
        })
      : null;
  const repo = guardSiteRepo(
    opts.repo ??
      (tokens
        ? new GitHubSiteRepo(async (project) => (await tokens.tokenFor({ factoryId: project.factory_id, owner: project.repo_owner })).token)
        : new FakeSiteRepo()),
    breakers.github,
    log,
  );
  const agent = guardAgent(opts.agent ?? agentFromEnv(env, { store, tokens, tenant }), breakers.github, log);

  let runner: JobRunner | null = null;
  const wake = () => runner?.wake();
  const deps: WorkerDeps = {
    store,
    channel: guardChannel(channel, breakers.telegram),
    ai: tenant.provider(),
    repo,
    screenshots,
    agent,
    secrets: env.secrets,
    defaultSiteUrl: env.DEMO_SITE_URL ?? LOCAL_SITE_URL,
    panelUrl: env.PANEL_URL,
    transcribe: opts.transcribe !== undefined ? opts.transcribe : createTranscriber(env),
    log,
    onEvent: (e) => {
      if (e.status !== 'inicio') {
        logger.debug(`[evento] ${e.step} ${e.status}`, { request_id: e.requestId, short_id: e.shortId, step: e.step, status: e.status, duration_ms: e.durationMs });
      }
      opts.onEvent?.(e);
    },
  };

  let worker: Worker;
  let commands: App['commands'];
  let cron: Cron | null = null;
  let intake: (u: Incoming) => Promise<void>;
  if (durable) {
    const dw = new DurableWorker(deps, store, wake);
    worker = dw;
    runner = new JobRunner({
      store,
      workerId: extra.workerId,
      handlers: durableHandlers({
        worker: dw,
        store,
        channel,
        tenant,
        log,
        limits: { ...DEFAULT_LIMITS, agencyRequests: extra.agencyRateLimit, ...opts.limits },
      }),
      queues: DEFAULT_QUEUES.map((q) => ({ ...q, concurrency: q.name === 'agent' ? extra.concurrency.agent : extra.concurrency.default })),
      log,
      redact: (s) => redact(s, env.secrets),
      onDead: onDeadJob(dw, store, log),
    });
    commands = new CommandIntake(store, wake, log);
    cron = new Cron(store, wake, log);
    const updates = new UpdateIntake(store, wake, log);
    intake = async (u) => {
      await updates.accept(u);
    };
  } else {
    worker = new Worker(deps);
    commands = new CommandPoller(store, worker, env.secrets, log);
    intake = (u) => worker.handle(u);
  }

  const app: App = {
    worker,
    store,
    channel,
    commands,
    mode: durable ? 'durable' : 'memoria',
    schema,
    runner,
    cron,
    breakers,
    tenant,
    logger,
    intake,
    async idle() {
      for (let i = 0; i < 100; i++) {
        await worker.idle();
        if (!runner) return;
        const n = await runner.drainOnce();
        if (n === 0 && worker.fast.size === 0 && worker.slow.size === 0) return worker.idle();
      }
    },
    readiness(more = {}) {
      return {
        base: async () => {
          await store.getProject(NIL);
          return { ok: true, detail: `${store.kind}${store.kind === 'postgres' ? (schema.r1 ? ', con 0004' : ', sin 0004') : ''}` };
        },
        cola: async () => (runner ? { ok: runner.isRunning, detail: runner.isRunning ? 'durable' : 'detenida' } : { ok: true, detail: 'en memoria' }),
        ...more,
      };
    },
    async metrics() {
      const jobs = runner ? await store.jobsSummary().catch(() => []) : [];
      const s = runner?.stats;
      const stateValue = { closed: 0, half_open: 1, open: 2 } as const;
      return prometheus([
        {
          name: 'walt_jobs',
          help: 'Trabajos en la cola durable por cola y estado (failed: dead letter de los últimos 7 días)',
          type: 'gauge',
          values: jobs.map((j) => ({ labels: { queue: j.queue, status: j.status }, value: j.total })),
        },
        {
          name: 'walt_jobs_oldest_seconds',
          help: 'Antigüedad del trabajo más viejo por cola y estado',
          type: 'gauge',
          values: jobs.map((j) => ({ labels: { queue: j.queue, status: j.status }, value: j.oldest ? (Date.now() - Date.parse(j.oldest)) / 1000 : 0 })),
        },
        {
          name: 'walt_runner_jobs_total',
          help: 'Trabajos de este proceso por resultado',
          type: 'counter',
          values: s
            ? [
                { labels: { result: 'done' }, value: s.done },
                { labels: { result: 'retried' }, value: s.retried },
                { labels: { result: 'dead' }, value: s.dead },
              ]
            : [],
        },
        { name: 'walt_runner_running', help: 'Trabajos corriendo en este proceso', type: 'gauge', values: [{ value: s?.running ?? 0 }] },
        {
          name: 'walt_breaker_state',
          help: 'Circuito por dependencia: 0 cerrado, 1 probando, 2 abierto',
          type: 'gauge',
          values: breakers.all().map((b) => ({ labels: { dependency: b.name }, value: stateValue[b.state] })),
        },
        {
          name: 'walt_breaker_opens_total',
          help: 'Veces que se abrió el circuito de cada dependencia',
          type: 'counter',
          values: breakers.all().map((b) => ({ labels: { dependency: b.name }, value: b.opens })),
        },
        { name: 'walt_process_rss_bytes', help: 'Memoria residente del proceso', type: 'gauge', values: [{ value: process.memoryUsage().rss }] },
      ]);
    },
    async close() {
      commands.stop();
      cron?.stop();
      await runner?.stop();
      await worker.idle();
      await screenshots.close();
      await store.close();
    },
  };
  return app;
}
