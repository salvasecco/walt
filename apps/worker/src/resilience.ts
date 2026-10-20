import type { AiProvider } from '@walt/ai';
import type { Screenshotter } from './capture.js';
import type { Channel, OutMessage } from './channel/types.js';
import type { AgentLane } from './pipeline.js';
import { TimeoutError, withTimeout } from './queue.js';
import type { SiteRepo } from './site/repo.js';

/**
 * Timeouts, retries with backoff (honoring Retry-After on 429) and circuit breakers for the outside
 * world: the model, GitHub, the hosting of the sites (Vercel: previews and captures) and Telegram.
 * A breaker that is open fails at once, so a provider that is down does not make every request wait
 * for its timeout; the pipeline turns the error into `derivado` as with any other failure.
 */

export class CircuitOpenError extends Error {
  constructor(readonly dependency: string, readonly retryInMs: number) {
    super(`${dependency} no responde: pausado ${Math.ceil(retryInMs / 1000)} s`);
    this.name = 'CircuitOpenError';
  }
}

/** HTTP-ish status of an error from fetch, the Anthropic SDK, octokit or grammY. */
export function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown; error_code?: unknown; response?: { status?: unknown } } | null;
  for (const v of [e?.status, e?.statusCode, e?.error_code, e?.response?.status]) {
    if (typeof v === 'number') return v;
  }
  return undefined;
}

function header(err: unknown, name: string): string | undefined {
  const e = err as { headers?: unknown; response?: { headers?: unknown } } | null;
  for (const h of [e?.headers, e?.response?.headers]) {
    if (!h) continue;
    if (typeof (h as Headers).get === 'function') {
      const v = (h as Headers).get(name);
      if (v) return v;
    } else {
      const v = (h as Record<string, unknown>)[name] ?? (h as Record<string, unknown>)[name.toLowerCase()];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
    }
  }
  return undefined;
}

/** How long the provider asks to wait: Retry-After (seconds or date), GitHub's rate-limit reset, or Telegram's retry_after. */
export function retryAfterMs(err: unknown, now = Date.now()): number | undefined {
  const ra = header(err, 'retry-after');
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  if (header(err, 'x-ratelimit-remaining') === '0') {
    const reset = Number(header(err, 'x-ratelimit-reset'));
    if (Number.isFinite(reset)) return Math.max(0, reset * 1000 - now);
  }
  const tg = (err as { parameters?: { retry_after?: unknown } } | null)?.parameters?.retry_after;
  if (typeof tg === 'number') return tg * 1000;
  return undefined;
}

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
const NETWORK_CODES = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|UND_ERR|fetch failed|socket hang up|network/i;

/** Worth retrying: timeouts, network errors, 429 and 5xx (and Anthropic's 529 overloaded). */
export function isTransient(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  const status = errorStatus(err);
  // GitHub's secondary rate limit comes as 403 with a Retry-After header (or with the limit at zero).
  if (status === 403) return retryAfterMs(err) !== undefined;
  if (status !== undefined) return TRANSIENT_STATUS.has(status);
  if (retryAfterMs(err) !== undefined) return true;
  const e = err as { code?: unknown; message?: unknown; name?: unknown } | null;
  return NETWORK_CODES.test(`${String(e?.code ?? '')} ${String(e?.message ?? '')} ${String(e?.name ?? '')}`);
}

/** A failure that says something about the dependency's health (not a validation error of ours). */
export function isInfraFailure(err: unknown): boolean {
  if (err instanceof CircuitOpenError) return false;
  const status = errorStatus(err);
  if (status === 403 && retryAfterMs(err) !== undefined) return true;
  return isTransient(err);
}

export interface BreakerOptions {
  /** Consecutive infra failures that open it. Default 5. */
  failureThreshold?: number;
  /** How long it stays open before letting one call through. Default 30 s. */
  cooldownMs?: number;
  isFailure?: (err: unknown) => boolean;
  now?: () => number;
  onChange?: (state: BreakerState, name: string) => void;
}

