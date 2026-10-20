import { createPrivateKey, createSign, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Octokit } from '@octokit/rest';
import { git, githubAuthEnv } from './git.js';
import type { RepoRef } from './types.js';

/**
 * Where branches go and where PRs live. `GitHubHost` talks to GitHub with octokit;
 * `LocalHost` keeps bare repos and a PR list in a local folder (GITHUB_MODE=fake
 * and tests, no network).
 */
export interface CodeHost {
  readonly kind: 'github' | 'local';
  /** Clone URL without credentials. */
  remoteUrl(repo: RepoRef): string;
  /** Env for git with the credentials (never in the URL). */
  gitAuthEnv(): Record<string, string>;
  createPullRequest(repo: RepoRef, pr: { head: string; base: string; title: string; body: string }): Promise<{ number: number; url: string }>;
  mergePullRequest(repo: RepoRef, prNumber: number, title: string): Promise<{ sha: string }>;
  /** Closes a PR without merging (the agency or the client said no). */
  closePullRequest?(repo: RepoRef, prNumber: number): Promise<void>;
  /** One look for a preview URL of a commit (and its PR, when known); `findPreviewUrl` polls this. */
  previewUrlOnce(repo: RepoRef, sha: string, prNumber?: number): Promise<string | undefined>;
  /** State of the hosting deploy of a commit (Vercel's commit status), if there is one yet. */
  deployStateOnce(repo: RepoRef, sha: string): Promise<'success' | 'pending' | 'failure' | undefined>;
}

export class GitHubHost implements CodeHost {
  readonly kind = 'github' as const;
  private readonly octokit: Octokit;
  constructor(private readonly token: string) {
    if (!token) throw new Error('Falta GITHUB_TOKEN para GitHub');
    this.octokit = new Octokit({ auth: token, userAgent: 'walt-agent' });
  }
  remoteUrl(repo: RepoRef): string {
    return `https://github.com/${repo.owner}/${repo.name}.git`;
  }
  gitAuthEnv(): Record<string, string> {
    return githubAuthEnv(this.token);
  }
  async createPullRequest(repo: RepoRef, pr: { head: string; base: string; title: string; body: string }) {
    const { data } = await this.octokit.rest.pulls.create({ owner: repo.owner, repo: repo.name, ...pr });
    return { number: data.number, url: data.html_url };
  }
  async mergePullRequest(repo: RepoRef, prNumber: number, title: string) {
    const { data } = await this.octokit.rest.pulls.merge({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      merge_method: 'squash',
      commit_title: title,
    });
    if (!data.merged) throw new Error(`GitHub no mergeó el PR #${prNumber}: ${data.message}`);
    return { sha: data.sha };
  }
  async closePullRequest(repo: RepoRef, prNumber: number): Promise<void> {
    await this.octokit.rest.pulls.update({ owner: repo.owner, repo: repo.name, pull_number: prNumber, state: 'closed' });
  }
  async previewUrlOnce(repo: RepoRef, sha: string, prNumber?: number): Promise<string | undefined> {
    const owner = repo.owner;
    const name = repo.name;
    // 1. Deployments for the commit (Vercel's Git integration creates them).
    const { data: deployments } = await this.octokit.rest.repos.listDeployments({ owner, repo: name, sha, per_page: 20 });
    for (const d of deployments) {
      const { data: statuses } = await this.octokit.rest.repos.listDeploymentStatuses({ owner, repo: name, deployment_id: d.id, per_page: 20 });
      const ok = statuses.find((s) => s.state === 'success' && (s.environment_url || s.target_url));
      const url = ok?.environment_url || ok?.target_url;
      if (url && url.startsWith('https://')) return url;
    }
    // 2. Commit statuses as a fallback (only https links to a vercel.app host).
    const { data: statuses } = await this.octokit.rest.repos.listCommitStatusesForRef({ owner, repo: name, ref: sha, per_page: 50 });
    const st = statuses.find((s) => s.state === 'success' && s.target_url && isVercelAppUrl(s.target_url));
    if (st?.target_url) return st.target_url;
    // 3. Vercel's status links to vercel.com, not to the preview; once it is green, the vercel[bot]
    //    comment on the commit's PR carries the vercel.app link.
    if (!statuses.some((s) => s.state === 'success' && s.context === 'Vercel')) return undefined;
    const prNumbers = prNumber
      ? [prNumber]
      : (await this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo: name, commit_sha: sha })).data.map((pr) => pr.number);
    for (const issue_number of prNumbers) {
      const { data: comments } = await this.octokit.rest.issues.listComments({ owner, repo: name, issue_number, per_page: 50 });
      for (const c of comments) {
        if (c.user?.login !== 'vercel[bot]' || !c.body) continue;
        const url = vercelPreviewFromComment(c.body);
        if (url) return url;
      }
    }
    return undefined;
  }
  async deployStateOnce(repo: RepoRef, sha: string) {
    const { data } = await this.octokit.rest.repos.listCommitStatusesForRef({ owner: repo.owner, repo: repo.name, ref: sha, per_page: 50 });
    return currentDeployState(data);
  }
}

