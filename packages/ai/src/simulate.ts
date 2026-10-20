import {
  buildInventory,
  containsCode,
  decide,
  delicatePathReason,
  delicatePaths,
  isChangeKind,
  rulesConfig,
  runGate,
  type Decision,
  type GateResult,
  type Interpretation,
  type Inventory,
  type LabeledExample,
  type Rules,
  type Usage,
  type WaltConfig,
} from '@walt/core';
import type { AiProvider } from './types.js';

/**
 * How Walt would classify a request, without side effects: interpret → gate → options → decide, the
 * same steps as the worker. For the rules simulator in the panel ("pegás un pedido y ves cómo lo
 * clasificaría y por qué") and for the eval. Server-side (it calls the model).
 */

export interface SimulateInput {
  ai: AiProvider;
  text: string;
  rules: Rules;
  /** Content contract of the project. Without it the project is in code mode (no operations). */
  content?: { config: WaltConfig; content: unknown; schema: object };
  agencyName: string;
  clientName: string;
  /** ISO with offset, for relative dates. */
  now: string;
  /** Relabeled requests of the same agency (`ExampleSource`). */
  examples?: LabeledExample[];
  secrets?: string[];
  /** Whether the project allows the code lane. Default true. */
  allowCode?: boolean;
  /**
   * Paths a code change would touch, to show the second half of the double classification (what the
   * diff check would say). Optional: the real check runs on the agent's diff.
   */
  paths?: string[];
}

export interface SimulateResult {
  interpretation: Interpretation;
  /** Null when there are no operations to check. */
  gate: Pick<GateResult, 'outcome' | 'reasons' | 'warnings' | 'changes' | 'content'> | null;
  decision: Decision;
  /** Two readings the client would get as options, if any. */
  options?: { label: string; ops: Interpretation['ops']; warnings: string[] }[];
  /** With `paths` and a code change: what the diff check would add. */
  diff?: { category: 'simple' | 'delicado'; reasons: string[] };
  usage: Usage;
}

const EMPTY_INVENTORY: Inventory = { currency: '', texts: [], colors: [], products: [], categories: [], banner: null, hours: null, sections: null };

export async function simulateRequest(input: SimulateInput): Promise<SimulateResult> {
  const { rules } = input;
  const project = input.content;
  const inventory = project ? buildInventory(project.config, project.content) : EMPTY_INVENTORY;
  const config = rulesConfig(rules);
  const { interpretation, usage } = await input.ai.interpret({
    inventory,
    history: [],
    text: input.text,
    agencyName: input.agencyName,
    clientName: input.clientName,
    now: input.now,
    policyText: rules.policy_text,
    alwaysNew: config.alwaysNew,
    examples: input.examples,
  });
  const gateOf = (ops: Interpretation['ops']) =>
    runGate({ config: project!.config, content: project!.content, schema: project!.schema, ops, rules, secrets: input.secrets });

  let gate: GateResult | null = null;
  if (project && isChangeKind(interpretation.kind) && interpretation.ops.length > 0) gate = gateOf(interpretation.ops);
  let decision = decide(interpretation, gate, rules, {
    rawText: input.text,
    projectMode: project ? 'contenido' : 'codigo',
    allowCode: input.allowCode,
  });

  // Like the worker: two concrete readings of a simple change that both pass go to the client as options.
  let options: SimulateResult['options'];
  const offered = interpretation.options?.slice(0, 2) ?? [];
  if (project && interpretation.kind === 'simple' && interpretation.ops.length === 0 && offered.length === 2 && !containsCode(input.text)) {
    const gates = offered.map((o) => gateOf(o.ops));
    if (gates.every((g) => g.outcome === 'auto' && g.changes.length > 0)) {
      options = offered.map((o, i) => ({ label: o.label, ops: o.ops, warnings: gates[i]!.warnings }));
      gate = gates[0]!;
      decision = { category: 'simple', lane: 'contenido', reasons: [], warnings: [...new Set(gates.flatMap((g) => g.warnings))] };
    }
  }

  let diff: SimulateResult['diff'];
  if (input.paths?.length && decision.lane === 'codigo') {
    const found = delicatePaths(input.paths, config);
    diff = { category: found.length ? 'delicado' : 'simple', reasons: found.map(delicatePathReason) };
  }

  return {
    interpretation,
    gate: gate ? { outcome: gate.outcome, reasons: gate.reasons, warnings: gate.warnings, changes: gate.changes, content: gate.content } : null,
    decision,
    ...(options ? { options } : {}),
    ...(diff ? { diff } : {}),
    usage,
  };
}
