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
  /** Milliseconds per phase: clone, agent (model editing), pr (diff review + commit + push + PR), preview (waiting for it). */
  timings?: { clone: number; agent: number; pr: number; preview: number };
  /** Agent turns used, when the runner reports them. */
  turns?: number;
}
