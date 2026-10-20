"use server";

import { revalidatePath } from "next/cache";
import { dataMode } from "@/lib/env";
import { cleanRules, insertRulesVersion, lines } from "@/lib/rules";
import { AccessError, agencyNameOf, requireProject, requireViewer } from "@/lib/session";
import { classifyPaths, simulate, type SimulationResult } from "@/lib/simulate";
import type { EditableRules } from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; demo?: boolean; message?: string; data?: T } | { ok: false; error: string };

const DEMO_MSG = "Datos de ejemplo: no se guardó nada. Conectá Supabase para que llegue al worker.";

function errorText(e: unknown) {
  if (e instanceof AccessError) return e.message;
  return e instanceof Error ? e.message : "Error inesperado";
}

/** Guardar inserta una versión nueva de las reglas del proyecto (SPEC §8). El worker lee la última. */
export async function saveRules(projectId: string, input: EditableRules): Promise<ActionResult<{ version: number; at: string }>> {
  try {
    const { viewer } = await requireProject(projectId, "configurar");
    const rules = await cleanRules(input);
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: DEMO_MSG, data: { version: 4, at: new Date().toISOString() } };
    const r = await insertRulesVersion(projectId, rules, viewer.email ?? "panel");
    revalidatePath("/reglas");
    return {
      ok: true,
      message: r.structured ? undefined : "Se guardaron las políticas y los límites. La política en texto y las zonas del código necesitan la migración 0004.",
      data: { version: r.version, at: r.at },
    };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

// Límite simple del simulador por persona (por instancia del servidor): cada simulación llama al modelo.
const recent = new Map<string, number[]>();
function allow(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now);
  recent.set(key, list);
  return true;
}

/**
 * Simulador de Reglas: cómo clasificaría Walt un pedido con las reglas en edición y por qué. Llama a la
 * interpretación real y a `decide`, sin guardar nada ni mandar mensajes.
 */
export async function simulateRules(input: { projectId: string; text: string; rules: EditableRules; paths?: string[] }): Promise<ActionResult<SimulationResult>> {
  try {
    const { viewer, project } = await requireProject(input.projectId, "operar");
    const text = String(input.text ?? "").trim().slice(0, 1000);
    if (!text) return { ok: false, error: "Escribí un pedido para probar." };
    if (!allow(viewer.userId ?? `instancia:${viewer.kind}`)) return { ok: false, error: "Probaste muchos pedidos seguidos: esperá un minuto." };
    const rules = await cleanRules(input.rules);
    const paths = lines(input.paths, 50).map((p) => p.slice(0, 300));
    const result = await simulate({ project, agencyName: agencyNameOf(viewer), text, rules, paths });
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Solo las rutas: qué serían con las zonas del código en edición (sin IA). */
export async function checkPaths(input: { paths: string[]; rules: EditableRules }): Promise<ActionResult<ReturnType<typeof classifyPaths>>> {
  try {
    await requireViewer("operar");
    const rules = await cleanRules(input.rules);
    return { ok: true, data: classifyPaths(lines(input.paths, 50), rules) };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
