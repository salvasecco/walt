// El plan que eligió en la landing, como intención: viaja en la URL del registro (`/registro?plan=&ciclo=`),
// en los metadatos del usuario de Supabase Auth y termina en la agencia (factories.plan_intent, migración 0007).

import { isCycle, planById, type Cycle, type PlanId } from "./config";

export interface PlanIntent {
  plan: PlanId;
  cycle: Cycle;
}

/** Lee el plan de cualquier lado (URL, formulario, metadatos). Inválido o ausente: null. */
export function readPlanIntent(plan: unknown, cycle: unknown): PlanIntent | null {
  const p = typeof plan === "string" ? planById(plan) : null;
  if (!p) return null;
  return { plan: p.id, cycle: typeof cycle === "string" && isCycle(cycle) ? cycle : "mensual" };
}

/** Del usuario de Supabase Auth (guardado al registrarse). */
export function planIntentFromMeta(meta: Record<string, unknown> | null | undefined): PlanIntent | null {
  return readPlanIntent(meta?.plan_intent, meta?.plan_cycle);
}