/** GitHub returns commit statuses newest first: the first one per context is the current state. */
export function currentDeployState(statuses: { context: string; state: string }[]): 'success' | 'pending' | 'failure' | undefined {
  const st = statuses.find((x) => x.context === 'Vercel');
  if (!st) return undefined;
  return st.state === 'success' ? 'success' : st.state === 'pending' ? 'pending' : 'failure';
}

/** The `[Preview](https://….vercel.app)` link of a vercel[bot] PR comment, if any. */
export function vercelPreviewFromComment(body: string): string | undefined {
  for (const m of body.matchAll(/\[Preview\]\((https:\/\/[^)\s]+)\)/g)) {
    if (isVercelAppUrl(m[1]!)) return m[1];
  }
  return undefined;
}

export function isVercelAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

interface LocalPr {
  number: number;
  head: string;
  base: string;
  title: string;
  body: string;
  state: 'open' | 'merged';
  mergeSha?: string;
}

/** Fake GitHub on disk: `<baseDir>/<owner>/<name>.git` (bare) and `<name>.prs.json`. */
export class LocalHost implements CodeHost {
  readonly kind = 'local' as const;
  constructor(
    readonly baseDir: string,
    private readonly previews: (sha: string) => string | undefined = () => undefined,
  ) {}
  remoteUrl(repo: RepoRef): string {
    return join(this.baseDir, repo.owner, `${repo.name}.git`);
  }
  gitAuthEnv(): Record<string, string> {
    return {};
  }
  private prFile(repo: RepoRef): string {
    return join(this.baseDir, repo.owner, `${repo.name}.prs.json`);
  }
  listPullRequests(repo: RepoRef): LocalPr[] {
    const f = this.prFile(repo);
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as LocalPr[]) : [];
  }
  private savePrs(repo: RepoRef, prs: LocalPr[]): void {
    mkdirSync(join(this.baseDir, repo.owner), { recursive: true });
    writeFileSync(this.prFile(repo), JSON.stringify(prs, null, 2));
  }
  async createPullRequest(repo: RepoRef, pr: { head: string; base: string; title: string; body: string }) {
    const prs = this.listPullRequests(repo);
    const number = prs.length + 1;
    prs.push({ number, ...pr, state: 'open' });
    this.savePrs(repo, prs);
    return { number, url: `file://${this.remoteUrl(repo)}#pr-${number}` };
  }
  async mergePullRequest(repo: RepoRef, prNumber: number, title: string) {
    const prs = this.listPullRequests(repo);
    const pr = prs.find((p) => p.number === prNumber);
    if (!pr) throw new Error(`No existe el PR #${prNumber}`);
    if (pr.state !== 'open') throw new Error(`El PR #${prNumber} ya está mergeado`);
    const work = mkdtempSync(join(tmpdir(), 'walt-merge-'));
    try {
      const o = { cwd: work, home: work };
      await git(['clone', '--quiet', '--branch', pr.base, this.remoteUrl(repo), 'repo'], o);
      const r = { cwd: join(work, 'repo'), home: work };
      await git(['fetch', '--quiet', 'origin', pr.head], r);
      await git(['merge', '--squash', 'FETCH_HEAD'], r);
      await git(['commit', '--quiet', '-m', title], r);
      const sha = (await git(['rev-parse', 'HEAD'], r)).trim();
      await git(['push', '--quiet', 'origin', `HEAD:${pr.base}`], r);
      pr.state = 'merged';
      pr.mergeSha = sha;
      this.savePrs(repo, prs);
      return { sha };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  async previewUrlOnce(_repo: RepoRef, sha: string) {
    return this.previews(sha);
  }
  async deployStateOnce() {
    return 'success' as const;
  }
}

// ───────────────────────── GitHub App (one installation per agency) ─────────────────────────

/** Credentials of Walt's GitHub App (GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY). Never log the key. */
export interface GitHubAppCredentials {
  appId: string;
  /** PEM. Accepts literal `\\n` (one-line env files) and base64 of the PEM. */
  privateKey: string;
}

function b64url(data: string | Buffer): string {
  return Buffer.from(data).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** The PEM from an env value: with real newlines, `\\n` escapes, or base64 of the whole PEM. */
export function parsePrivateKey(value: string): KeyObject {
  let pem = value.trim();
  if (!pem.includes('BEGIN')) pem = Buffer.from(pem, 'base64').toString('utf8');
  pem = pem.replace(/\\n/g, '\n');
  return createPrivateKey(pem);
}

/** JWT of the App (RS256): issued 60 s in the past for clock skew, valid 9 minutes (GitHub allows 10). */
export function githubAppJwt(appId: string, key: KeyObject, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 9 * 60, iss: appId }));
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(key);
  return `${header}.${payload}.${b64url(signature)}`;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
}