export type BreakerState = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  state: BreakerState = 'closed';
  failures = 0;
  opens = 0;
  private openedAt = 0;
  private probing = false;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly isFailure: (err: unknown) => boolean;
  private readonly now: () => number;

  constructor(readonly name: string, private readonly opts: BreakerOptions = {}) {
    this.threshold = opts.failureThreshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.isFailure = opts.isFailure ?? isInfraFailure;
    this.now = opts.now ?? Date.now;
  }

  private set(state: BreakerState): void {
    if (state === this.state) return;
    this.state = state;
    if (state === 'open') this.opens++;
    this.opts.onChange?.(state, this.name);
  }

  /** Throws CircuitOpenError when open (or while the half-open probe is out). */
  check(): void {
    if (this.state === 'open') {
      const left = this.openedAt + this.cooldownMs - this.now();
      if (left > 0) throw new CircuitOpenError(this.name, left);
      this.set('half_open');
    }
    if (this.state === 'half_open' && this.probing) throw new CircuitOpenError(this.name, this.cooldownMs);
  }

  success(): void {
    this.failures = 0;
    this.probing = false;
    this.set('closed');
  }

  failure(err: unknown): void {
    this.probing = false;
    if (!this.isFailure(err)) {
      if (this.state === 'half_open') this.set('closed');
      return;
    }
    this.failures++;
    if (this.state === 'half_open' || this.failures >= this.threshold) {
      this.openedAt = this.now();
      this.set('open');
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.check();
    if (this.state === 'half_open') this.probing = true;
    try {
      const r = await fn();
      this.success();
      return r;
    } catch (err) {
      this.failure(err);
      throw err;
    }
  }
}

export interface RetryOptions {
  /** Extra attempts after the first. */
  retries: number;
  baseMs?: number;
  maxMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  /** Longest Retry-After we are willing to wait; longer ones fail now. Default 20 s. */
  maxRetryAfterMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (err: unknown, attempt: number, waitMs: number) => void;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retries transient errors with exponential backoff and jitter, honoring Retry-After. */
export async function retrying<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 8_000;
  const should = opts.shouldRetry ?? isTransient;
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= opts.retries || !should(err) || err instanceof CircuitOpenError) throw err;
      const asked = retryAfterMs(err);
      if (asked !== undefined && asked > (opts.maxRetryAfterMs ?? 20_000)) throw err;
      const backoff = Math.min(max, base * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      const wait = Math.max(asked ?? 0, backoff);
      opts.onRetry?.(err, attempt + 1, wait);
      await sleep(wait);
    }
  }
}

/** One breaker per dependency, for the wrappers and for /metrics. */
export class Breakers {
  readonly model: CircuitBreaker;
  readonly github: CircuitBreaker;
  readonly hosting: CircuitBreaker;
  readonly telegram: CircuitBreaker;
  constructor(opts: BreakerOptions = {}) {
    this.model = new CircuitBreaker('modelo', opts);
    this.github = new CircuitBreaker('GitHub', opts);
    this.hosting = new CircuitBreaker('hosting (Vercel)', { ...opts, failureThreshold: opts.failureThreshold ?? 3, cooldownMs: opts.cooldownMs ?? 60_000 });
    this.telegram = new CircuitBreaker('Telegram', opts);
  }
  all(): CircuitBreaker[] {
    return [this.model, this.github, this.hosting, this.telegram];
  }
}

type Log = (line: string) => void;

/**
 * The model: breaker, plus one more try on a 429/529 the SDK already retried (if the provider asks
 * for 10 s or less). The pipeline keeps its own timeouts (45 s to interpret).
 */
