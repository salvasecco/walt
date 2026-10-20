import { createRequire } from 'node:module';
import type { WaltConfig } from './config.ts';
import { getProducts, inventoryPointers } from './config.ts';
import { applyOps, OpSchema, OP_LABELS, OpValidationError, type Change, type Op } from './ops.ts';
import { getPointer } from './pointer.ts';
import { policyFor, priceWarnPct, type Policy, type Rules } from './rules.ts';

const require = createRequire(import.meta.url);
// ajv ships CommonJS; createRequire avoids ESM default-export interop issues.
const Ajv2020 = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js').default;
const addFormats = require('ajv-formats') as typeof import('ajv-formats').default;

export type GateOutcome = Policy; // 'auto' | 'agencia' | 'bloqueado'

export interface GateResult {
  outcome: GateOutcome;
  reasons: string[];
  /**
   * Shown to the client with the preview, never an escalation (R1): prices that move more than the
   * threshold ("Pan de masa madre baja de $220 a $95"), big discounts, low contrast, many changes at once.
   */
  warnings: string[];
  content: unknown;
  changes: Change[];
}

export interface GateInput {
  config: WaltConfig;
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

function isPricePointer(config: WaltConfig, pointer: string): boolean {
  const p = config.products;
  return !!p && pointer.startsWith(`${p.path}/`) && pointer.endsWith(`/${p.price}`);
}

/** WCAG contrast ratio between two #RRGGBB colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Minimum contrast between text and background before a color change needs the agency (WCAG AA). */
export const MIN_TEXT_CONTRAST = 4.5;
/** Big titles count as large text in WCAG AA: 3:1. */
export const MIN_LARGE_TEXT_CONTRAST = 3;

export interface ContrastPair {
  fg: string;
  bg: string;
  min: number;
  what: string;
  on: string;
}

/**
 * Color pairs that must stay readable, as content pointers: text on background (4.5:1), title on
 * background (3:1, large text) and button text on the button (4.5:1). The text color is taken from
 * its token or from the background's sibling `text`; a pair is only checked when both colors exist.
 */
export function contrastPairs(config: WaltConfig): ContrastPair[] {
  const c = config.colors;
  const bg = c.background;
  const text = c.text ?? bg?.replace(/[^/]+$/, 'text');
  const pairs: ContrastPair[] = [];
  if (bg && text) pairs.push({ fg: text, bg, min: MIN_TEXT_CONTRAST, what: 'El texto', on: 'el fondo' });
  if (bg && c.title) pairs.push({ fg: c.title, bg, min: MIN_LARGE_TEXT_CONTRAST, what: 'El título', on: 'el fondo' });
  if (c.button && c.buttonText) pairs.push({ fg: c.buttonText, bg: c.button, min: MIN_TEXT_CONTRAST, what: 'El texto de los botones', on: 'el botón' });
  return pairs;
}

/** At most this many price warnings; the rest are summed up in one line. */
const MAX_PRICE_WARNINGS = 5;

function decimal(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',');
}

/** "$95", "$12,50". */
function money(n: number): string {
  return `$${Number.isInteger(n) ? String(n) : decimal(n, 2)}`;
}

/** Name of the product a price pointer belongs to, from the content before the change. */
function productNameAt(config: WaltConfig, content: unknown, pointer: string): string | undefined {
  const p = config.products;
  if (!p) return undefined;
  const index = Number(pointer.slice(p.path.length + 1).split('/')[0]);
  const item = Number.isInteger(index) ? getProducts(config, content)[index] : undefined;
  const name = item?.[p.name];
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
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
  const blocked = (reasons: string[]): GateResult => ({ outcome: 'bloqueado', reasons, warnings: [], content, changes: [] });

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
  const warnings: string[] = [];
  let outcome: GateOutcome = 'auto';
  const raise = (to: GateOutcome, reason: string) => {
    outcome = stricter(outcome, to);
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w);
  };

  // 3 + 4. Security and secrets on every new value.
  const colorPaths = new Set(Object.values(config.colors));
  for (const c of changes) {
    // A new item (add_product): every string inside goes through the same checks.
    if (c.after && typeof c.after === 'object') {
      for (const v of Object.values(c.after as Record<string, unknown>)) {
        if (typeof v === 'string') for (const r of checkText(v, secrets)) raise('bloqueado', r);
      }
    }
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

  // 4b. Readability: a color that leaves text hard to read is a warning in the preview (R1: colors are simple).
  for (const pair of contrastPairs(config)) {
    if (!changes.some((c) => c.pointer === pair.fg || c.pointer === pair.bg)) continue;
    const fg = getPointer(next, pair.fg);
    const bg = getPointer(next, pair.bg);
    if (typeof bg === 'string' && typeof fg === 'string' && COLOR.test(bg) && COLOR.test(fg)) {
      const ratio = contrastRatio(bg, fg);
      if (ratio < pair.min) {
        warn(`${pair.what} queda con poco contraste sobre ${pair.on} (${decimal(ratio, 1)}:1, se recomienda ${pair.min}:1): puede costar leerlo`);
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

  // 6. Limits. Only the monthly quota of automatic changes still goes to the agency (it is the plan's limit);
  // the rest are warnings the client sees with the preview (R1: "subí los panes a 95" is a simple change).
  if (ops.length > rules.limits.maxOpsPerRequest) warn(`Son ${ops.length} cambios juntos: revisalos bien`);
  const threshold = priceWarnPct(rules);
  const priceWarnings: string[] = [];
  for (const c of changes) {
    if (!isPricePointer(config, c.pointer)) continue;
    const before = Number(c.before);
    const after = Number(c.after);
    if (!(before > 0)) continue;
    const pct = ((after - before) / before) * 100;
    if (Math.abs(pct) > threshold + 1e-9) {
      const name = productNameAt(config, content, c.pointer) ?? 'Un producto';
      priceWarnings.push(`${name} ${after < before ? 'baja' : 'sube'} de ${money(before)} a ${money(after)} (${pct > 0 ? '+' : '-'}${Math.round(Math.abs(pct))}%)`);
    }
  }
  if (priceWarnings.length > MAX_PRICE_WARNINGS) {
    const rest = priceWarnings.length - (MAX_PRICE_WARNINGS - 1);
    priceWarnings.splice(MAX_PRICE_WARNINGS - 1, Infinity, `Y ${rest} precios más cambian más de ${threshold}%`);
  }
  for (const w of priceWarnings) warn(w);
  for (const op of ops) {
    if (op.type === 'set_banner' && op.enabled && typeof op.discountPercent === 'number' && op.discountPercent > threshold) {
      warn(`El cartel aplica ${op.discountPercent}% de descuento a todos los precios`);
    }
  }
  if (outcome === 'auto' && changes.length > 0) {
    const used = input.autoPublishedThisMonth ?? 0;
    if (used + 1 > rules.limits.monthlyQuota) {
      raise('agencia', `Se llegó al cupo de ${rules.limits.monthlyQuota} cambios automáticos del mes`);
    }
  }

  return { outcome, reasons, warnings, content: next, changes };
}
