/**
 * Code lane with the Claude Agent SDK (SPEC §11).
 *
 * The four public functions keep the SPEC signatures and read their configuration
 * from `loadEnv()`: GITHUB_MODE picks GitHub (octokit) or the local fake host, and
 * LLM_PROVIDER picks the model for the agent. Each takes an optional last argument
 * with explicit dependencies, for tests and for the worker.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv, type WaltEnv } from '@walt/core';
import {
  findPreviewUrlWith,
  mergeChangeWith,
  revertChangeWith,
  runCodeChangeWith,
  type AgentDeps,
} from './code-change.js';
import { GitHubHost, LocalHost, type CodeHost } from './hosts.js';
import { createClaudeAgentRunner } from './runner.js';
import type { RepoRef, RunCodeChangeInput, RunCodeChangeResult } from './types.js';

export type { RepoRef, RunCodeChangeInput, RunCodeChangeResult } from './types.js';
export { DEFAULT_MAX_TURNS, DEFAULT_PROTECTED_GLOBS, DiffRejectedError, runCodeChangeWith, mergeChangeWith, revertChangeWith, findPreviewUrlWith } from './code-change.js';
export type { AgentDeps } from './code-change.js';
export { GitHubHost, LocalHost, currentDeployState, isVercelAppUrl, vercelPreviewFromComment, type CodeHost } from './hosts.js';
export { createClaudeAgentRunner, guardHook, agentPrompt, type AgentRunner, type AgentRunInput, type AgentRunOutput } from './runner.js';
export { checkPath, evaluateToolUse, AGENT_TOOLS, ALWAYS_PROTECTED } from './guard.js';
export { reviewDiff, addedLines } from './review.js';
export { classifyDiff, protectedGlobsFor, SIMPLE_CHANGE_HINT, type ClassifyDiffInput, type DiffClassification } from './classify.js';
export { buildAgentEnv, agentModelId } from './agent-env.js';

/** Folder of the fake GitHub (GITHUB_MODE=fake): bare repos and PR lists. */
export const FAKE_GITHUB_DIR = join(tmpdir(), 'walt-fake-github');

export function createHost(env: WaltEnv): CodeHost {
  if (env.GITHUB_MODE === 'real') return new GitHubHost(env.GITHUB_TOKEN ?? '');
  return new LocalHost(FAKE_GITHUB_DIR);
}

/** Dependencies from the environment: GitHub or local host, Claude Agent SDK runner. */
/** Opus runs only when the default agent model (Sonnet) fails: error, no changes or a rejected diff. */
export const AGENT_FALLBACK_MODEL = 'claude-opus-5-5';

export function agentModels(primary: string): string[] {
  return primary === AGENT_FALLBACK_MODEL ? [primary] : [primary, AGENT_FALLBACK_MODEL];
}

export function createAgentDeps(env: WaltEnv = loadEnv()): AgentDeps {
  return { host: createHost(env), runner: createClaudeAgentRunner(env), secrets: env.secrets, models: agentModels(env.MODEL_AGENT) };
}

export async function runCodeChange(input: RunCodeChangeInput, deps?: AgentDeps): Promise<RunCodeChangeResult> {
  return runCodeChangeWith(input, deps ?? createAgentDeps());
}

export async function mergeChange(input: { repo: RepoRef; prNumber: number }, host?: CodeHost): Promise<{ mergeSha: string }> {
  return mergeChangeWith(input, host ?? createHost(loadEnv()));
}

/** Closes the PR of a change that will not be published. Hosts without PRs do nothing. */
export async function closeChange(input: { repo: RepoRef; prNumber: number }, host?: CodeHost): Promise<void> {
  const h = host ?? createHost(loadEnv());
  await h.closePullRequest?.(input.repo, input.prNumber);
}

export async function revertChange(
  input: { repo: RepoRef; mergeSha: string; shortId: string },
  host?: CodeHost,
): Promise<{ revertSha: string }> {
  const env = loadEnv();
  return revertChangeWith(input, host ?? createHost(env), env.secrets);
}

export async function findPreviewUrl(input: { repo: RepoRef; sha: string; timeoutMs?: number }, host?: CodeHost): Promise<string | undefined> {
  return findPreviewUrlWith(input, host ?? createHost(loadEnv()));
}

/**
 * Waits until the hosting deploy of `sha` (usually the merge on the default branch) is live.
 * True when it is green; false on failure or after `timeoutMs` (default 4 minutes).
 */
export async function waitForDeploy(
  input: { repo: RepoRef; sha: string; timeoutMs?: number; pollMs?: number },
  host?: CodeHost,
): Promise<boolean> {
  const h = host ?? createHost(loadEnv());
  const pollMs = input.pollMs ?? 2_000;
  const deadline = Date.now() + (input.timeoutMs ?? 240_000);
  for (;;) {
    try {
      const state = await h.deployStateOnce(input.repo, input.sha);
      if (state === 'success') return true;
      if (state === 'failure') return false;
    } catch {
      // Transient API errors: keep polling until the deadline.
    }
    if (Date.now() + pollMs > deadline) return false;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