/**
 * Installation tokens of the App (`POST /app/installations/{id}/access_tokens`, valid one hour), cached
 * until 5 minutes before they expire. Only the permissions Walt uses are requested.
 */
export class GitHubAppTokens {
  private readonly key: KeyObject;
  private readonly cache = new Map<number, InstallationToken>();
  private readonly inflight = new Map<number, Promise<InstallationToken>>();

  constructor(
    private readonly app: GitHubAppCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly apiUrl = 'https://api.github.com',
  ) {
    this.key = parsePrivateKey(app.privateKey);
  }

  /** Least privilege for what Walt does with a repo: branches, commits, PRs, merge, and reading deploy statuses. */
  static readonly PERMISSIONS = { contents: 'write', pull_requests: 'write', statuses: 'read', deployments: 'read', metadata: 'read' } as const;

  async token(installationId: number): Promise<InstallationToken> {
    const hit = this.cache.get(installationId);
    if (hit && Date.parse(hit.expiresAt) - Date.now() > 5 * 60_000) return hit;
    let p = this.inflight.get(installationId);
    if (!p) {
      p = this.mint(installationId).finally(() => this.inflight.delete(installationId));
      this.inflight.set(installationId, p);
    }
    return p;
  }

  private async mint(installationId: number): Promise<InstallationToken> {
    const res = await this.fetchImpl(`${this.apiUrl}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${githubAppJwt(this.app.appId, this.key)}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'walt-agent',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ permissions: GitHubAppTokens.PERMISSIONS }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status !== 201) {
      // GitHub's message only (never the JWT).
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw Object.assign(new Error(`GitHub no dio un token para la instalación ${installationId}: HTTP ${res.status} ${body?.message ?? ''}`.trim()), {
        status: res.status,
        headers: res.headers,
      });
    }
    const data = (await res.json()) as { token: string; expires_at: string };
    const t = { token: data.token, expiresAt: data.expires_at };
    this.cache.set(installationId, t);
    return t;
  }
}

export interface RepoToken {
  token: string;
  /** `app`: an installation token of the agency; `token`: the GITHUB_TOKEN fallback. */
  source: 'app' | 'token';
  installationId?: number;
}

/** Where the GitHub credentials for a repo come from. */
export interface GitHubTokenSource {
  tokenFor(target: { factoryId: string | null; owner: string }): Promise<RepoToken>;
}

export interface TokenSourceOptions {
  /** Walt's App; without it every repo uses `fallbackToken`. */
  app?: GitHubAppCredentials | null;
  /** GITHUB_TOKEN: used when the agency has no installation for the repo's owner. */
  fallbackToken?: string | null;
  /** The agency's installation for an owner (`github_installations`). */
  findInstallation: (factoryId: string, owner: string) => Promise<{ installation_id: number } | null>;
  /** Each new token, to add it to the values that are redacted. */
  onToken?: (token: string) => void;
  fetchImpl?: typeof fetch;
}

/**
 * The agency's App installation for the repo's owner if there is one; otherwise GITHUB_TOKEN. An
 * installation is only used for its own agency's projects (the factory comes from the project), so an
 * agency can never act on another agency's repos through the App.
 */
export function githubTokenSource(opts: TokenSourceOptions): GitHubTokenSource {
  const tokens = opts.app ? new GitHubAppTokens(opts.app, opts.fetchImpl) : null;
  return {
    async tokenFor({ factoryId, owner }) {
      if (tokens && factoryId) {
        const inst = await opts.findInstallation(factoryId, owner);
        if (inst) {
          const t = await tokens.token(Number(inst.installation_id));
          opts.onToken?.(t.token);
          return { token: t.token, source: 'app', installationId: Number(inst.installation_id) };
        }
      }
      if (!opts.fallbackToken) {
        throw new Error(`No hay credenciales de GitHub para ${owner}: falta instalar la GitHub App en esa cuenta (o GITHUB_TOKEN)`);
      }
      return { token: opts.fallbackToken, source: 'token' };
    },
  };
}
