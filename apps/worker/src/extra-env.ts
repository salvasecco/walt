import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { HOME_ENV_FILE } from '@walt/core';
import type { GitHubAppCredentials } from '@walt/agent';

/**
 * Worker settings that are not (yet) in `@walt/core`'s EnvSchema, read with the same order as `loadEnv`:
 * `~/.walt/.env`, then a local `.env`, then `process.env` (the last one wins; empty counts as unset).
 * Pending for the 90: move them to EnvSchema (GITHUB_APP_PRIVATE_KEY into SECRET_KEYS).
 */
export interface ExtraEnv {
  /** Walt's GitHub App; null without GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY. */
  githubApp: GitHubAppCredentials | null;
  /** `auto` (durable with Supabase and 0004, in memory otherwise), `durable` (required) or `memoria`. */
  queueMode: 'auto' | 'durable' | 'memoria';
  /** HTTP port for health checks, metrics and the Telegram webhook; 0 turns it off. */
  port: number;
  workerId: string;
  concurrency: { default: number; agent: number };
  /** Requests per agency every 10 minutes. */
  agencyRateLimit: number;
  /** Secret values to redact (the App's private key). */
  secrets: string[];
}

export const EXTRA_KEYS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'WORKER_QUEUE',
  'PORT',
  'WORKER_ID',
  'WORKER_CONCURRENCY',
  'AGENT_CONCURRENCY',
  'AGENCY_RATE_LIMIT',
  'LOG_FORMAT',
  'FLY_MACHINE_ID',
] as const;

function readFile(path: string): Record<string, string> {
  try {
    return existsSync(path) ? (parseEnv(readFileSync(path, 'utf8')) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function readExtra(opts: { homeFile?: string; cwd?: string; overrides?: Record<string, string | undefined> } = {}): Record<string, string> {
  const layers = [readFile(opts.homeFile ?? HOME_ENV_FILE), readFile(join(opts.cwd ?? process.cwd(), '.env')), opts.overrides ?? process.env];
  const out: Record<string, string> = {};
  for (const layer of layers) {
    for (const k of EXTRA_KEYS) {
      const v = layer[k];
      if (v !== undefined && v.trim() !== '') out[k] = v.trim();
    }
  }
  return out;
}

function int(v: string | undefined, fallback: number, min = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

export function loadExtraEnv(opts: Parameters<typeof readExtra>[0] = {}): ExtraEnv {
  const v = readExtra(opts);
  const queue = v.WORKER_QUEUE?.toLowerCase();
  const app = v.GITHUB_APP_ID && v.GITHUB_APP_PRIVATE_KEY ? { appId: v.GITHUB_APP_ID, privateKey: v.GITHUB_APP_PRIVATE_KEY } : null;
  return {
    githubApp: app,
    queueMode: queue === 'durable' || queue === 'memoria' ? queue : 'auto',
    port: int(v.PORT, 8080),
    workerId: v.WORKER_ID ?? `${v.FLY_MACHINE_ID ?? hostname()}:${process.pid}:${randomBytes(2).toString('hex')}`,
    concurrency: { default: int(v.WORKER_CONCURRENCY, 1, 1), agent: int(v.AGENT_CONCURRENCY, 1, 1) },
    agencyRateLimit: int(v.AGENCY_RATE_LIMIT, 120, 1),
    secrets: app ? [app.privateKey] : [],
  };
}
