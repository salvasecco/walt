"use server";

import { revalidatePath } from "next/cache";
import { factoryOf } from "@/lib/ai";
import { looksLikeAnthropicKey, validateAnthropicKey } from "@/lib/ai-key";
import { dataMode } from "@/lib/env";
import { AccessError, getScope, isMissingFunction, isMissingRelation, requireProject, requireViewer } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ActionResult = { ok: true; demo?: boolean; message?: string } | { ok: false; error: string };

type Mode = "platform" | "byok" | "credits" | "claude_code";

const DEMO_MSG = "Datos de ejemplo: no se guardó nada.";
const NEEDS_0004 = "Los modos de IA llegan con la migración 0004.";

function errorText(e: unknown) {
  if (e instanceof AccessError) return e.message;
  return e instanceof Error ? e.message : "Error inesperado";
}

/** Agencia y proyecto sobre los que actúa quien configura (owner o admin). */
async function target(projectId: string | null): Promise<{ factoryId: string; projectId: string | null }> {
  if (projectId) {
    const { project } = await requireProject(projectId, "configurar");
    return { factoryId: project.factory_id, projectId };
  }
  const viewer = await requireViewer("configurar");
  const factoryId = viewer.factory?.id ?? factoryOf(await getScope());
  if (!factoryId) throw new AccessError("Elegí una agencia.");
  return { factoryId, projectId: null };
}

function done(message: string): ActionResult {
  revalidatePath("/ia");
  return { ok: true, message };
}

/**
 * Cambia el modo de la agencia (projectId null) o el de un proyecto. `platform` en la agencia o `inherit` en un
 * proyecto borran la fila (y la clave guardada, si había). BYOK se activa al guardar una clave válida.
 */
export async function setAiMode(projectId: string | null, mode: Mode | "inherit"): Promise<ActionResult> {
  try {
    const t = await target(projectId);
    if (!["platform", "byok", "credits", "claude_code", "inherit"].includes(mode)) return { ok: false, error: "Modo inválido." };
    if (mode === "inherit" && !t.projectId) return { ok: false, error: "La agencia no hereda de nadie." };
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: DEMO_MSG };
    const db = supabaseAdmin();
    const row = () => {
      const q = db.from("ai_settings").select("secret_id").eq("factory_id", t.factoryId);
      return t.projectId ? q.eq("project_id", t.projectId) : q.is("project_id", null);
    };
    const { data: current, error: e0 } = await row().maybeSingle();
    if (e0) return { ok: false, error: isMissingRelation(e0) ? NEEDS_0004 : e0.message };
    if ((mode === "platform" && !t.projectId) || mode === "inherit") {
      if (current?.secret_id) {
        const { error } = await db.rpc("clear_ai_key", { p_factory: t.factoryId, p_project: t.projectId });
        if (error) return { ok: false, error: isMissingFunction(error) ? NEEDS_0004 : error.message };
      }
      const del = db.from("ai_settings").delete().eq("factory_id", t.factoryId);
      const { error } = await (t.projectId ? del.eq("project_id", t.projectId) : del.is("project_id", null));
      if (error) return { ok: false, error: error.message };
      return done(t.projectId ? "Listo: el proyecto usa el modo de la agencia." : "Listo: la IA la pone Walt, como hasta ahora.");
    }
    if (mode === "byok" && !current?.secret_id) return { ok: false, error: "Cargá la clave de Anthropic para usar este modo." };
    const { error } = await db.from("ai_settings").upsert({ factory_id: t.factoryId, project_id: t.projectId, mode }, { onConflict: "factory_id,project_id" });
    if (error) return { ok: false, error: isMissingRelation(error) ? NEEDS_0004 : error.message };
    return done("Modo actualizado.");
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/**
 * BYOK: valida la clave con Anthropic y la guarda en Supabase Vault (RPC `set_ai_key` de la 0004), que deja
 * el modo en BYOK. La clave no se loguea, no se guarda en ningún otro lado y nunca se vuelve a mostrar.
 */
export async function saveAiKey(projectId: string | null, key: string): Promise<ActionResult> {
  try {
    const t = await target(projectId);
    const clean = String(key ?? "").trim();
    if (!looksLikeAnthropicKey(clean)) return { ok: false, error: "Eso no parece una API key de Anthropic (empieza con sk-ant-)." };
    const check = await validateAnthropicKey(clean);
    if (!check.ok) return check;
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: `La clave es válida. ${DEMO_MSG}` };
    const { error } = await supabaseAdmin().rpc("set_ai_key", { p_factory: t.factoryId, p_project: t.projectId, p_key: clean });
    // Nunca el mensaje crudo: podría citar el valor.
    if (error) return { ok: false, error: isMissingFunction(error) ? NEEDS_0004 : "No se pudo guardar la clave en el Vault." };
    return done(`Clave ••••${clean.slice(-4)} validada y guardada.${check.note ? ` ${check.note}` : ""}`);
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function clearAiKey(projectId: string | null): Promise<ActionResult> {
  try {
    const t = await target(projectId);
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: DEMO_MSG };
    const { error } = await supabaseAdmin().rpc("clear_ai_key", { p_factory: t.factoryId, p_project: t.projectId });
    if (error) return { ok: false, error: isMissingFunction(error) ? NEEDS_0004 : error.message };
    return done("Listo: la clave se borró. Sin clave, este modo no corre: elegí otro o cargá una nueva.");
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Topes de gasto y alerta (BYOK y créditos). null = sin tope. */
export async function saveAiCaps(projectId: string | null, caps: { monthlyCapUsd: number | null; requestCapUsd: number | null; alertPct: number }): Promise<ActionResult> {
  try {
    const t = await target(projectId);
    const money = (n: number | null) => {
      if (n == null || String(n) === "") return null;
      const v = Number(n);
      if (!Number.isFinite(v) || v < 0 || v > 1_000_000) throw new Error("Revisá los topes: tienen que ser montos positivos.");
      return Math.round(v * 100) / 100;
    };
    const alert = Math.round(Number(caps.alertPct));
    if (!(alert >= 1 && alert <= 100)) return { ok: false, error: "La alerta va de 1 a 100%." };
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: DEMO_MSG };
    const q = supabaseAdmin()
      .from("ai_settings")
      .update({ monthly_cap_usd: money(caps.monthlyCapUsd), request_cap_usd: money(caps.requestCapUsd), alert_pct: alert })
      .eq("factory_id", t.factoryId);
    const { data, error } = await (t.projectId ? q.eq("project_id", t.projectId) : q.is("project_id", null)).select("id");
    if (error) return { ok: false, error: isMissingRelation(error) ? NEEDS_0004 : error.message };
    if (!data?.length) return { ok: false, error: "Con la clave de Walt no hay topes que configurar." };
    return done("Topes guardados.");
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
