import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redact } from '@dale/core';
import { git } from './git.js';
import type { CodeHost } from './hosts.js';
import { reviewDiff, type DiffFile } from './review.js';
import type { AgentRunner } from './runner.js';
import type { RepoRef, RunCodeChangeInput, RunCodeChangeResult } from './types.js';

export const DEFAULT_PROTECTED_GLOBS = [
  'package.json',
  '**/package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  '**/*.lock',
  '**/*.config.*',
  '.github/**',
  '**/.github/**',
  '.env*',
  '**/.env*',
  'next.config.*',
  'middleware.*',
  '**/middleware.*',
  'proxy.*',
  '**/proxy.*',
  'vercel.json',
  '.npmrc',
  '.claude/**',
  '**/.claude/**',
  // Files that run code or change resolution at install/build time.
  '.yarnrc*',
  'pnpm-workspace.yaml',
  '.babelrc*',
  'babel.config.*',
  'instrumentation.*',
  '**/instrumentation.*',
  '.gitattributes',
  '**/.gitattributes',
  '.gitmodules',
];

export interface AgentDeps {
  host: CodeHost;
  /** Edits the clone. Default comes from `createAgentDeps` (Claude Agent SDK). */
  runner: AgentRunner;
  /** Secret values to keep out of diffs and logs. */
  secrets?: string[];
  maxTurns?: number;
  /** Poll for the Vercel preview after the PR. Default 240000 (4 minutes); 0 skips it. */
  previewTimeoutMs?: number;
  previewPollMs?: number;
}

export class DiffRejectedError extends Error {
  constructor(readonly reasons: string[], readonly logs: string[]) {
    super(`El diff del agente no pasó la revisión: ${reasons.join('; ')}`);
    this.name = 'DiffRejectedError';
  }
}

const SHORT_ID = /^[A-Za-z0-9_-]{1,32}$/;
const REF = /^[A-Za-z0-9._/-]{1,100}$/;

function checkRepo(repo: RepoRef): void {
  if (!/^[\w.-]+$/.test(repo.owner) || !/^[\w.-]+$/.test(repo.name)) throw new Error('Repo inválido');
  if (!REF.test(repo.defaultBranch) || repo.defaultBranch.startsWith('-') || repo.defaultBranch.includes('..')) {
    throw new Error('Rama principal inválida');
  }
}

