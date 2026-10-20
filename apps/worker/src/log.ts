import { redact } from '@walt/core';
import { currentWork } from './context.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

/**
 * Worker logger. `json` (production): one JSON object per line with `ts`, `level`, `msg`, the job context
 * (`job_id`, `kind`, `project_id`, `request_id`) and the fields. `text` (local): the same lines as before.
 * Everything goes through `redact` with the secret values: never a key in the logs.
 */
export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** The pipeline's free-form lines (`[derivado] …`), as info with the context fields. */
  line(text: string): void;
  /** Adds secret values to redact (BYOK keys, installation tokens) once they are known. */
  addSecrets(values: string[]): void;
}

export interface LoggerOptions {
  format?: 'json' | 'text';
  secrets?: string[];
  /** Fields on every line, e.g. `{ service: 'worker', worker_id }`. */
  base?: LogFields;
  write?: (line: string) => void;
  /** Print debug lines in text format too. Default false (in JSON they always go). */
  debugText?: boolean;
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SHORT = /#([2-9A-HJ-NP-Z]{6})\b/;

function levelOf(text: string): LogLevel {
  return /(falló|fallo|\berror\b|no arrancó|no pude|⚠️)/i.test(text) ? 'warn' : 'info';
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const format = opts.format ?? 'text';
  const secrets = [...(opts.secrets ?? [])];
  const write = opts.write ?? ((l: string) => process.stdout.write(`${l}\n`));
  const clean = (s: string) => redact(s, secrets);

  const emit = (level: LogLevel, msg: string, fields: LogFields = {}) => {
    const work = currentWork();
    if (format === 'text') {
      // Locally the pipeline's steps are not printed (dry-run prints them itself).
      if (level === 'debug' && !opts.debugText) return;
      const extra = Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ');
      write(clean(extra ? `${msg} ${extra}` : msg));
      return;
    }
    const entry: LogFields = { ts: new Date().toISOString(), level, msg, ...opts.base };
    if (work?.jobId) entry.job_id = work.jobId;
    if (work?.kind) entry.kind = work.kind;
    if (work?.projectId) entry.project_id = work.projectId;
    if (work?.requestId) entry.request_id = work.requestId;
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) entry[k] = v;
    // A request id in the text (`[derivado] <uuid>: …`) or a short id (`#K7Q2MX`) also goes as a field.
    if (!entry.request_id) {
      const id = msg.match(UUID)?.[0];
      if (id) entry.request_id = id;
    }
    if (!entry.short_id) {
      const short = msg.match(SHORT)?.[1];
      if (short) entry.short_id = short;
    }
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({ ts: entry.ts, level, msg });
    }
    write(clean(line));
  };

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    line: (text) => emit(levelOf(text), text),
    addSecrets(values) {
      for (const v of values) if (v && v.length >= 8 && !secrets.includes(v)) secrets.push(v);
    },
  };
}

/** `LOG_FORMAT=json|text`; json by default in production (NODE_ENV=production) and text otherwise. */
export function logFormatFromEnv(env: NodeJS.ProcessEnv = process.env): 'json' | 'text' {
  const v = env.LOG_FORMAT?.trim().toLowerCase();
  if (v === 'json' || v === 'text') return v;
  return env.NODE_ENV === 'production' ? 'json' : 'text';
}
