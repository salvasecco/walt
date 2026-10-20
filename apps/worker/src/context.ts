import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * What the worker is doing right now, carried across awaits: the durable job and, when known, its
 * project and request. Logs add it as fields, and the per-agency AI provider and GitHub tokens use the
 * project to pick the agency's key or installation. Outside a job (console, dry-run, tests) it is empty.
 */
export interface WorkContext {
  jobId?: string;
  kind?: string;
  attempt?: number;
  projectId?: string | null;
  requestId?: string | null;
}

const storage = new AsyncLocalStorage<WorkContext>();

export function currentWork(): WorkContext | undefined {
  return storage.getStore();
}

export function runWithWork<T>(ctx: WorkContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}
