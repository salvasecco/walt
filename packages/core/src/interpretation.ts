import { z } from 'zod';
import { OpSchema } from './ops.ts';

/**
 * What the model says the request is, by intention (R1 taxonomy, first half of the double classification):
 * - simple / delicado: a change (typed `ops`, or `needsCode` with a brief for the agent). delicado when it
 *   touches the database, auth or permissions, backend or API, existing payments, secrets, infrastructure
 *   or CI, dependencies, or deletes data.
 * - nuevo: a new agentic workflow, a payment gateway, integrations that need credentials or contracts, big modules.
 * - consulta, bloqueado (injection, malicious, out of policy), charla, aprobacion and revertir.
 */
export const INTERPRETATION_KINDS = ['simple', 'delicado', 'nuevo', 'consulta', 'bloqueado', 'charla', 'aprobacion', 'revertir'] as const;
export type InterpretationKind = (typeof INTERPRETATION_KINDS)[number];

/** Kinds that are a change to the software (they carry `ops` or a brief for the agent). */
export const CHANGE_KINDS = ['simple', 'delicado'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export function isChangeKind(kind: unknown): kind is ChangeKind {
  return kind === 'simple' || kind === 'delicado';
}

/** Pre-R1 kinds still found in stored interpretations. */
export const LEGACY_KINDS: Record<string, InterpretationKind> = { cambio: 'simple', funcion_nueva: 'nuevo' };
const legacyKind = (v: unknown) => (typeof v === 'string' && v in LEGACY_KINDS ? LEGACY_KINDS[v] : v);

/** Languages the interpreter understands; replies follow the client's language. */
export const LANGUAGES = ['es', 'pt'] as const;
export type Language = (typeof LANGUAGES)[number];

/** What the model returns for a client message (SPEC §10, R1). Shared by worker and eval. */
export const InterpretationSchema = z.object({
  kind: z.preprocess(legacyKind, z.enum(INTERPRETATION_KINDS)),
  /** One line in the client's language: "Subo el pan flauta de $80 a $95". */
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  ops: z.array(OpSchema),
  needsCode: z.boolean(),
  codeInstruction: z.string().optional(),
  unexpressedParts: z.array(z.string()),
  options: z.array(z.object({ label: z.string(), ops: z.array(OpSchema) })).optional(),
  /** Why it is this kind, in one short line (for the agency, the panel and the rules simulator). */
  why: z.string().optional(),
  /** When nothing concrete can be built: one short question for the client (ambiguity goes to the client). */
  question: z.string().optional(),
  /** Language of the client's message. */
  language: z.enum(LANGUAGES).optional(),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

type JsonSchema = Record<string, unknown>;

const str = { type: 'string' };
const nullable = (t: JsonSchema): JsonSchema => ({ anyOf: [t, { type: 'null' }] });
const closed = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/**
 * One flat object for every op on the wire: `type` plus every field any op can carry, all required
 * and nullable. The exact union (9 variants, optional fields, nested twice) compiles to a grammar the
 * API rejects as too large; this flat shape is small, and `fromWire` turns it back into the union.
 * `add_product` reuses `text` (its name) and `value` (its price): with its own `name` and `price` the
 * R1 schema (why, question, language) went over the API's grammar limit again.
 */
const WIRE_OP: JsonSchema = closed({
  type: { type: 'string', enum: ['set_text', 'set_price', 'adjust_prices', 'set_availability', 'set_color', 'set_banner', 'set_hours', 'toggle_section', 'add_product'] },
  path: nullable(str),
  productId: nullable(str),
  value: nullable({ anyOf: [str, { type: 'number' }] }),
  filter: nullable(closed({ all: nullable({ type: 'boolean' }), category: nullable(str), productIds: nullable({ type: 'array', items: str }) })),
  percent: nullable({ type: 'number' }),
  amount: nullable({ type: 'number' }),
  rounding: nullable({ type: 'string', enum: ['none', 'integer', 'nearest_5', 'nearest_10'] }),
  available: nullable({ type: 'boolean' }),
  token: nullable(str),
  enabled: nullable({ type: 'boolean' }),
  text: nullable(str),
  discountPercent: nullable({ type: 'number' }),
  startsAt: nullable(str),
  endsAt: nullable(str),
  day: nullable({ type: 'string', enum: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] }),
  open: nullable(str),
  close: nullable(str),
  section: nullable(str),
  visible: nullable({ type: 'boolean' }),
  category: nullable(str),
});

/**
 * JSON Schema for structured output (`output_config.format`). Ops are flat (see WIRE_OP) and shared
 * through `$defs`; optional fields are required-and-nullable. Always pass the result through
 * `fromWire` and validate with `InterpretationSchema`.
 */
export const interpretationJsonSchema: JsonSchema = {
  // Order matters: the model writes the language, the summary and the reason before it commits to a kind.
  ...closed({
    language: { type: 'string', enum: [...LANGUAGES] },
    summary: str,
    why: str,
    kind: { type: 'string', enum: [...INTERPRETATION_KINDS] },
    confidence: { type: 'number' },
    ops: { type: 'array', items: { $ref: '#/$defs/op' } },
    needsCode: { type: 'boolean' },
    codeInstruction: nullable(str),
    unexpressedParts: { type: 'array', items: str },
    options: nullable({ type: 'array', items: closed({ label: str, ops: { type: 'array', items: { $ref: '#/$defs/op' } } }) }),
    question: nullable(str),
  }),
  $defs: { op: WIRE_OP },
};

/** Fields each op keeps from the flat wire object; the ones marked `true` may legitimately be null. */
const OP_FIELDS: Record<string, Record<string, boolean>> = {
  set_text: { path: false, value: false },
  set_price: { productId: false, value: false },
  adjust_prices: { filter: false, percent: false, amount: false, rounding: false },
  set_availability: { productId: false, available: false },
  set_color: { token: false, value: false },
  set_banner: { enabled: false, text: false, discountPercent: true, startsAt: true, endsAt: true },
  set_hours: { day: false, open: true, close: true },
  toggle_section: { section: false, visible: false },
  add_product: { name: false, category: false, price: false },
};

/** Op fields that travel under another wire name (see WIRE_OP). */
const WIRE_ALIASES: Record<string, Record<string, string>> = {
  add_product: { name: 'text', price: 'value' },
};

function dropNulls(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

function opFromWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = raw as Record<string, unknown>;
  const fields = OP_FIELDS[o.type as string];
  if (!fields) return raw;
  const out: Record<string, unknown> = { type: o.type };
  const aliases = WIRE_ALIASES[o.type as string] ?? {};
  for (const [k, keepNull] of Object.entries(fields)) {
    const alias = aliases[k];
    const v = alias && (o[k] === null || o[k] === undefined) ? o[alias] : o[k];
    if (v === null || v === undefined) {
      if (keepNull && v === null) out[k] = null;
      continue;
    }
    out[k] = k === 'filter' && typeof v === 'object' ? dropNulls(v as Record<string, unknown>) : v;
  }
  return out;
}

/** Turns the flat wire shape back into `Interpretation`'s shape (drops nulls, rebuilds each op). */
export function fromWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(o.ops)) o.ops = o.ops.map(opFromWire);
  for (const k of ['codeInstruction', 'question', 'why'] as const) if (o[k] === null || o[k] === '') delete o[k];
  if (o.options === null) delete o.options;
  else if (Array.isArray(o.options)) {
    o.options = o.options.map((opt) =>
      opt && typeof opt === 'object' && Array.isArray((opt as { ops?: unknown }).ops)
        ? { ...(opt as object), ops: (opt as { ops: unknown[] }).ops.map(opFromWire) }
        : opt,
    );
  }
  return o;
}

export function parseInterpretation(raw: unknown): Interpretation {
  return InterpretationSchema.parse(fromWire(raw));
}