export function guardAi(ai: AiProvider, breaker: CircuitBreaker, log: Log = () => {}): AiProvider {
  const call = <T>(what: string, fn: () => Promise<T>) =>
    breaker.run(() =>
      retrying(() => fn(), {
        retries: 1,
        baseMs: 2_000,
        maxRetryAfterMs: 10_000,
        shouldRetry: (err) => [429, 529].includes(errorStatus(err) ?? 0),
        onRetry: (err, n, ms) => log(`[modelo] ${what}: ${errorStatus(err)}, reintento ${n} en ${Math.round(ms / 1000)} s`),
      }),
    );
  return {
    name: ai.name,
    interpret: (input) => call('interpretar', () => ai.interpret(input)),
    answerConsulta: (input) => call('consulta', () => ai.answerConsulta(input)),
    draftQuote: (input) => call('presupuesto', () => ai.draftQuote(input)),
    transcribe: (audio, mime) => ai.transcribe(audio, mime),
  };
}

/** The site's repo on GitHub: up to 2 retries on transient errors and rate limits, behind the GitHub breaker. */
export function guardSiteRepo(repo: SiteRepo, breaker: CircuitBreaker, log: Log = () => {}): SiteRepo {
  const opts = (what: string) => ({
    retries: 2,
    baseMs: 1_000,
    onRetry: (err: unknown, n: number, ms: number) => log(`[github] ${what}: ${errorStatus(err) ?? 'error de red'}, reintento ${n} en ${Math.round(ms / 1000)} s`),
  });
  return {
    get mode() {
      return repo.mode;
    },
    loadContract: (project) => breaker.run(() => retrying(() => repo.loadContract(project), opts('contrato'))),
    commitContent: (project, config, content, message) =>
      breaker.run(() => retrying(() => repo.commitContent(project, config, content, message), opts('commit'))),
  };
}

/**
 * The code lane: merge, revert and close retry transient GitHub errors behind the breaker. The agent run
 * itself is not retried here (it is long and already falls back to another model); it only counts for
 * the breaker. Watching the deploy (Vercel's status on GitHub) already polls until its deadline.
 */
export function guardAgent(lane: AgentLane, breaker: CircuitBreaker, log: Log = () => {}): AgentLane {
  const opts = (what: string) => ({
    retries: 2,
    baseMs: 1_500,
    onRetry: (err: unknown, n: number, ms: number) => log(`[github] ${what}: ${errorStatus(err) ?? 'error de red'}, reintento ${n} en ${Math.round(ms / 1000)} s`),
  });
  return {
    runCodeChange: (input) => breaker.run(() => lane.runCodeChange(input)),
    mergeChange: (input) => breaker.run(() => retrying(() => lane.mergeChange(input), opts('merge'))),
    revertChange: (input) => breaker.run(() => retrying(() => lane.revertChange(input), opts('revert'))),
    ...(lane.closeChange ? { closeChange: (input) => breaker.run(() => retrying(() => lane.closeChange!(input), opts('cerrar PR'))) } : {}),
    ...(lane.waitForDeploy ? { waitForDeploy: (input) => lane.waitForDeploy!(input) } : {}),
  } as AgentLane;
}

/**
 * Captures of the sites (Vercel): a capture that fails returns null (the link goes instead). After 3 in a
 * row the hosting breaker opens and captures are skipped for a minute, instead of 25 s per request.
 */
export function guardScreenshots(s: Screenshotter, breaker: CircuitBreaker, log: Log = () => {}): Screenshotter {
  if (!s.enabled) return s;
  return {
    enabled: true,
    warm: s.warm ? () => s.warm!() : undefined,
    close: () => s.close(),
    async capture(url) {
      try {
        breaker.check();
      } catch {
        log('[captura] el sitio viene fallando: mando el link sin captura');
        return null;
      }
      const photo = await s.capture(url);
      if (photo) breaker.success();
      else breaker.failure(new TimeoutError('Captura', 0));
      return photo;
    },
  };
}

/** Telegram: 20 s per send and the breaker (grammY's auto-retry already handles 429 with retry_after). */
export function guardChannel<C extends Channel>(channel: C, breaker: CircuitBreaker, timeoutMs = 20_000): C {
  const send = channel.send.bind(channel);
  return Object.assign(Object.create(channel) as C, {
    send: (chatId: number, msg: OutMessage) => breaker.run(() => withTimeout(send(chatId, msg), timeoutMs, 'Envío por Telegram')),
  });
}
