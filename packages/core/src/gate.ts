import { createRequire } from 'node:module';
import type { DaleConfig } from './config.js';
import { inventoryPointers } from './config.js';
import { applyOps, OpSchema, OP_LABELS, OpValidationError, type Change, type Op } from './ops.js';
import { policyFor, type Policy, type Rules } from './rules.js';

const require = createRequire(import.meta.url);
// ajv ships CommonJS; createRequire avoids ESM default-export interop issues.
const Ajv2020 = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js').default;
const addFormats = require('ajv-formats') as typeof import('ajv-formats').default;

export type GateOutcome = Policy; // 'auto' | 'agencia' | 'bloqueado'

export interface GateResult {
  outcome: GateOutcome;
  reasons: string[];
  content: unknown;
  changes: Change[];
}

export interface GateInput {
  config: DaleConfig;
  /** Current content (live version). */
  content: unknown;
  /** JSON Schema (draft 2020-12) of the content. */
  schema: object;
  ops: Op[];
  rules: Rules;
  /** Values of secret env vars; any of length >= 8 inside a new text blocks it. See `secretValues`. */
  secrets?: string[];
  /** Automatic changes already published this month for the project. */
  autoPublishedThisMonth?: number;
}

const RANK: Record<GateOutcome, number> = { auto: 0, agencia: 1, bloqueado: 2 };
export function stricter<T extends GateOutcome>(a: T, b: T): T {
  return RANK[a] >= RANK[b] ? a : b;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const URL_SCHEME = /\b([a-z][a-z0-9+.-]*):\/\//gi;
const MAX_TEXT = 300;

const validators = new WeakMap<object, ReturnType<InstanceType<typeof Ajv2020>['compile']>>();
function validatorFor(schema: object) {
  let v = validators.get(schema);
  if (!v) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    v = ajv.compile(schema);
    validators.set(schema, v);
  }
  return v;
}

/** Security check for one new text value. Returns Spanish reasons, empty if fine. */
export function checkText(value: string, secrets: string[] = []): string[] {
  const reasons: string[] = [];
  if (value.includes('<') || value.includes('>')) reasons.push('El texto tiene los caracteres < o >');
  if (value.includes('{{')) reasons.push('El texto tiene {{');
  if (/javascript:/i.test(value)) reasons.push('El texto tiene javascript:');
  if (CONTROL.test(value)) reasons.push('El texto tiene caracteres de control');
  if (value.length > MAX_TEXT) reasons.push(`El texto supera los ${MAX_TEXT} caracteres`);
  for (const m of value.matchAll(URL_SCHEME)) {
    if (m[1]!.toLowerCase() !== 'https') reasons.push('Los links solo pueden ser https:');
  }
  if (secrets.some((s) => s.length >= 8 && value.includes(s))) reasons.push('El texto contiene un valor secreto');
  return reasons;
}

function isPricePointer(config: DaleConfig, pointer: string): boolean {
  const p = config.products;
  return !!p && pointer.startsWith(`${p.path}/`) && pointer.endsWith(`/${p.price}`);
}

function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}

/**
 * The deterministic gate (SPEC §8). No AI. Applies the operations on a copy, validates
 * shape, schema, security, secrets, inventory and limits, and returns the most
 * restrictive outcome with Spanish reasons.
 */
export function runGate(input: GateInput): GateResult {
  const { config, content, schema, ops, rules } = input;
  const secrets = input.secrets ?? [];
  const blocked = (reasons: string[]): GateResult => ({ outcome: 'bloqueado', reasons, content, changes: [] });

  // 1. Shape of every operation.
  const shapeErrors: string[] = [];
  ops.forEach((op, i) => {
    const r = OpSchema.safeParse(op);
    if (!r.success) shapeErrors.push(`Operación ${i + 1} inválida: ${r.error.issues.map((x) => x.message).join('; ')}`);
  });
  if (shapeErrors.length > 0) return blocked(shapeErrors);

  // 1b + 2. References against the config, applied on a copy.
  let next: unknown;
  let changes: Change[];
  try {
    ({ content: next, changes } = applyOps(content, ops, config));
  } catch (err) {
    if (err instanceof OpValidationError) return blocked([err.message]);
    throw err;
  }

  // 2. JSON Schema of the new content.
  const validate = validatorFor(schema);
  if (!validate(next)) {
    const msgs = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'no es válido'}`);
    return blocked([`El contenido nuevo no cumple el esquema: ${msgs.join('; ')}`]);
  }

  const reasons: string[] = [];
  let outcome: GateOutcome = 'auto';
  const raise = (to: GateOutcome, reason: string) => {
    outcome = stricter(outcome, to);
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  // 3 + 4. Security and secrets on every new value.
  const colorPaths = new Set(Object.values(config.colors));
  for (const c of changes) {
    if (typeof c.after === 'string') {
      for (const r of checkText(c.after, secrets)) raise('bloqueado', r);
      if (colorPaths.has(c.pointer) && !COLOR.test(c.after)) raise('bloqueado', 'Los colores tienen que ser #RRGGBB');
    }
    if (isPricePointer(config, c.pointer)) {
      const n = c.after;
      if (typeof n !== 'number' || !(n > 0) || !hasAtMostTwoDecimals(n)) {
        raise('bloqueado', 'Los precios tienen que ser positivos y con hasta 2 decimales');
      }
    }
  }

  // 5. Defense in depth: every changed pointer must be in the inventory.
  const allowed = inventoryPointers(config, content);
  for (const c of changes) {
    if (!allowed.has(c.pointer)) raise('bloqueado', `El cambio en ${c.pointer} está fuera de lo que se puede tocar`);
  }

  // Policies per operation type.
  for (const op of ops) {
    const policy = policyFor(rules, op.type);
    if (policy === 'bloqueado') raise('bloqueado', `Las reglas no permiten ${OP_LABELS[op.type]}`);
    if (policy === 'agencia') raise('agencia', `Las reglas piden que la agencia apruebe ${OP_LABELS[op.type]}`);
  }

  // 6. Limits.
  if (ops.length > rules.limits.maxOpsPerRequest) {
    raise('agencia', `Son ${ops.length} operaciones y el máximo automático es ${rules.limits.maxOpsPerRequest}`);
  }
  for (const c of changes) {
    if (!isPricePointer(config, c.pointer)) continue;
    const before = Number(c.before);
    const after = Number(c.after);
    if (before > 0) {
      const pct = (Math.abs(after - before) / before) * 100;
      if (pct > rules.limits.maxPriceChangePct + 1e-9) {
        raise('agencia', `Un precio cambia ${Math.round(pct)}%, más que el límite de ${rules.limits.maxPriceChangePct}%`);
      }
    }
  }
  if (outcome === 'auto' && changes.length > 0) {
    const used = input.autoPublishedThisMonth ?? 0;
    if (used + 1 > rules.limits.monthlyQuota) {
      raise('agencia', `Se llegó al cupo de ${rules.limits.monthlyQuota} cambios automáticos del mes`);
    }
  }

  return { outcome, reasons, content: next, changes };
}
