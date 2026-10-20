import "server-only";
import { ALWAYS_DELICATE_GLOBS, RULE_TEMPLATES, RulesConfigSchema, RulesSchema, rulesFromRow, type RuleTemplate } from "@walt/core";
import { dataMode } from "./env";
import { buildSample } from "./sample";
import { getScope, isMissingColumn } from "./session";
import { supabaseAdmin } from "./supabase/server";
import { OP_TYPES, type EditableRules, type OpType, type Policy, type Rules } from "./types";

export type RulesVersion = Rules & { editable: EditableRules };

export type RulesView = {
  versions: RulesVersion[];
  /** La vigente (o la de por defecto si el proyecto no tiene ninguna), completa para editar. */
  current: EditableRules;
  /** Hay `policy_text` y `config` en la base (migración 0004). Sin ellas solo se guardan políticas y límites. */
  structured: boolean;
  templates: Pick<RuleTemplate, "id" | "label" | "description" | "policy_text" | "config">[];
  alwaysDelicate: readonly string[];
};

let probe: { at: number; ok: boolean } | null = null;

/** ¿Tiene `rules` las columnas de la 0004? Se mira cada 30 s. */
export async function rulesStructured(): Promise<boolean> {
  if (dataMode() === "ejemplo") return true;
  if (dataMode() !== "supabase") return false;
  if (probe && Date.now() - probe.at < 30_000) return probe.ok;
  const { error } = await supabaseAdmin().from("rules").select("policy_text, config").limit(1);
  if (error && !isMissingColumn(error)) throw new Error(error.message);
  probe = { at: Date.now(), ok: !error };
  return probe.ok;
}

/** Una fila de `rules` (con o sin las columnas de la 0004) lista para editar, con la lógica de @walt/core. */
export function toEditable(row: Pick<Rules, "policies" | "limits" | "policy_text" | "config"> | null): EditableRules {
  const r = rulesFromRow(row ?? { policies: undefined, limits: undefined });
  return {
    policies: r.policies as Record<OpType, Policy>,
    limits: r.limits,
    policy_text: r.policy_text ?? "",
    config: r.config!,
  };
}

/** Versiones de las reglas de un proyecto de la agencia, de la más nueva a la más vieja (las últimas 20). */
export async function getRulesView(projectId: string): Promise<RulesView> {
  const scope = await getScope();
  const templates = Object.values(RULE_TEMPLATES).map(({ id, label, description, policy_text, config }) => ({ id, label, description, policy_text, config }));
  const base = { templates, alwaysDelicate: ALWAYS_DELICATE_GLOBS };
  if (!scope.projectIds.includes(projectId)) return { versions: [], current: toEditable(null), structured: false, ...base };
  let rows: Rules[];
  if (dataMode() === "ejemplo") rows = buildSample().rules.filter((r) => r.project_id === projectId).sort((a, b) => b.version - a.version);
  else {
    const { data, error } = await supabaseAdmin().from("rules").select("*").eq("project_id", projectId).order("version", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    rows = data as Rules[];
  }
  const versions = rows.map((r) => ({ ...r, editable: toEditable(r) }));
  return { versions, current: versions[0]?.editable ?? toEditable(null), structured: await rulesStructured(), ...base };
}

// ── Escritura (solo desde acciones de servidor que ya verificaron la membership) ──

const clamp = (n: unknown, min: number, max: number) => {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new Error("Hay un número inválido.");
  return Math.min(max, Math.max(min, v));
};

export const lines = (xs: unknown, max = 200) =>
  [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x).trim()).filter(Boolean))].slice(0, max);

/** Valida y limpia las reglas que vienen del navegador (nunca se confía en el cliente). */
export async function cleanRules(input: EditableRules): Promise<EditableRules> {
  for (const t of OP_TYPES) if (!["auto", "agencia", "bloqueado"].includes(input.policies?.[t])) throw new Error(`Política inválida en ${t}`);
  const priceWarn = clamp(input.config?.priceWarnPct ?? input.limits?.maxPriceChangePct ?? 30, 1, 1000);
  const config = RulesConfigSchema.parse({
    delicateGlobs: lines(input.config?.delicateGlobs),
    protectedGlobs: lines(input.config?.protectedGlobs),
    simpleGlobs: lines(input.config?.simpleGlobs),
    alwaysNew: lines(input.config?.alwaysNew, 50),
    template: String(input.config?.template ?? "generic").slice(0, 60) || "generic",
    priceWarnPct: priceWarn,
    ...(input.config?.depositPct != null ? { depositPct: clamp(input.config.depositPct, 0, 100) } : {}),
  });
  const rules = {
    policies: Object.fromEntries(OP_TYPES.map((t) => [t, input.policies[t]])) as EditableRules["policies"],
    limits: {
      // R1: es el umbral de la advertencia de precio de la vista previa; se guarda igual que `priceWarnPct`.
      maxPriceChangePct: priceWarn,
      monthlyQuota: Math.round(clamp(input.limits?.monthlyQuota, 0, 100_000)),
      minConfidence: clamp(input.limits?.minConfidence, 0, 1),
      maxOpsPerRequest: Math.round(clamp(input.limits?.maxOpsPerRequest, 1, 500)),
    },
    policy_text: String(input.policy_text ?? "").trim().slice(0, 8000),
    config,
  };
  RulesSchema.parse(rules);
  return rules;
}

/** Inserta una versión nueva (última + 1); reintenta si otra pestaña guardó la misma versión al mismo tiempo. */
export async function insertRulesVersion(projectId: string, rules: EditableRules, createdBy: string): Promise<{ version: number; at: string; structured: boolean }> {
  const structured = await rulesStructured();
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last, error: e1 } = await db.from("rules").select("version").eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (e1) throw new Error(e1.message);
    const version = (last?.version ?? 0) + 1;
    const row = {
      project_id: projectId,
      version,
      policies: rules.policies,
      limits: rules.limits,
      created_by: createdBy,
      // Sin la 0004 no hay dónde guardar la política ni las reglas estructuradas.
      ...(structured ? { policy_text: rules.policy_text, config: rules.config } : {}),
    };
    const { data, error } = await db.from("rules").insert(row).select("version, created_at").single();
    if (!error) return { version: data.version, at: data.created_at, structured };
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("No se pudo guardar: otra versión se guardó al mismo tiempo. Probá de nuevo.");
}

