import type { GateResult } from './gate.ts';
import type { Interpretation } from './interpretation.ts';
import type { Rules } from './rules.ts';
import type { Category, Lane, ProjectMode } from './types.ts';

/** HTML or code in the client's own text. Checked before anything else. */
export const CODE_IN_TEXT =
  /<\s*\/?\s*(script|iframe|object|embed|style|svg|img|link|meta|form|input|a\s)|javascript\s*:|data\s*:\s*text\/html|\bon[a-z]{3,}\s*=|<\?php|\{\{/i;

export function containsCode(text: string): boolean {
  return CODE_IN_TEXT.test(text);
}

export interface DecideContext {
  /** The raw client text. */
  rawText: string;
  /** Project mode: `contenido` (has walt.config.json) or `codigo`. */
  projectMode?: ProjectMode;
  /** Whether the project allows the code lane. Default true. */
  allowCode?: boolean;
  /** Whether the chat has an open request waiting for an answer. */
  hasOpenRequest?: boolean;
}

export interface Decision {
  category: Category;
  lane: Lane | null;
  /** Why it is this category, in Spanish, for the agency and the panel. */
  reasons: string[];
  /** For the client, next to the preview ("Pan de masa madre baja de $220 a $95"). They never change the category. */
  warnings: string[];
  /**
   * Nothing concrete to show yet: Walt asks the client for the missing detail. Ambiguity goes to the
   * client with options or a question, never to the agency (brief §1).
   */
  clarify?: boolean;
}

const unique = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

function decision(category: Category, lane: Lane | null, reasons: string[] = [], warnings: string[] = [], clarify = false): Decision {
  return { category, lane, reasons: unique(reasons), warnings: unique(warnings), ...(clarify ? { clarify: true } : {}) };
}

/**
 * Decides the category of a request from the interpretation and the gate (R1 taxonomy). No AI: the
 * model's kind is the intention, and code has the last word.
 *
 * | Situation | Category | Lane |
 * |---|---|---|
 * | the client's text carries HTML or code | bloqueado | — |
 * | kind consulta / charla, aprobacion, revertir / bloqueado / nuevo | the same (charla for the three) | — |
 * | the gate blocks (security, a `bloqueado` policy) | bloqueado | — |
 * | needs code and the project doesn't allow it | derivado | — |
 * | needs code (or the project is in code mode), unclear | the intention, asking the client | — |
 * | needs code (or the project is in code mode) | the intention (delicado if a policy asks the agency) | codigo |
 * | no operations | the intention, asking the client | — |
 * | a policy or the monthly quota asks the agency | delicado | contenido |
 * | operations the gate lets through | the intention (simple, or delicado by the agency's policy) | contenido |
 *
 * The code lane no longer means delicado; after the agent builds the diff, the paths it touches can
 * raise a simple request to delicado (`delicatePaths`), never lower it. Price limits, low contrast and
 * low confidence are warnings for the client's preview.
 */
export function decide(it: Interpretation, gate: GateResult | null, rules: Rules, ctx: DecideContext): Decision {
  if (containsCode(ctx.rawText)) return decision('bloqueado', null, ['El pedido trae HTML o código, y eso nunca se aplica']);
  const why = it.why?.trim();
  switch (it.kind) {
    case 'consulta':
      return decision('consulta', null);
    case 'charla':
    case 'aprobacion':
    case 'revertir':
      return decision('charla', null, ctx.hasOpenRequest ? ['Respuesta a un pedido abierto'] : []);
    case 'bloqueado':
      return decision('bloqueado', null, [why || 'El pedido no está permitido']);
    case 'nuevo':
      return decision('nuevo', null, [why || 'Es algo nuevo: va con presupuesto']);
  }

  // A change: simple or delicado by intention. What the gate blocks stays blocked (all or nothing).
  const intent = it.kind;
  const intentReasons = intent === 'delicado' ? [why || 'Toca una zona delicada'] : [];
  if (gate?.outcome === 'bloqueado') return decision('bloqueado', null, gate.reasons);
  const unexpressed = it.unexpressedParts.map((p) => p.trim()).filter(Boolean);
  const detail = unexpressed.length ? `: ${unexpressed.join('; ')}` : '';
  const unsure = it.confidence < rules.limits.minConfidence;
  const agency = gate?.outcome === 'agencia';

  if (ctx.projectMode === 'codigo' || it.needsCode) {
    if (ctx.allowCode === false) return decision('derivado', null, [`Necesita cambios de código y el proyecto no los permite${detail}`]);
    // Running the agent on a guess costs a minute and money: ask first.
    if (unsure) return decision(intent, null, [...intentReasons, 'No quedó claro qué hay que cambiar: le pregunto al cliente'], [], true);
    return decision(agency ? 'delicado' : intent, 'codigo', [...intentReasons, ...(agency ? gate.reasons : [])], gate?.warnings ?? []);
  }

  if (it.ops.length === 0) {
    return decision(intent, null, [...intentReasons, 'No pude armar un cambio concreto: le pregunto al cliente'], [], true);
  }
  if (!gate) return decision('derivado', null, ['No pude validar el cambio contra la web']);
  const warnings = [
    ...(unsure ? ['No estoy del todo seguro de haberlo entendido: revisalo bien antes de darle el OK'] : []),
    ...gate.warnings,
    ...(unexpressed.length ? [`Esto no lo pude hacer: ${unexpressed.join('; ')}`] : []),
  ];
  if (agency) return decision('delicado', 'contenido', [...intentReasons, ...gate.reasons], warnings);
  return decision(intent, 'contenido', intentReasons, warnings);
}
