import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, matchesGlob, relative, resolve, sep } from 'node:path';

/**
 * Path guard for the code agent (SPEC §11.2). Every file tool call goes through
 * `evaluateToolUse` from a PreToolUse hook: the path is resolved against the clone,
 * every existing component is checked with `lstat` (symlinks are never followed),
 * and anything outside the clone, inside `.git`, or matching a protected glob is denied.
 */

/** Tools the agent may use. Anything else is denied by the hook too. */
export const AGENT_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep'] as const;

/** Always protected, on top of the configurable globs. */
export const ALWAYS_PROTECTED = ['.git', '.git/**', '**/.git', '**/.git/**'];

export type GuardResult = { ok: true; rel: string } | { ok: false; reason: string };

function isInside(root: string, abs: string): boolean {
  const rel = relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Case-insensitive glob match (macOS file systems are case-insensitive). */
export function matchesAny(relPath: string, globs: string[]): string | undefined {
  const p = relPath.split(sep).join('/').toLowerCase();
  return globs.find((g) => matchesGlob(p, g.toLowerCase()));
}

/**
 * Checks one path the agent wants to touch. `root` must be the real path of the clone.
 * Relative paths resolve against the clone, never against the process cwd.
 */
export function checkPath(root: string, p: string, protectedGlobs: string[]): GuardResult {
  if (typeof p !== 'string' || p.length === 0) return { ok: false, reason: 'ruta vacía' };
  if (p.includes('\0')) return { ok: false, reason: 'ruta con byte nulo' };
  const abs = resolve(root, p);
  if (!isInside(root, abs)) return { ok: false, reason: `fuera del repo: ${p}` };

  // Walk every component from the root down; stop at the first one that does not exist.
  const rel = relative(root, abs);
  let cur = root;
  for (const part of rel === '' ? [] : rel.split(sep)) {
    cur = resolve(cur, part);
    let st;
    try {
      st = lstatSync(cur);
    } catch {
      break; // does not exist yet (Write of a new file): nothing below can be a link
    }
    if (st.isSymbolicLink()) return { ok: false, reason: `es un enlace simbólico: ${relative(root, cur)}` };
  }
  // Defense in depth: the deepest existing ancestor must really be inside the clone.
  let probe = abs;
  for (;;) {
    try {
      const real = realpathSync(probe);
      if (!isInside(root, real)) return { ok: false, reason: `fuera del repo: ${p}` };
      break;
    } catch {
      const parent = resolve(probe, '..');
      if (parent === probe) break;
      probe = parent;
    }
  }

  const hit = matchesAny(rel, [...ALWAYS_PROTECTED, ...protectedGlobs]);
  if (hit) return { ok: false, reason: `archivo protegido (${hit}): ${rel}` };
  return { ok: true, rel };
}

/** Glob patterns can't escape: no absolute patterns and no `..` segments. */
function checkPattern(pattern: unknown): string | undefined {
  if (pattern === undefined) return undefined;
  if (typeof pattern !== 'string') return 'patrón inválido';
  if (isAbsolute(pattern) || pattern.startsWith('~')) return `patrón absoluto: ${pattern}`;
  if (pattern.split(/[\\/]/).includes('..')) return `patrón con ..: ${pattern}`;
  return undefined;
}

export interface ToolDecision {
  allow: boolean;
  reason?: string;
}

/**
 * Decides one tool call. Read/Edit/Write need a `file_path` that passes `checkPath`;
 * Glob and Grep may only search inside the clone. Any other tool is denied.
 */
export function evaluateToolUse(root: string, toolName: string, input: unknown, protectedGlobs: string[]): ToolDecision {
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const deny = (reason: string): ToolDecision => ({ allow: false, reason });
  const path = (key: string, required: boolean): ToolDecision | undefined => {
    const v = args[key];
    if (v === undefined || v === null || v === '') return required ? deny(`falta ${key}`) : undefined;
    if (typeof v !== 'string') return deny(`${key} inválido`);
    const r = checkPath(root, v, protectedGlobs);
    return r.ok ? undefined : deny(r.reason);
  };

  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return path('file_path', true) ?? { allow: true };
    case 'Glob': {
      const bad = checkPattern(args.pattern);
      if (bad) return deny(bad);
      return path('path', false) ?? { allow: true };
    }
    case 'Grep': {
      const bad = checkPattern(args.glob);
      if (bad) return deny(bad);
      return path('path', false) ?? { allow: true };
    }
    default:
      return deny(`herramienta no permitida: ${toolName}`);
  }
}
