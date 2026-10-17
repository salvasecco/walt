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
  reasons: string[];
}

// Most restrictive wins (all or nothing).
const RANK: Record<string, number> = {
  permitido: 0,
  'riesgoso:contenido': 1,
  'riesgoso:codigo': 2,
  derivado: 3,
  bloqueado: 4,
};

/**
 * Decides the category of a request from the interpretation and the gate (SPEC §8).
 * No AI. `gate` may be null when there are no operations to check.
 */
export function decide(
  interpretation: Interpretation,
  gate: GateResult | null,
  rules: Rules,
  ctx: DecideContext,
): Decision {
  if (containsCode(ctx.rawText)) {
    return { category: 'bloqueado', lane: null, reasons: ['El pedido trae HTML o código, y eso nunca se aplica'] };
  }
  const { kind } = interpretation;
  if (kind === 'consulta') return { category: 'consulta', lane: null, reasons: [] };
  if (kind === 'charla' || kind === 'aprobacion' || kind === 'revertir') {
    return {
      category: 'charla',
      lane: null,
      reasons: ctx.hasOpenRequest ? ['Respuesta a un pedido abierto'] : [],
    };
  }
  if (kind === 'funcion_nueva') {
    return { category: 'fuera_de_alcance', lane: null, reasons: ['Es una función nueva para la web'] };
  }

  // kind === 'cambio'
  const allowCode = ctx.allowCode ?? true;
  if (ctx.projectMode === 'codigo') {
    return allowCode
      ? { category: 'riesgoso', lane: 'codigo', reasons: ['El proyecto está en modo código: lo hace el agente con aprobación'] }
      : { category: 'derivado', lane: null, reasons: ['El proyecto no permite cambios de código'] };
  }

  const parts: { key: keyof typeof RANK; reason: string }[] = [];
  if (gate?.outcome === 'bloqueado') {
    for (const r of gate.reasons) parts.push({ key: 'bloqueado', reason: r });
  }
  const detail = interpretation.unexpressedParts.length > 0 ? `: ${interpretation.unexpressedParts.join('; ')}` : '';
  if (!interpretation.needsCode && interpretation.unexpressedParts.length > 0) {
    // Leftovers the model did not flag as code (often process instructions): the agency looks, no agent.
    parts.push({ key: 'riesgoso:contenido', reason: `Hay partes del pedido que no entraron en el cambio${detail}` });
  }
  if (interpretation.needsCode) {
    parts.push(
      allowCode
        ? { key: 'riesgoso:codigo', reason: `Hay partes que necesitan código${detail}` }
        : { key: 'derivado', reason: `Hay partes que necesitan código y el proyecto no lo permite${detail}` },
    );
  }
  if (interpretation.confidence < rules.limits.minConfidence) {
    parts.push({
      key: 'riesgoso:contenido',
      reason: `Lo entendí con poca confianza (${Math.round(interpretation.confidence * 100)}%)`,
    });
  }
  if (gate?.outcome === 'agencia') {
    for (const r of gate.reasons) parts.push({ key: 'riesgoso:contenido', reason: r });
  }
  if (parts.length === 0) {
    if (interpretation.ops.length === 0 || !gate) {
      return { category: 'derivado', lane: null, reasons: ['No pude traducir el pedido a cambios concretos'] };
    }
    return { category: 'permitido', lane: 'contenido', reasons: gate.reasons };
  }

  const top = parts.reduce((a, b) => (RANK[b.key]! > RANK[a.key]! ? b : a));
  const reasons = [...new Set(parts.map((p) => p.reason))];
  switch (top.key) {
    case 'bloqueado':
      return { category: 'bloqueado', lane: null, reasons };
    case 'derivado':
      return { category: 'derivado', lane: null, reasons };
    case 'riesgoso:codigo':
      return { category: 'riesgoso', lane: 'codigo', reasons };
    default:
      return { category: 'riesgoso', lane: 'contenido', reasons };
  }
}