function firstLine(s: string, max = 72): string {
  const line = s.split('\n').map((l) => l.trim()).find(Boolean) ?? 'cambio de código';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function parseRaw(raw: string): DiffFile[] {
  // `git diff --cached --raw -z`: ":old new oldsha newsha status\0path\0" (renames add a second path).
  const parts = raw.split('\0').filter((p) => p.length > 0);
  const files: DiffFile[] = [];
  for (let i = 0; i < parts.length; ) {
    const meta = parts[i]!;
    const fields = meta.slice(1).split(' ');
    const mode = fields[1];
    const status = fields[4] ?? '';
    const n = status.startsWith('R') || status.startsWith('C') ? 2 : 1;
    for (let k = 1; k <= n; k++) if (parts[i + k] !== undefined) files.push({ path: parts[i + k]!, mode });
    i += n + 1;
  }
  return files;
}

/**
 * Code lane (SPEC §11): clone → branch → agent → diff review → commit → push → PR → preview.
 * Throws `DiffRejectedError` if the diff fails review; nothing is pushed in that case.
 */
export async function runCodeChangeWith(input: RunCodeChangeInput, deps: AgentDeps): Promise<RunCodeChangeResult> {
  checkRepo(input.repo);
  if (!SHORT_ID.test(input.shortId)) throw new Error('shortId inválido');
  if (!input.instruction.trim()) throw new Error('La ficha está vacía');
  const protectedGlobs = input.protectedGlobs ?? DEFAULT_PROTECTED_GLOBS;
  const secrets = deps.secrets ?? [];
  const logs: string[] = [];
  const log = (line: string) => logs.push(redact(line, secrets));
  const branch = `dale/${input.shortId}`;
  const work = realpathSync(mkdtempSync(join(tmpdir(), 'dale-code-')));
  const authEnv = deps.host.gitAuthEnv();
  const g = (args: string[], cwd: string) => git(args, { cwd, home: work, authEnv, secrets });
  try {
    await g(['clone', '--quiet', '--depth', '50', '--branch', input.repo.defaultBranch, '--', deps.host.remoteUrl(input.repo), 'repo'], work);
    const dir = realpathSync(join(work, 'repo'));
    await g(['checkout', '--quiet', '-b', branch], dir);
    log(`clonado ${input.repo.owner}/${input.repo.name} en la rama ${branch}`);

    const timeoutMs = input.timeoutMs ?? 300_000;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let summary: string | undefined;
    const timedOut = new Promise<never>((_, reject) =>
      ac.signal.addEventListener('abort', () => reject(new Error(`El agente superó el tiempo de ${Math.round(timeoutMs / 1000)} s`)), { once: true }),
    );
    timedOut.catch(() => {}); // also aborted on normal exit; only the race cares
    try {
      const out = await Promise.race([
        deps.runner({ cwd: dir, instruction: input.instruction, protectedGlobs, signal: ac.signal, maxTurns: deps.maxTurns ?? 40, log }),
        timedOut,
      ]);
      summary = out.summary;
      log(`agente listo${out.turns ? ` en ${out.turns} turnos` : ''}${out.costUsd !== undefined ? `, USD ${out.costUsd.toFixed(4)}` : ''}`);
    } finally {
      clearTimeout(timer);
      ac.abort();
    }

    await g(['add', '-A'], dir);
    const files = parseRaw(await g(['diff', '--cached', '--raw', '-z', '--no-renames'], dir));
    const diff = await g(['diff', '--cached', '--no-color', '--no-ext-diff'], dir);
    const reasons = reviewDiff({ diff, files, protectedGlobs, secrets });
    if (reasons.length > 0) {
      log(`diff rechazado: ${reasons.join('; ')}`);
      throw new DiffRejectedError(reasons, logs);
    }

    const title = `dale: ${firstLine(summary ?? input.instruction)} (#${input.shortId})`;
    await g(['commit', '--quiet', '--no-verify', '-m', title, '-m', `Pedido ${input.requestId}`], dir);
    const commitSha = (await g(['rev-parse', 'HEAD'], dir)).trim();
    await g(['push', '--quiet', 'origin', `${branch}:refs/heads/${branch}`], dir);
    log(`push de ${branch} (${commitSha.slice(0, 7)})`);

    const body = [
      'Cambio hecho por el agente de Dale, aprobado por la agencia antes de empezar.',
      '',
      '**Ficha:**',
      '',
      input.instruction.split('\n').map((l) => `> ${l}`).join('\n'),
      '',
      summary ? `**Resumen del agente:** ${summary}` : '',
      '',
      `Pedido: \`${input.requestId}\` (#${input.shortId})`,
    ].join('\n');
    const pr = await deps.host.createPullRequest(input.repo, { head: branch, base: input.repo.defaultBranch, title, body: redact(body, secrets) });
    log(`PR #${pr.number}: ${pr.url}`);

    const previewUrl = await findPreviewUrlWith(
      { repo: input.repo, sha: commitSha, timeoutMs: deps.previewTimeoutMs ?? 240_000 },
      deps.host,
      deps.previewPollMs,
    );
    if (previewUrl) log(`vista previa: ${previewUrl}`);
    else log('sin vista previa: la agencia revisa el PR');

    return {
      branch,
      commitSha,
      prNumber: pr.number,
      prUrl: pr.url,
      diff,
      changedFiles: files.map((f) => f.path),
      ...(previewUrl ? { previewUrl } : {}),
      logs,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function mergeChangeWith(input: { repo: RepoRef; prNumber: number }, host: CodeHost): Promise<{ mergeSha: string }> {
  checkRepo(input.repo);
  if (!Number.isInteger(input.prNumber) || input.prNumber <= 0) throw new Error('Número de PR inválido');
  const { sha } = await host.mergePullRequest(input.repo, input.prNumber, `dale: merge del PR #${input.prNumber}`);
  return { mergeSha: sha };
}

/** Revert commit of the (squash) merge on the default branch. */
export async function revertChangeWith(
  input: { repo: RepoRef; mergeSha: string; shortId: string },
  host: CodeHost,
  secrets: string[] = [],
): Promise<{ revertSha: string }> {
  checkRepo(input.repo);
  if (!/^[0-9a-f]{7,64}$/i.test(input.mergeSha)) throw new Error('SHA inválido');
  if (!SHORT_ID.test(input.shortId)) throw new Error('shortId inválido');
  const work = realpathSync(mkdtempSync(join(tmpdir(), 'dale-revert-')));
  const authEnv = host.gitAuthEnv();
  const g = (args: string[], cwd: string) => git(args, { cwd, home: work, authEnv, secrets });
  try {
    await g(['clone', '--quiet', '--branch', input.repo.defaultBranch, '--', host.remoteUrl(input.repo), 'repo'], work);
    const dir = join(work, 'repo');
    const parents = (await g(['rev-list', '--parents', '-n', '1', input.mergeSha], dir)).trim().split(' ').length - 1;
    await g(['revert', '--no-edit', ...(parents > 1 ? ['-m', '1'] : []), input.mergeSha], dir);
    await g(['commit', '--amend', '--quiet', '-m', `dale: revert #${input.shortId}`, '-m', `Revierte ${input.mergeSha}`], dir);
    const revertSha = (await g(['rev-parse', 'HEAD'], dir)).trim();
    await g(['push', '--quiet', 'origin', `HEAD:refs/heads/${input.repo.defaultBranch}`], dir);
    return { revertSha };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Polls the host for a preview URL of `sha` until `timeoutMs` (default 4 minutes). */
export async function findPreviewUrlWith(
  input: { repo: RepoRef; sha: string; timeoutMs?: number },
  host: CodeHost,
  pollMs = 10_000,
): Promise<string | undefined> {
  const deadline = Date.now() + (input.timeoutMs ?? 240_000);
  for (;;) {
    try {
      const url = await host.previewUrlOnce(input.repo, input.sha);
      if (url) return url;
    } catch {
      // Transient API errors: keep polling until the deadline.
    }
    if (Date.now() + pollMs > deadline) return undefined;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
