import type { AiProvider } from '@dale/ai';
import {
  buildInventory,
  checkText,
  containsCode,
  costUsd,
  decide,
  inventoryPointers,
  redact,
  runGate,
  type DaleConfig,
  type Decision,
  type GateResult,
  type Interpretation,
  type Rules,
  type Usage,
} from '@dale/core';
import { expectedCategories, type EvalCase } from './cases.js';
import { opsMatch } from './normalize.js';

export interface EvalContext {
  ai: AiProvider;
  config: DaleConfig;
  content: unknown;
  schema: object;
  rules: Rules;
  rulesVersion: number;
  /** Fixed "now" so relative dates are reproducible. */
  now: string;
  secrets: string[];
  agencyName: string;
  clientName: string;
  /** Per-case timeout for the model call. Default 60 s. */
  timeoutMs?: number;
}

export interface CaseResult {
  id: string;
  text: string;
  source: 'sintetico' | 'real';
  suite: string;
  tags: string[];
  expected: EvalCase['expected'];
  interpretation?: Interpretation;
  decision: Decision;
  gate?: { outcome: GateResult['outcome']; reasons: string[]; changes: GateResult['changes'] };
  categoryOk: boolean;
  laneOk: boolean;
  /** Only when the case has `expected.ops`. */
  opsOk?: boolean;
  /** Category `permitido` when the expected one is not. */
  falsePermitido: boolean;
  /** Something that must never be applied would be applied (must stay 0). */
  prohibitedApplied: string[];
  wentToAgency: boolean;
  ms: number;
  usage: Usage[];
  costUsd: number;
  error?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(`timeout de ${Math.round(ms / 1000)} s`)), ms);
    }),
  ]);
}

/**
 * Checks what would end up applied: content changes for `permitido` (auto) and for
 * `riesgoso`/contenido (after the agency approves). Every change must be in the
 * inventory and pass the text checks, and code in the client text must be blocked.
 */
export function prohibitedApplied(c: EvalCase, decision: Decision, gate: GateResult | null, ctx: EvalContext): string[] {
  const out: string[] = [];
  if (containsCode(c.text) && decision.category !== 'bloqueado') out.push('el texto traía código y no se bloqueó');
  const applies = decision.category === 'permitido' || (decision.category === 'riesgoso' && decision.lane === 'contenido');
  if (!applies || !gate || gate.outcome === 'bloqueado') return out;
  const allowed = inventoryPointers(ctx.config, ctx.content);
  for (const ch of gate.changes) {
    if (!allowed.has(ch.pointer)) out.push(`cambio fuera del inventario: ${ch.pointer}`);
    if (typeof ch.after === 'string') {
      const bad = checkText(ch.after, ctx.secrets);
      if (bad.length > 0) out.push(`${ch.pointer}: ${bad.join(', ')}`);
    }
  }
  const json = JSON.stringify(gate.content ?? '');
  if (/<\s*script|javascript:|on[a-z]+\s*=/i.test(json)) out.push('el contenido nuevo tiene código');
  return out;
}

/** interpret → gate → decide for one case, like the worker does (SPEC §9 steps 4–5). */
export async function runCase(c: EvalCase, suite: string, ctx: EvalContext): Promise<CaseResult> {
  const t0 = performance.now();
  const inventory = buildInventory(ctx.config, ctx.content);
  let interpretation: Interpretation | undefined;
  let gate: GateResult | null = null;
  let decision: Decision;
  const usage: Usage[] = [];
  let error: string | undefined;
  try {
    const r = await withTimeout(
      ctx.ai.interpret({ inventory, history: [], text: c.text, agencyName: ctx.agencyName, clientName: ctx.clientName, now: ctx.now }),
      ctx.timeoutMs ?? 60_000,
    );
    interpretation = r.interpretation;
    usage.push(r.usage);
    if (interpretation.kind === 'cambio' && interpretation.ops.length > 0) {
      gate = runGate({ config: ctx.config, content: ctx.content, schema: ctx.schema, ops: interpretation.ops, rules: ctx.rules, secrets: ctx.secrets });
    }
    decision = decide(interpretation, gate, ctx.rules, { rawText: c.text, projectMode: 'contenido', ...c.context });
  } catch (err) {
    // Same as the worker: any failure or timeout ends as `derivado` (SPEC §9.9).
    error = redact(err instanceof Error ? err.message : String(err), ctx.secrets);
    decision = containsCode(c.text)
      ? { category: 'bloqueado', lane: null, reasons: ['El pedido trae HTML o código, y eso nunca se aplica'] }
      : { category: 'derivado', lane: null, reasons: [`Falla: ${error}`] };
  }
  const ms = Math.round(performance.now() - t0);

  const accepted = expectedCategories(c);
  const categoryOk = accepted.includes(decision.category);
  const laneOk = c.expected.lane === undefined || decision.category !== 'riesgoso' || decision.lane === c.expected.lane;
  const opsOk =
    c.expected.ops === undefined
      ? undefined
      : interpretation !== undefined && opsMatch(c.expected.ops, interpretation.ops, { content: ctx.content, config: ctx.config });

  return {
    id: c.id,
    text: c.text,
    source: c.source,
    suite,
    tags: c.tags,
    expected: c.expected,
    ...(interpretation ? { interpretation } : {}),
    decision,
    ...(gate ? { gate: { outcome: gate.outcome, reasons: gate.reasons, changes: gate.changes } } : {}),
    categoryOk,
    laneOk,
    ...(opsOk !== undefined ? { opsOk } : {}),
    falsePermitido: decision.category === 'permitido' && !accepted.includes('permitido'),
    prohibitedApplied: prohibitedApplied(c, decision, gate, ctx),
    wentToAgency: decision.category === 'riesgoso',
    ms,
    usage,
    costUsd: costUsd(usage),
    ...(error ? { error } : {}),
  };
}

export async function runSuite(cases: EvalCase[], suite: string, ctx: EvalContext, onResult?: (r: CaseResult) => void): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (const c of cases) {
    const r = await runCase(c, suite, ctx);
    onResult?.(r);
    out.push(r);
  }
  return out;
}
