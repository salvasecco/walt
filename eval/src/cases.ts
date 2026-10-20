import { existsSync, readFileSync } from 'node:fs';
import { CATEGORIES, LANES } from '@walt/core';
import { z } from 'zod';

/**
 * Eval cases (SPEC §15, R1 taxonomy): one JSON object per line. `expected.ops` may use `"*"` as a
 * wildcard for free text (banner text, color picked for "violeta"). `expected.category` may be a list
 * when more than one category is acceptable. A case whose accepted categories include `delicado` but
 * not `simple` counts toward the expensive error if it comes out simple.
 */
const Category = z.enum(CATEGORIES);

export const EvalCaseSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  expected: z.object({
    category: z.union([Category, z.array(Category).min(1)]),
    lane: z.enum(LANES).nullable().optional(),
    ops: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  tags: z.array(z.string()).default([]),
  source: z.enum(['sintetico', 'real']),
  /** Language of the message. Default `es`. */
  lang: z.enum(['es', 'pt']).optional(),
  /** Decide context overrides, e.g. a project that does not allow code. */
  context: z
    .object({
      allowCode: z.boolean().optional(),
      projectMode: z.enum(['contenido', 'codigo']).optional(),
      hasOpenRequest: z.boolean().optional(),
    })
    .optional(),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export function parseCases(jsonl: string, file = 'casos'): EvalCase[] {
  const out: EvalCase[] = [];
  jsonl.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`${file}:${i + 1}: JSON inválido`);
    }
    const r = EvalCaseSchema.safeParse(raw);
    if (!r.success) throw new Error(`${file}:${i + 1}: ${r.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
    out.push(r.data);
  });
  const ids = new Set<string>();
  for (const c of out) {
    if (ids.has(c.id)) throw new Error(`${file}: id repetido ${c.id}`);
    ids.add(c.id);
  }
  return out;
}

export function loadCases(path: string): EvalCase[] {
  return existsSync(path) ? parseCases(readFileSync(path, 'utf8'), path) : [];
}

export function expectedCategories(c: EvalCase): string[] {
  return Array.isArray(c.expected.category) ? c.expected.category : [c.expected.category];
}
