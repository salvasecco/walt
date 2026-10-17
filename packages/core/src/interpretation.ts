import { z } from 'zod';
import { OpSchema } from './ops.js';

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

// Keywords not supported by Claude structured outputs; validation still happens with zod afterwards.
const UNSUPPORTED = new Set(['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'format']);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (node === null || typeof node !== 'object') return node;
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(node as JsonSchema)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as JsonSchema).map(([p, s]) => [p, clean(s)])) : clean(v);
  }
  if (out.type === 'object' && out.additionalProperties === undefined) out.additionalProperties = false;
  return out;
}

/**
 * JSON Schema of `Interpretation` for structured output (`output_config.format`).
 * Objects are closed (`additionalProperties: false`); numeric and string constraints are
 * stripped because the API rejects some of them; always re-validate with `InterpretationSchema`.
 */
export const interpretationJsonSchema: JsonSchema = clean(
  z.toJSONSchema(InterpretationSchema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' }),
) as JsonSchema;

export function parseInterpretation(raw: unknown): Interpretation {
  return InterpretationSchema.parse(raw);
}
