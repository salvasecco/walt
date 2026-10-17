/**
 * Code lane with the Claude Agent SDK (SPEC §11). Interface only: 04-agente-eval implements it.
 */

export interface RepoRef {
  owner: string;
  name: string;
  defaultBranch: string;
}

export interface RunCodeChangeInput {
  repo: RepoRef;
  requestId: string;
  shortId: string;
  /** The brief written for the agent, never the client's raw text. */
  instruction: string;
  protectedGlobs?: string[];
  /** Default 300000. */
  timeoutMs?: number;
}

export interface RunCodeChangeResult {
  branch: string;
  commitSha: string;
  prNumber: number;
  prUrl: string;
  diff: string;
  changedFiles: string[];
  previewUrl?: string;
  logs: string[];
}

export const DEFAULT_PROTECTED_GLOBS = [
  'package.json',
  '**/package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  '**/*.config.*',
  '.github/**',
  '.env*',
  '**/.env*',
  'next.config.*',
  'middleware.*',
  'proxy.*',
];

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what}: no implementado todavía (lo hace 04-agente-eval)`);
    this.name = 'NotImplementedError';
  }
}

export async function runCodeChange(_input: RunCodeChangeInput): Promise<RunCodeChangeResult> {
  throw new NotImplementedError('runCodeChange');
}

export async function mergeChange(_input: { repo: RepoRef; prNumber: number }): Promise<{ mergeSha: string }> {
  throw new NotImplementedError('mergeChange');
}

export async function revertChange(_input: { repo: RepoRef; mergeSha: string; shortId: string }): Promise<{ revertSha: string }> {
  throw new NotImplementedError('revertChange');
}

export async function findPreviewUrl(_input: { repo: RepoRef; sha: string; timeoutMs?: number }): Promise<string | undefined> {
  throw new NotImplementedError('findPreviewUrl');
}
