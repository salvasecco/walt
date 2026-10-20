import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { z } from 'zod';

/** Env vars whose values are secret: never printed, and blocked by the gate if they appear in a text. */
export const SECRET_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'GITHUB_TOKEN',
  'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'OPENAI_API_KEY',
  'PANEL_PASSWORD',
] as const;

/**
 * Model routing (R1): a cheap model classifies (interpret, consultas, quote drafts) and a strong one
 * writes code. Haiku 5.5 got 90/90 on the R1 eval with prompt v8 at 1/18 of Sonnet's cost; the agent
 * stays on Sonnet 5.5 with a retry on Opus 5.5. When the cheap model fails, the provider retries once
 * on `INTERPRET_FALLBACK_MODEL`.
 */
export const DEFAULT_MODELS = { interpret: 'claude-haiku-5-5', agent: 'claude-sonnet-5-5' } as const;
export const INTERPRET_FALLBACK_MODEL = 'claude-sonnet-5-5';

const opt = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

export const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: opt,
  TELEGRAM_BOT_USERNAME: opt,
  TELEGRAM_MODE: z.enum(['polling', 'webhook', 'console']).default('console'),
  TELEGRAM_WEBHOOK_SECRET: opt,
  PUBLIC_WORKER_URL: opt,
  SUPABASE_URL: opt,
  SUPABASE_ANON_KEY: opt,
  SUPABASE_SERVICE_ROLE_KEY: opt,
  SUPABASE_DB_URL: opt,
  GITHUB_TOKEN: opt,
  GITHUB_MODE: z.enum(['real', 'fake']).default('fake'),
  LLM_PROVIDER: z.enum(['anthropic', 'bedrock', 'fake']).default('fake'),
  ANTHROPIC_API_KEY: opt,
  AWS_REGION: opt,
  AWS_ACCESS_KEY_ID: opt,
  AWS_SECRET_ACCESS_KEY: opt,
  MODEL_INTERPRET: z.string().default(DEFAULT_MODELS.interpret),
  MODEL_AGENT: z.string().default(DEFAULT_MODELS.agent),
  OPENAI_API_KEY: opt,
  SCREENSHOTS: z.enum(['on', 'off']).default('off'),
  PANEL_PASSWORD: opt,
  PANEL_URL: opt,
  DEMO_AGENCY_NAME: z.string().default('Estudio Faro'),
  DEMO_REPO: z.string().regex(/^[\w.-]+\/[\w.-]+$/).default('salvasecco/walt-demo'),
  DEMO_SITE_URL: opt,
});

export type WaltEnvValues = z.infer<typeof EnvSchema>;

export interface WaltEnv extends WaltEnvValues {
  /** Values of secret vars with 8+ characters, for the gate and for `redact`. Never print them. */
  readonly secrets: string[];
  /** Modes that were switched to fake because their credentials were missing (only with `fallbackToFake`). */
  readonly downgraded: string[];
}

export interface LoadEnvOptions {
  /** Home env file. Default `~/.walt/.env`. */
  homeFile?: string;
  /** Directory of the local `.env`. Default `process.cwd()`. */
  cwd?: string;
  /** Values that win over files. Default `process.env`. Pass `{}` to ignore the process env. */
  overrides?: Record<string, string | undefined>;
  /** If a real mode lacks its credentials, switch it to its fake mode instead of failing `requireCredentials`. */
  fallbackToFake?: boolean;
  /** Fill `process.env` with the loaded values that are not set there yet. */
  applyToProcess?: boolean;
}

export const HOME_ENV_FILE = join(homedir(), '.walt', '.env');

function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parse(readFileSync(path, 'utf8')) : {};
}

function nonEmpty(src: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) if (v !== undefined && v.trim() !== '') out[k] = v;
  return out;
}

/**
 * Loads `~/.walt/.env`, then a local `.env` (overrides), then `process.env` (overrides),
 * validates with zod and never prints values. Empty strings count as unset.
 */
