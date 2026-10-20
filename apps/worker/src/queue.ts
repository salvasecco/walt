import type { JobRow } from '@walt/core';
import { runWithWork } from './context.js';
import type { Store } from './store/types.js';

/** In-process FIFO queue with concurrency 1 and a max length (SPEC §2, §9). */
export class Queue {
  private readonly items: (() => Promise<void>)[] = [];
  private running = false;
  private idleWaiters: (() => void)[] = [];

  constructor(
    readonly name: string,
    readonly max: number,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  get size(): number {
    return this.items.length + (this.running ? 1 : 0);
  }

  /** False if the queue is full (the job is not added). */
  push(job: () => Promise<void>): boolean {
    if (this.size >= this.max) return false;
    this.items.push(job);
    void this.drain();
    return true;
  }

  /** Resolves when nothing is queued nor running. */
  onIdle(): Promise<void> {
    if (this.size === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.items.length > 0) {
      const job = this.items.shift()!;
      try {
        await job();
      } catch (err) {
        this.onError(err);
      }
    }
    this.running = false;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const w of waiters) w();
  }
}

export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what}: se pasó el tiempo de ${Math.round(ms / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
    }),
  ]);
}

// ───────────────────────── Durable queue (Postgres `jobs`, migration 0004) ─────────────────────────


/** A job error that must not be retried (bad payload, unknown kind): straight to the dead letter. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export type JobHandler = (job: JobRow, ctx: { signal: AbortSignal }) => Promise<void>;

export interface QueueSpec {
  name: string;
  /** Jobs at a time in this process (different projects; the same project never runs two). */
  concurrency: number;
  /** Lease renewed by the heartbeat; a dead worker's jobs come back after it runs out. */
  leaseSeconds: number;
  /** Hard ceiling per job: past it the job fails (and is retried). */
  timeoutMs: number;
}

export const DEFAULT_QUEUES: QueueSpec[] = [
  // Requests, buttons and panel commands. Each step inside has its own timeout (45 s to interpret, …).
  { name: 'default', concurrency: 1, leaseSeconds: 120, timeoutMs: 10 * 60_000 },
  // The code agent: up to 5.5 min plus clone and PR.
  { name: 'agent', concurrency: 1, leaseSeconds: 120, timeoutMs: 15 * 60_000 },
];

export interface JobRunnerOptions {
  store: Store;
  /** Unique per process, e.g. `host:pid:random`. */
  workerId: string;
  handlers: Record<string, JobHandler>;
  queues?: QueueSpec[];
  /** Wait between claims when the queue is empty. Default 1 s (`wake()` cuts it short). */
  pollMs?: number;
  heartbeatMs?: number;
  /** Backoff of the first retry; it doubles each attempt (in the database). Default 5 s. */
  retryBaseSeconds?: number;
  log?: (line: string) => void;
  /** Redacts secrets from errors before they are saved in `jobs.last_error`. */
  redact?: (s: string) => string;
  /** Called once a job lands in the dead letter (to tell the client and the agency). */
  onDead?: (job: JobRow, error: string) => Promise<void>;
}

export interface RunnerStats {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
  running: number;
  lastClaimAt: string | null;
  lastError: string | null;
  claimErrors: number;
}

/**
 * Takes jobs from Postgres (`claim_job`: skip locked, one at a time per project and queue), runs their
 * handler with the job in the work context, renews the lease while it runs, and completes it or fails it
 * (the database schedules the retry with exponential backoff, or moves it to the dead letter).
 */
export class JobRunner {
  readonly queues: QueueSpec[];
  readonly stats: RunnerStats = { claimed: 0, done: 0, retried: 0, dead: 0, running: 0, lastClaimAt: null, lastError: null, claimErrors: 0 };
  private stopping = false;
  private started = false;
  private loops: Promise<void>[] = [];
  private sleepers = new Set<() => void>();
  private readonly log: (line: string) => void;
  private readonly redact: (s: string) => string;

  constructor(private readonly opts: JobRunnerOptions) {
    this.queues = opts.queues ?? DEFAULT_QUEUES;
    this.log = opts.log ?? (() => {});
    this.redact = opts.redact ?? ((s) => s);
  }

