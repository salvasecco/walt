import { applyOps, type DaleConfig, type Op } from '@dale/core';

/**
 * Normalized comparison of operations (SPEC §15 "acierto exacto de operaciones, normalizadas").
 * Order of ops and of keys does not matter; numbers compare to 2 decimals, colors without
 * case, ISO dates as instants, free text without case or accents, banner fields left out
 * count as null. `"*"` in the expected value accepts anything. If two lists differ in shape
 * but produce exactly the same changes on the content, they also count as equal.
 */
export const WILDCARD = '*';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function normText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normValue(v: unknown): unknown {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (typeof v === 'string') {
    if (v === WILDCARD) return v;
    if (ISO.test(v)) return new Date(v).toISOString();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
    return normText(v);
  }
  if (Array.isArray(v)) return v.map(normValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = normValue(x);
    }
    return out;
  }
  return v;
}

export function normalizeOp(op: Record<string, unknown>): Record<string, unknown> {
  const o = { ...op };
  if (o.type === 'set_banner') {
    for (const k of ['discountPercent', 'startsAt', 'endsAt'] as const) if (o[k] === undefined) o[k] = null;
  }
  return normValue(o) as Record<string, unknown>;
}

function matches(expected: unknown, actual: unknown): boolean {
  if (expected === WILDCARD) return actual !== undefined && actual !== null;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.length === actual.length && expected.every((e, i) => matches(e, actual[i]));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    const ek = Object.keys(expected);
    const ak = Object.keys(actual);
    if (ek.length !== ak.length || !ek.every((k) => ak.includes(k))) return false;
    return ek.every((k) => matches((expected as Record<string, unknown>)[k], (actual as Record<string, unknown>)[k]));
  }
  return expected === actual;
}

function hasWildcard(v: unknown): boolean {
  if (v === WILDCARD) return true;
  if (Array.isArray(v)) return v.some(hasWildcard);
  if (v && typeof v === 'object') return Object.values(v).some(hasWildcard);
  return false;
}

/** Structural match with wildcards, order-insensitive. */
export function opsMatchStructural(expected: Record<string, unknown>[], actual: Record<string, unknown>[]): boolean {
  if (expected.length !== actual.length) return false;
  const exp = expected.map(normalizeOp);
  const act = actual.map(normalizeOp);
  const used = new Set<number>();
  const assign = (i: number): boolean => {
    if (i === exp.length) return true;
    for (let j = 0; j < act.length; j++) {
      if (used.has(j) || !matches(exp[i], act[j])) continue;
      used.add(j);
      if (assign(i + 1)) return true;
      used.delete(j);
    }
    return false;
  };
  return assign(0);
}

function effect(content: unknown, ops: Op[], config: DaleConfig): string | undefined {
  try {
    const { changes } = applyOps(content, ops, config);
    return JSON.stringify(changes.map((c) => [c.pointer, normValue(c.after)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  } catch {
    return undefined;
  }
}

/** True if the actual ops are the expected ones, structurally or by effect on the content. */
export function opsMatch(
  expected: Record<string, unknown>[],
  actual: Op[],
  ctx: { content: unknown; config: DaleConfig },
): boolean {
  if (opsMatchStructural(expected, actual as unknown as Record<string, unknown>[])) return true;
  if (hasWildcard(expected)) return false;
  const a = effect(ctx.content, actual, ctx.config);
  const e = effect(ctx.content, expected as unknown as Op[], ctx.config);
  return a !== undefined && e !== undefined && a === e && a !== '[]';
}
