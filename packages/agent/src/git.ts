import { execFile } from 'node:child_process';
import { redact } from '@dale/core';

/**
 * Thin wrapper over the git CLI. Runs with an isolated config (no user or system
 * gitconfig, no prompts) and a minimal environment. Authentication goes in
 * `authEnv` as `GIT_CONFIG_*` variables, so the token is never in the remote URL,
 * in `.git/config`, or in a command line visible in `ps`.
 */

export interface GitOptions {
  cwd: string;
  /** Extra env, e.g. the auth header from `githubAuthEnv`. */
  authEnv?: Record<string, string>;
  /** Values to redact from errors. */
  secrets?: string[];
  timeoutMs?: number;
}

export const DALE_AUTHOR = { name: 'Dale', email: 'dale-bot@users.noreply.github.com' };

export function gitEnv(home: string, authEnv: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo',
    GIT_AUTHOR_NAME: DALE_AUTHOR.name,
    GIT_AUTHOR_EMAIL: DALE_AUTHOR.email,
    GIT_COMMITTER_NAME: DALE_AUTHOR.name,
    GIT_COMMITTER_EMAIL: DALE_AUTHOR.email,
    ...authEnv,
  };
}

/** Auth for github.com over HTTPS as an extra header, passed through the environment. */
export function githubAuthEnv(token: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

export function git(args: string[], opts: GitOptions & { home: string }): Promise<string> {
  const secrets = [...(opts.secrets ?? [])];
  const header = opts.authEnv?.GIT_CONFIG_VALUE_0;
  if (header) secrets.push(header, header.replace(/^AUTHORIZATION: basic /, ''));
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-c', 'core.symlinks=true', ...args],
      {
        cwd: opts.cwd,
        env: gitEnv(opts.home, opts.authEnv),
        timeout: opts.timeoutMs ?? 60_000,
        maxBuffer: 32 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = redact(`${stderr || err.message}`.trim(), secrets).slice(0, 2000);
          reject(new Error(`git ${args[0]} falló: ${detail}`));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}
