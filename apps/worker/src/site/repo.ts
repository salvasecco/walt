import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseConfig, type WaltConfig, type ProjectRow } from '@walt/core';
import { bakeryConfig, bakerySchema } from '@walt/core/fixtures';
import { Octokit } from '@octokit/rest';

export interface Contract {
  config: WaltConfig;
  schema: object;
}

/** The site's git repo: reads the content contract and commits each published version (SPEC §6, §9). */
export interface SiteRepo {
  readonly mode: 'real' | 'fake';
  loadContract(project: ProjectRow): Promise<Contract>;
  /** Commits the content JSON in the default branch. Returns the commit sha. */
  commitContent(project: ProjectRow, config: WaltConfig, content: unknown, message: string): Promise<string>;
}

export function serializeContent(content: unknown): string {
  return `${JSON.stringify(content, null, 2)}\n`;
}

/**
 * GITHUB_MODE=fake: the contract is the bakery fixture and commits are written to a local
 * folder (`~/.walt/fake-github/<owner>/<repo>`), with a `commits.log`.
 */
export class FakeSiteRepo implements SiteRepo {
  readonly mode = 'fake' as const;
  readonly commits: { repo: string; path: string; message: string; sha: string }[] = [];
  constructor(
    private readonly root: string | null = join(homedir(), '.walt', 'fake-github'),
    private readonly failWith: string | null = null,
  ) {}

  async loadContract(): Promise<Contract> {
    return { config: bakeryConfig(), schema: bakerySchema() };
  }

  async commitContent(project: ProjectRow, config: WaltConfig, content: unknown, message: string): Promise<string> {
    if (this.failWith) throw new Error(this.failWith);
    const body = serializeContent(content);
    const sha = createHash('sha1').update(`${Date.now()}:${message}:${body}`).digest('hex');
    const repo = `${project.repo_owner}/${project.repo_name}`;
    if (this.root) {
      const file = join(this.root, project.repo_owner, project.repo_name, config.content);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
      appendFileSync(join(this.root, project.repo_owner, project.repo_name, 'commits.log'), `${new Date().toISOString()} ${sha.slice(0, 7)} ${message}\n`);
    }
    this.commits.push({ repo, path: config.content, message, sha });
    return sha;
  }
}

/** The GitHub token for a project's repo: the agency's App installation, or GITHUB_TOKEN (R1). */
export type RepoTokenFor = (project: ProjectRow) => Promise<string>;

/** GITHUB_MODE=real: octokit over the contents API. */
export class GitHubSiteRepo implements SiteRepo {
  readonly mode = 'real' as const;
  private readonly fixed: Octokit | null;
  private readonly clients = new Map<string, Octokit>();
  private readonly cache = new Map<string, { at: number; contract: Contract }>();
  private readonly refreshing = new Set<string>();

  /** A fixed token (or octokit, in tests), or a function that picks the token per project. */
  constructor(private readonly token: string | RepoTokenFor, octokit?: Octokit) {
    this.fixed = octokit ?? (typeof token === 'string' ? new Octokit({ auth: token, request: { timeout: 15_000 } }) : null);
  }

  private async clientFor(project: ProjectRow): Promise<Octokit> {
    if (this.fixed) return this.fixed;
    const token = await (this.token as RepoTokenFor)(project);
    let client = this.clients.get(token);
    if (!client) {
      // Installation tokens last an hour: keep a few clients, drop the old ones.
      if (this.clients.size >= 20) this.clients.clear();
      client = new Octokit({ auth: token, request: { timeout: 15_000 } });
      this.clients.set(token, client);
    }
    return client;
  }

  private async readJson(project: ProjectRow, path: string): Promise<unknown> {
    const octokit = await this.clientFor(project);
    const res = await octokit.repos.getContent({
      owner: project.repo_owner,
      repo: project.repo_name,
      path,
      ref: project.default_branch,
    });
    const data = res.data as { content?: string; encoding?: string };
    if (!data.content) throw new Error(`${path} no es un archivo`);
    return JSON.parse(Buffer.from(data.content, (data.encoding as BufferEncoding) ?? 'base64').toString('utf8'));
  }

  /**
   * Contract with stale-while-revalidate: a cached one older than 60 s is returned at once and
   * refreshed in the background, so only the very first request pays the two GitHub reads.
   */
  async loadContract(project: ProjectRow): Promise<Contract> {
    // Per agency too: two agencies pointing at the same repo never share what one of them could read.
    const key = `${project.factory_id}:${project.repo_owner}/${project.repo_name}@${project.default_branch}`;
    const hit = this.cache.get(key);
    if (hit) {
      if (Date.now() - hit.at >= 60_000 && !this.refreshing.has(key)) {
        this.refreshing.add(key);
        this.fetchContract(project, key)
          .catch(() => {})
          .finally(() => this.refreshing.delete(key));
      }
      return hit.contract;
    }
    return this.fetchContract(project, key);
  }

  private async fetchContract(project: ProjectRow, key: string): Promise<Contract> {
    const config = parseConfig(await this.readJson(project, project.config_path));
    const schema = (await this.readJson(project, config.schema)) as object;
    const contract = { config, schema };
    this.cache.set(key, { at: Date.now(), contract });
    return contract;
  }

  async commitContent(project: ProjectRow, config: WaltConfig, content: unknown, message: string): Promise<string> {
    const octokit = await this.clientFor(project);
    const base = { owner: project.repo_owner, repo: project.repo_name, path: config.content, branch: project.default_branch };
    const body = Buffer.from(serializeContent(content)).toString('base64');
    for (let attempt = 0; ; attempt++) {
      let sha: string | undefined;
      try {
        const cur = await octokit.repos.getContent({ owner: base.owner, repo: base.repo, path: base.path, ref: base.branch });
        sha = (cur.data as { sha?: string }).sha;
      } catch (err) {
        if ((err as { status?: number }).status !== 404) throw err;
      }
      try {
        const res = await octokit.repos.createOrUpdateFileContents({ ...base, message, content: body, sha });
        return res.data.commit.sha ?? '';
      } catch (err) {
        // Someone else committed in between: read the sha again, once.
        const status = (err as { status?: number }).status;
        if (attempt === 0 && (status === 409 || status === 422)) continue;
        throw err;
      }
    }
  }
}