export function loadEnv(opts: LoadEnvOptions = {}): WaltEnv {
  const home = readEnvFile(opts.homeFile ?? HOME_ENV_FILE);
  const local = readEnvFile(join(opts.cwd ?? process.cwd(), '.env'));
  const overrides = opts.overrides ?? process.env;
  const merged = { ...nonEmpty(home), ...nonEmpty(local), ...nonEmpty(pickKnown(overrides)) };

  const parsed = EnvSchema.safeParse(merged);
  if (!parsed.success) {
    // Only names and messages, never values.
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Entorno inválido: ${msg}`);
  }
  const values = parsed.data;
  const downgraded: string[] = [];
  if (opts.fallbackToFake) {
    for (const m of missingCredentials(values)) {
      if (m.mode === 'LLM_PROVIDER') values.LLM_PROVIDER = 'fake';
      if (m.mode === 'GITHUB_MODE') values.GITHUB_MODE = 'fake';
      if (m.mode === 'TELEGRAM_MODE') values.TELEGRAM_MODE = 'console';
      if (!downgraded.includes(m.mode)) downgraded.push(m.mode);
    }
  }
  const env: WaltEnv = { ...values, secrets: secretValues(values), downgraded };
  if (opts.applyToProcess) {
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined && process.env[k] === undefined) process.env[k] = String(v);
    }
  }
  return env;
}

function pickKnown(src: Record<string, string | undefined>): Record<string, string | undefined> {
  const keys = Object.keys(EnvSchema.shape);
  return Object.fromEntries(keys.map((k) => [k, src[k]]));
}

export function secretValues(values: Partial<Record<string, unknown>>): string[] {
  return SECRET_KEYS.map((k) => values[k]).filter((v): v is string => typeof v === 'string' && v.length >= 8);
}

export interface MissingCredential {
  mode: 'LLM_PROVIDER' | 'GITHUB_MODE' | 'TELEGRAM_MODE' | 'SUPABASE';
  keys: string[];
}

/** Credentials required by the selected modes that are not set. Names only. */
export function missingCredentials(v: WaltEnvValues): MissingCredential[] {
  const out: MissingCredential[] = [];
  const need = (mode: MissingCredential['mode'], keys: (keyof WaltEnvValues)[]) => {
    const missing = keys.filter((k) => !v[k]);
    if (missing.length > 0) out.push({ mode, keys: missing });
  };
  if (v.LLM_PROVIDER === 'anthropic') need('LLM_PROVIDER', ['ANTHROPIC_API_KEY']);
  if (v.LLM_PROVIDER === 'bedrock') need('LLM_PROVIDER', ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);
  if (v.GITHUB_MODE === 'real') need('GITHUB_MODE', ['GITHUB_TOKEN']);
  if (v.TELEGRAM_MODE === 'polling') need('TELEGRAM_MODE', ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME']);
  if (v.TELEGRAM_MODE === 'webhook') {
    need('TELEGRAM_MODE', ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET', 'PUBLIC_WORKER_URL']);
  }
  return out;
}

export function hasSupabase(v: WaltEnvValues): boolean {
  return !!(v.SUPABASE_URL && v.SUPABASE_SERVICE_ROLE_KEY);
}

/** Throws (with key names only) if the selected modes lack credentials. */
export function requireCredentials(v: WaltEnvValues): void {
  const missing = missingCredentials(v);
  if (missing.length > 0) {
    throw new Error(`Faltan credenciales: ${missing.map((m) => `${m.mode} → ${m.keys.join(', ')}`).join('; ')}`);
  }
}

/** Replaces any secret value in a string with `[secreto]`. Use before logging anything external. */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) out = out.split(s).join('[secreto]');
  return out;
}

/** Safe summary for logs: modes and which keys are set, never values. */
export function describeEnv(env: WaltEnv): Record<string, string> {
  return {
    TELEGRAM_MODE: env.TELEGRAM_MODE,
    GITHUB_MODE: env.GITHUB_MODE,
    LLM_PROVIDER: env.LLM_PROVIDER,
    SCREENSHOTS: env.SCREENSHOTS,
    MODEL_INTERPRET: env.MODEL_INTERPRET,
    MODEL_AGENT: env.MODEL_AGENT,
    supabase: hasSupabase(env) ? 'configurado' : 'sin configurar',
    downgraded: env.downgraded.join(', ') || '—',
  };
}
