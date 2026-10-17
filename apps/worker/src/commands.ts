import { redact } from '@dale/core';
import type { Worker } from './pipeline.js';
import type { Store } from './store/types.js';

/**
 * Panel commands (SPEC §9): reads `commands` in `pendiente` every second, runs them in
 * order and marks them `hecho` or `error`.
 */
export class CommandPoller {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly store: Store,
    private readonly worker: Worker,
    private readonly secrets: string[],
    private readonly log: (l: string) => void = (l) => console.log(l),
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

  /** One pass. Returns how many commands ran. */
  async tick(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let n = 0;
    try {
      const pending = await this.store.pendingCommands(20);
      for (const cmd of pending) {
        n++;
        try {
          await this.worker.runCommand(cmd);
          await this.store.finishCommand(cmd.id, 'hecho');
          this.log(`[comando] ${cmd.type} ${cmd.request_id ?? ''} → hecho`);
        } catch (err) {
          const msg = redact(err instanceof Error ? err.message : String(err), this.secrets);
          await this.store.finishCommand(cmd.id, 'error', msg);
          this.log(`[comando] ${cmd.type} ${cmd.request_id ?? ''} → error: ${msg}`);
        }
      }
    } catch (err) {
      this.log(`[comandos] ${redact(err instanceof Error ? err.message : String(err), this.secrets)}`);
    } finally {
      this.busy = false;
    }
    return n;
  }
}
