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
