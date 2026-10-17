import { z } from 'zod';
import { OpSchema } from './ops.ts';

export const INTERPRETATION_KINDS = ['cambio', 'consulta', 'funcion_nueva', 'charla', 'aprobacion', 'revertir'] as const;
export type InterpretationKind = (typeof INTERPRETATION_KINDS)[number];

/** What the model returns for a client message (SPEC §10). Shared by worker and eval. */
export const InterpretationSchema = z.object({
  kind: z.enum(INTERPRETATION_KINDS),
  /** One line in rioplatense Spanish: "Subo el pan flauta de $80 a $95". */
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  ops: z.array(OpSchema),
  needsCode: z.boolean(),
  codeInstruction: z.string().optional(),
  unexpressedParts: z.array(z.string()),
  options: z.array(z.object({ label: z.string(), ops: z.array(OpSchema) })).optional(),
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
 * and nullable. The exact union (8 variants, optional fields, nested twice) compiles to a grammar the
 * API rejects as too large; this flat shape is small, and `fromWire` turns it back into the union.
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
  name: nullable(str),
  category: nullable(str),
  price: nullable({ type: 'number' }),
});

/**
 * JSON Schema for structured output (`output_config.format`). Ops are flat (see WIRE_OP) and shared
 * through `$defs`; optional fields are required-and-nullable. Always pass the result through
 * `fromWire` and validate with `InterpretationSchema`.
 */
export const interpretationJsonSchema: JsonSchema = {
  ...closed({
    kind: { type: 'string', enum: [...INTERPRETATION_KINDS] },
    summary: str,
    confidence: { type: 'number' },
    ops: { type: 'array', items: { $ref: '#/$defs/op' } },
    needsCode: { type: 'boolean' },
    codeInstruction: nullable(str),
    unexpressedParts: { type: 'array', items: str },
    options: nullable({ type: 'array', items: closed({ label: str, ops: { type: 'array', items: { $ref: '#/$defs/op' } } }) }),
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

function dropNulls(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

function opFromWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = raw as Record<string, unknown>;
  const fields = OP_FIELDS[o.type as string];
  if (!fields) return raw;
  const out: Record<string, unknown> = { type: o.type };
  for (const [k, keepNull] of Object.entries(fields)) {
    const v = o[k];
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
  if (o.codeInstruction === null) delete o.codeInstruction;
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
