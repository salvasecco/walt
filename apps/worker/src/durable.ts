import { copy, type CommandRow, type JobRow, type RequestStatus } from '@walt/core';
import { fromPayload, toPayload, type Channel, type Incoming, type IncomingPayload } from './channel/types.js';
import { currentWork } from './context.js';
import { INTERRUPTIBLE, Worker, type WorkerDeps } from './pipeline.js';
import { PermanentJobError, type JobHandler } from './queue.js';
import type { Store } from './store/types.js';
import type { AiResolution, TenantAi } from './tenant.js';

/**
 * The durable queue around the pipeline, without touching it (pipeline.ts belongs to the taxonomy
 * session). The pipeline still hands work to its in-memory queues; here those hand-offs become jobs in
 * Postgres:
 * - every Telegram update is an `incoming` job (deduplicated by update_id) of the chat's project;
 * - `processRequest` and `runAgent`, called by the in-memory queues, enqueue `process_request` and
 *   `run_agent` (queue `agent`) instead of running; the job runs the real one;
 * - every panel command is a `command` job;
 * - `reap` and `purge` are the cron (one instance per time window, by dedupe key).
 * One job at a time per project and queue (claim_job), retries with backoff and a dead letter that ends
 * in `derivado` so no request is left hanging.
 */

export const JOB = {
  incoming: 'incoming',
  processRequest: 'process_request',
  runAgent: 'run_agent',
  command: 'command',
  reap: 'reap',
  purge: 'purge',
} as const;

/** Statuses a process_request job may (re)start from. */
const PROCESSABLE: RequestStatus[] = ['recibido', 'interpretando'];

export class DurableWorker extends Worker {
  constructor(
    deps: WorkerDeps,
    private readonly jobs: Store,
    private readonly wake: () => void = () => {},
  ) {
    super(deps);
  }

  /**
   * The pipeline calls this from its in-memory queue right after creating a request. Outside its own job
   * it enqueues `process_request`; inside the job it runs the real one.
   */
  override async processRequest(requestId: string): Promise<void> {
    const w = currentWork();
    if (w?.kind === JOB.processRequest && w.requestId === requestId) return super.processRequest(requestId);
    try {
      const req = await this.jobs.getRequest(requestId);
      if (!req) return;
      await this.jobs.enqueueJob({ kind: JOB.processRequest, projectId: req.project_id, requestId, dedupeKey: `${JOB.processRequest}:${requestId}` });
      this.wake();
    } catch (err) {
      await this.derive(requestId, err);
    }
  }

  /** Same for the code agent, in the `agent` queue: minutes long, it does not hold up the project's simple changes. */
  override async runAgent(requestId: string): Promise<void> {
    const w = currentWork();
    if (w?.kind === JOB.runAgent && w.requestId === requestId) return super.runAgent(requestId);
    try {
      const req = await this.jobs.getRequest(requestId);
      if (!req) return;
      // Two attempts: a crash mid-run retries once; a second failure goes to the dead letter (derivado).
      await this.jobs.enqueueJob({ kind: JOB.runAgent, queue: 'agent', projectId: req.project_id, requestId, dedupeKey: `${JOB.runAgent}:${requestId}`, maxAttempts: 2 });
      this.wake();
    } catch (err) {
      await this.derive(requestId, err);
    }
  }
}

export interface DurableDeps {
  worker: DurableWorker;
  store: Store;
  /** The channel that sends (for the agency rate limit answer) and rebuilds voice downloads. */
  channel: Channel & { voice?: (fileId: string, mime: string) => () => Promise<{ data: Buffer; mime: string }> };
  tenant?: TenantAi | null;
  log: (line: string) => void;
  limits?: Partial<DurableLimits>;
  now?: () => Date;
}

export interface DurableLimits {
  /** Requests per agency (all its projects) in `agencyWindowMs`. Default 120 in 10 minutes. */
  agencyRequests: number;
  agencyWindowMs: number;
  /** A request stuck in a working status, without a job, for this long goes to derivado. Default 5 min. */
  stuckAfterMs: number;
}

export const DEFAULT_LIMITS: DurableLimits = { agencyRequests: 120, agencyWindowMs: 10 * 60_000, stuckAfterMs: 5 * 60_000 };