  get workerId(): string {
    return this.opts.workerId;
  }
  get isRunning(): boolean {
    return this.started && !this.stopping;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const q of this.queues) for (let i = 0; i < q.concurrency; i++) this.loops.push(this.loop(q));
  }

  /** Something was just enqueued in this process: claim now instead of waiting for the poll. */
  wake(): void {
    for (const s of this.sleepers) s();
    this.sleepers.clear();
  }

  /** Stops claiming and waits up to `graceMs` for running jobs; the rest come back when their lease runs out. */
  async stop(graceMs = 25_000): Promise<void> {
    this.stopping = true;
    this.wake();
    await Promise.race([Promise.all(this.loops), new Promise((r) => setTimeout(r, graceMs).unref())]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        this.sleepers.delete(done);
        resolve();
      };
      const t = setTimeout(done, ms);
      this.sleepers.add(done);
    });
  }

  private async loop(q: QueueSpec): Promise<void> {
    let errors = 0;
    while (!this.stopping) {
      let job: JobRow | null = null;
      try {
        job = await this.opts.store.claimJob(this.opts.workerId, [q.name], q.leaseSeconds);
        errors = 0;
      } catch (err) {
        errors++;
        this.stats.claimErrors++;
        this.log(`[cola ${q.name}] no pude tomar trabajos: ${this.redact(errMessage(err))}`);
        await this.sleep(Math.min(30_000, 1_000 * 2 ** Math.min(errors, 5)));
        continue;
      }
      if (!job) {
        await this.sleep(this.opts.pollMs ?? 1_000);
        continue;
      }
      await this.run(job, q);
    }
  }

  /** Runs one claimed job to the end (complete, retry or dead letter). Never throws. */
  async run(job: JobRow, q: QueueSpec = this.specFor(job.queue)): Promise<void> {
    const { store, workerId } = this.opts;
    this.stats.claimed++;
    this.stats.running++;
    this.stats.lastClaimAt = new Date().toISOString();
    const abort = new AbortController();
    const heartbeat = setInterval(() => {
      store
        .heartbeatJob(job.id, workerId, q.leaseSeconds)
        .then((mine) => {
          if (!mine) this.log(`[cola ${q.name}] ${job.kind} ${job.id}: perdí el lease (otro worker lo tomó)`);
        })
        .catch((err) => this.log(`[cola ${q.name}] heartbeat: ${this.redact(errMessage(err))}`));
    }, this.opts.heartbeatMs ?? Math.max(1_000, (q.leaseSeconds * 1000) / 4));
    heartbeat.unref();
    try {
      const handler = this.opts.handlers[job.kind];
      if (!handler) throw new PermanentJobError(`No hay handler para trabajos "${job.kind}"`);
      await runWithWork({ jobId: job.id, kind: job.kind, attempt: job.attempts, projectId: job.project_id, requestId: job.request_id }, () =>
        withTimeout(handler(job, { signal: abort.signal }), q.timeoutMs, `Trabajo ${job.kind}`),
      );
      await store.completeJob(job.id, workerId);
      this.stats.done++;
    } catch (err) {
      abort.abort();
      const msg = this.redact(errMessage(err)).slice(0, 2000);
      this.stats.lastError = msg;
      try {
        const failed = await store.failJob(job.id, workerId, msg, {
          retry: !(err instanceof PermanentJobError),
          baseSeconds: this.opts.retryBaseSeconds ?? 5,
        });
        if (failed?.dead) {
          this.stats.dead++;
          this.log(`[cola ${q.name}] ${job.kind} ${job.id} al dead letter tras ${failed.attempts} intento(s): ${msg}`);
          await this.opts.onDead?.(failed, msg).catch((e) => this.log(`[cola ${q.name}] aviso del dead letter: ${this.redact(errMessage(e))}`));
        } else if (failed) {
          this.stats.retried++;
          this.log(`[cola ${q.name}] ${job.kind} ${job.id} falló (intento ${failed.attempts}), reintento a las ${failed.run_after}: ${msg}`);
        }
      } catch (e) {
        this.log(`[cola ${q.name}] no pude marcar la falla de ${job.id}: ${this.redact(errMessage(e))}`);
      }
    } finally {
      clearInterval(heartbeat);
      this.stats.running--;
    }
  }

  private specFor(queue: string): QueueSpec {
    return this.queues.find((q) => q.name === queue) ?? DEFAULT_QUEUES[0]!;
  }

  /**
   * Runs, in this call, every job that can be claimed now, one after the other, until none is left.
   * For tests and the console (no loops, no timers). Returns how many ran.
   */
  async drainOnce(maxJobs = 100): Promise<number> {
    let n = 0;
    for (; n < maxJobs; n++) {
      let job: JobRow | null = null;
      for (const q of this.queues) {
        job = await this.opts.store.claimJob(this.opts.workerId, [q.name], q.leaseSeconds);
        if (job) {
          await this.run(job, q);
          break;
        }
      }
      if (!job) break;
    }
    return n;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
