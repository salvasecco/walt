"use server";

import { revalidatePath } from "next/cache";
import { dataMode } from "@/lib/env";
import { getLearningData, suggestionsFrom } from "@/lib/learning";
import { getLabelsFor } from "@/lib/relabel";
import { cleanRules, insertRulesVersion, rulesStructured } from "@/lib/rules";
import { AccessError, isMissingFunction, requireProject, requireRequest } from "@/lib/session";
import { applyPatch } from "@/lib/suggestions";
import { isLabelCategory, normalizeCategory, type LabelCategory } from "@/lib/taxonomy";
import { CATEGORY_LABEL } from "@/lib/labels";

export type ActionResult = { ok: true; demo?: boolean; message?: string } | { ok: false; error: string };

function errorText(e: unknown) {
  if (e instanceof AccessError) return e.message;
  return e instanceof Error ? e.message : "Error inesperado";
}

/**
 * «¿Estuvo bien clasificado?»: la agencia cambia el tipo de un pedido, con un motivo opcional. Va a
 * request_labels (RPC `label_request` de la 0004), no toca `requests.category` y Walt lo usa como ejemplo
 * en los próximos pedidos de la misma agencia.
 */
export async function relabelRequest(requestId: string, to: LabelCategory, reason: string): Promise<ActionResult> {
  try {
    const { viewer, request, db } = await requireRequest(requestId, "operar");
    if (!isLabelCategory(to)) return { ok: false, error: "Elegí un tipo." };
    const why = String(reason ?? "").trim().slice(0, 300);
    const { labels } = await getLabelsFor([request.id]);
    const current = normalizeCategory(labels.at(-1)?.to_category ?? request.category);
    if (current === to) return { ok: false, error: `Ya está como ${CATEGORY_LABEL[to].toLowerCase()}.` };
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: "Datos de ejemplo: no se guardó nada." };
    // Un pedido de ejemplo nunca entra como ejemplo de la agencia.
    if (request.is_sample) return { ok: true, demo: true, message: "Es un pedido de ejemplo: no se guarda como aprendizaje." };
    // Con usuarios, con su sesión: la RPC toma al usuario como autor y verifica que el pedido sea de su agencia.
    const { error } = await db.rpc("label_request", {
      p_request: request.id,
      p_to_category: to,
      p_reason: why || null,
      p_actor: viewer.userId,
    });
    if (error) return { ok: false, error: isMissingFunction(error) ? "Falta aplicar la migración 0004 para guardar reetiquetados." : error.message };
    revalidatePath(`/historial/${request.short_id}`);
    revalidatePath("/calidad");
    return { ok: true, message: `Listo: queda como ${CATEGORY_LABEL[to].toLowerCase()}. Walt lo va a tener en cuenta en los próximos pedidos.` };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/**
 * «Agregar a las reglas»: crea una versión nueva de las reglas del proyecto con la sugerencia aplicada.
 * La sugerencia se vuelve a calcular acá con los datos de la base (no se confía en lo que mande el navegador).
 */
export async function applyRuleSuggestion(projectId: string, suggestionId: string): Promise<ActionResult & { version?: number }> {
  try {
    const { viewer, db } = await requireProject(projectId, "configurar");
    const data = await getLearningData([projectId]);
    const suggestion = suggestionsFrom(data).find((s) => s.id === suggestionId);
    if (!suggestion) return { ok: false, error: "Esa sugerencia ya no aplica: puede que las reglas hayan cambiado." };
    const current = data.rules.get(projectId)!;
    const next = await cleanRules(applyPatch(current, suggestion.patch));
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: "Datos de ejemplo: no se guardó nada." };
    if (!suggestion.patch.policies && !(await rulesStructured())) return { ok: false, error: "Agregar zonas del código necesita la migración 0004." };
    const r = await insertRulesVersion(db, projectId, next, `${viewer.email ?? "panel"} (sugerencia)`);
    revalidatePath("/reglas");
    revalidatePath("/calidad");
    return { ok: true, message: `Listo: versión ${r.version} de las reglas.`, version: r.version };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