/** The handlers of each job kind. */
export function durableHandlers(d: DurableDeps): Record<string, JobHandler> {
  const { worker, store, log } = d;
  const limits = { ...DEFAULT_LIMITS, ...d.limits };
  const now = d.now ?? (() => new Date());
  const factoryOf = new Map<string, string>();

  const agencyOverLimit = async (projectId: string): Promise<boolean> => {
    let factoryId = factoryOf.get(projectId);
    if (!factoryId) {
      factoryId = (await store.getProject(projectId))?.factory_id;
      if (!factoryId) return false;
      factoryOf.set(projectId, factoryId);
    }
    const since = new Date(now().getTime() - limits.agencyWindowMs).toISOString();
    return (await store.countFactoryRequestsSince(factoryId, since)) >= limits.agencyRequests;
  };

  return {
    async [JOB.incoming](job) {
      const payload = job.payload as IncomingPayload | null;
      if (!payload || typeof payload !== 'object' || !('kind' in payload)) throw new PermanentJobError('Update sin datos');
      const voice = d.channel.voice?.bind(d.channel);
      if (payload.kind === 'voice' && !voice) throw new PermanentJobError('Este canal no puede bajar audios');
      const u = fromPayload(payload, voice ?? (() => async () => ({ data: Buffer.alloc(0), mime: '' })));
      // Rate limit per agency (abuse and cost): new requests wait; buttons and answers to open requests go on.
      if ((u.kind === 'text' || u.kind === 'voice') && job.project_id && (await agencyOverLimit(job.project_id))) {
        const contact = await store.getContactByChat(u.chatId);
        if (contact) {
          await store.addMessage({ contact_id: contact.id, direction: 'entrada', text: u.kind === 'text' ? u.text : null, media: u.kind === 'voice' ? { tipo: 'audio' } : null });
          await d.channel.send(u.chatId, { text: copy.colaLlena() }).catch(() => {});
          await store.addMessage({ contact_id: contact.id, direction: 'salida', text: copy.colaLlena(), media: { limite: 'agencia' } });
          log(`[límite] la agencia del proyecto ${job.project_id} pasó ${limits.agencyRequests} pedidos en ${Math.round(limits.agencyWindowMs / 60_000)} min`);
          return;
        }
      }
      await worker.handle(u);
      // Buttons and quick answers run in the pipeline's in-memory queue: the job lasts until they finish.
      await worker.fast.onIdle();
    },

    async [JOB.processRequest](job) {
      if (!job.request_id) throw new PermanentJobError('process_request sin request_id');
      const req = await store.getRequest(job.request_id);
      // Already handled (a retry after it finished, or the reaper derived it): nothing to do.
      if (!req || !PROCESSABLE.includes(req.status)) return;
      await worker.processRequest(req.id);
      await worker.fast.onIdle();
    },

    async [JOB.runAgent](job) {
      if (!job.request_id) throw new PermanentJobError('run_agent sin request_id');
      const req = await store.getRequest(job.request_id);
      if (!req || req.status !== 'agente_trabajando') return;
      if (d.tenant) {
        let res: AiResolution;
        try {
          res = await d.tenant.resolve(req.project_id, req.id);
        } catch (err) {
          // No key, no balance or over the cap: the agent does not run; the client and the agency are told.
          return worker.derive(req.id, err, { expected: true });
        }
        if (res.mode === 'claude_code') {
          return worker.derive(
            req.id,
            new Error('Este proyecto usa la sesión de Claude Code de la agencia: el cambio de código lo hace la agencia (el puente con Walt llega en el R2)'),
            { expected: true },
          );
        }
      }
      await worker.runAgent(req.id);
    },

    async [JOB.command](job) {
      const cmd = job.payload as CommandRow | null;
      if (!cmd?.id || !cmd.type) throw new PermanentJobError('Comando sin datos');
      try {
        await worker.runCommand(cmd);
        await store.finishCommand(cmd.id, 'hecho');
        log(`[comando] ${cmd.type} ${cmd.request_id ?? ''} → hecho`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await store.finishCommand(cmd.id, 'error', msg);
        log(`[comando] ${cmd.type} ${cmd.request_id ?? ''} → error: ${msg}`);
      }
    },

    async [JOB.reap]() {
      const n = await reapStuck(worker, store, limits.stuckAfterMs, now);
      if (n > 0) log(`[cola] ${n} pedido(s) colgados sin trabajo pasaron a derivado`);
    },

    async [JOB.purge]() {
      const r = await store.purgeOldRows();
      log(`[cola] limpieza: ${JSON.stringify(r)}`);
    },
  };
}

/**
 * Requests left in a working status (a crash, an old worker) without a pending or running job, and
 * untouched for `stuckAfterMs`, go to derivado with their notices. Returns how many.
 */
export async function reapStuck(worker: Worker, store: Store, stuckAfterMs: number, now: () => Date = () => new Date()): Promise<number> {
  const cutoff = now().getTime() - stuckAfterMs;
  const stuck = (await store.requestsWithStatus(INTERRUPTIBLE)).filter((r) => Date.parse(r.updated_at) < cutoff);
  if (stuck.length === 0) return 0;
  const active = await store.requestsWithActiveJobs(stuck.map((r) => r.id));
  let n = 0;
  for (const r of stuck) {
    if (active.has(r.id)) continue;
    await worker.derive(r.id, new Error('Quedó a mitad de camino (se cortó el worker) y no tenía trabajo pendiente'));
    n++;
  }
  return n;
}

/** Dead letter: the request it was for goes to derivado (with its notices); a command is marked error. */
export function onDeadJob(worker: Worker, store: Store, log: (line: string) => void) {
  return async (job: JobRow, error: string): Promise<void> => {
    if ((job.kind === JOB.processRequest || job.kind === JOB.runAgent) && job.request_id) {
      await worker.derive(job.request_id, new Error(`No se pudo procesar tras ${job.attempts} intento(s): ${error}`));
    } else if (job.kind === JOB.command) {
      const cmd = job.payload as CommandRow | null;
      if (cmd?.id) await store.finishCommand(cmd.id, 'error', error);
    } else {
      log(`[cola] ${job.kind} ${job.id} quedó en el dead letter: ${error}`);
    }
  };
}

/**
 * Entry of the channel's updates: a burst limit per chat (in memory, against button or message spam),
 * then one `incoming` job per update in the chat's project, deduplicated by update_id.
 */
export class UpdateIntake {
  private readonly hits = new Map<number, number[]>();
  constructor(
    private readonly store: Store,
    private readonly wake: () => void,
    private readonly log: (line: string) => void,
    private readonly burst = { max: 20, windowMs: 60_000 },
  ) {}

  /** False when the chat went over the burst limit (the update is dropped). Throws if it cannot enqueue. */
  async accept(u: Incoming): Promise<boolean> {
    const t = Date.now();
    const recent = (this.hits.get(u.chatId) ?? []).filter((x) => t - x < this.burst.windowMs);
    if (recent.length >= this.burst.max) {
      if (recent.length === this.burst.max) this.log(`[límite] el chat ${u.chatId} mandó más de ${this.burst.max} updates en un minuto: se ignoran`);
      recent.push(t);
      this.hits.set(u.chatId, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(u.chatId, recent);
    if (this.hits.size > 10_000) this.hits.clear();

    const payload = toPayload(u);
    if (!payload) throw new Error('Audio sin file_id: no se puede encolar');
    const contact = u.kind === 'start' ? null : await this.store.getContactByChat(u.chatId);
    await this.store.enqueueJob({
      kind: JOB.incoming,
      projectId: contact?.project_id ?? null,
      payload,
      dedupeKey: u.updateId !== undefined ? `tg:${u.updateId}` : null,
    });
    this.wake();
    return true;
  }
}

/**
 * Panel commands into the durable queue: every second it reads `commands` in `pendiente` and enqueues each
 * one once (dedupe `cmd:<id>`) in its request's project, so a command never runs alongside another job of
 * the same project nor twice in two instances. Same shape as CommandPoller.
 */
export class CommandIntake {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly enqueued = new Set<string>();

  constructor(
    private readonly store: Store,
    private readonly wake: () => void,
    private readonly log: (line: string) => void,
    private readonly intervalMs = 1_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let n = 0;
    try {
      for (const cmd of await this.store.pendingCommands(50)) {
        if (this.enqueued.has(cmd.id)) continue;
        const projectId = await this.projectOf(cmd);
        await this.store.enqueueJob({ kind: JOB.command, projectId, requestId: cmd.request_id, payload: cmd, dedupeKey: `cmd:${cmd.id}` });
        this.enqueued.add(cmd.id);
        n++;
      }
      if (this.enqueued.size > 5_000) this.enqueued.clear();
      if (n > 0) this.wake();
    } catch (err) {
      this.log(`[comandos] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busy = false;
    }
    return n;
  }

  private async projectOf(cmd: CommandRow): Promise<string | null> {
    if (cmd.request_id) return (await this.store.getRequest(cmd.request_id))?.project_id ?? null;
    const payload = (cmd.payload ?? {}) as Record<string, unknown>;
    if (typeof payload.project_id === 'string') return payload.project_id;
    if (typeof payload.version_id === 'string') return (await this.store.getVersion(payload.version_id))?.project_id ?? null;
    return null;
  }
}

/**
 * The cron, through the queue: every instance tries to enqueue `reap` every 2 minutes and `purge` every
 * hour with a key per time window, so only one of them runs it.
 */
export class Cron {
  private timers: NodeJS.Timeout[] = [];
  constructor(
    private readonly store: Store,
    private readonly wake: () => void,
    private readonly log: (line: string) => void,
  ) {}

  start(): void {
    const every = (kind: string, ms: number) => {
      const tick = () =>
        this.store
          .enqueueJob({ kind, dedupeKey: `${kind}:${Math.floor(Date.now() / ms)}`, maxAttempts: 1 })
          .then((r) => r.inserted && this.wake())
          .catch((err) => this.log(`[cron] ${kind}: ${err instanceof Error ? err.message : String(err)}`));
      void tick();
      const t = setInterval(tick, ms);
      t.unref();
      this.timers.push(t);
    };
    every(JOB.reap, 2 * 60_000);
    every(JOB.purge, 60 * 60_000);
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
