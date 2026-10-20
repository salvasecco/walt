import "server-only";
import { dataMode } from "./env";
import { buildSample } from "./sample";
import { isMissingRelation } from "./session";
import { supabaseAdmin } from "./supabase/server";
import type { RequestLabel } from "./types";

export type LabelsResult = {
  /** La tabla request_labels existe (migración 0004). */
  ready: boolean;
  labels: RequestLabel[];
};

/** Reetiquetados de estos pedidos, del más viejo al más nuevo. Sin la 0004 no hay ninguno. */
export async function getLabelsFor(requestIds: string[]): Promise<LabelsResult> {
  if (dataMode() === "ejemplo") {
    const ids = new Set(requestIds);
    return { ready: true, labels: buildSample().labels.filter((l) => ids.has(l.request_id)).sort((a, b) => a.created_at.localeCompare(b.created_at)) };
  }
  if (dataMode() !== "supabase") return { ready: false, labels: [] };
  if (!requestIds.length) return { ready: await labelsReady(), labels: [] };
  const db = supabaseAdmin();
  const labels: RequestLabel[] = [];
  // De a 200 ids por consulta, para no pasarse del largo de la URL.
  for (let i = 0; i < requestIds.length; i += 200) {
    const { data, error } = await db.from("request_labels").select("*").in("request_id", requestIds.slice(i, i + 200)).order("created_at");
    if (error) {
      if (isMissingRelation(error)) return { ready: false, labels: [] };
      throw new Error(error.message);
    }
    labels.push(...(data as RequestLabel[]));
  }
  return { ready: true, labels };
}

/** Reetiquetados de una agencia desde una fecha (para Calidad y las sugerencias de reglas). */
export async function getFactoryLabels(factoryId: string | null, sinceIso: string): Promise<LabelsResult> {
  if (dataMode() === "ejemplo") return { ready: true, labels: buildSample().labels.filter((l) => l.created_at >= sinceIso) };
  if (dataMode() !== "supabase") return { ready: false, labels: [] };
  let q = supabaseAdmin().from("request_labels").select("*").gte("created_at", sinceIso);
  if (factoryId) q = q.eq("factory_id", factoryId);
  const { data, error } = await q.order("created_at").limit(5000);
  if (error) {
    if (isMissingRelation(error)) return { ready: false, labels: [] };
    throw new Error(error.message);
  }
  return { ready: true, labels: data as RequestLabel[] };
}

async function labelsReady(): Promise<boolean> {
  const { error } = await supabaseAdmin().from("request_labels").select("id").limit(1);
  if (error && !isMissingRelation(error)) throw new Error(error.message);
  return !error;
}

/** Mails de quienes reetiquetaron (Supabase Auth). */
export async function actorEmails(userIds: (string | null)[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length || dataMode() !== "supabase") return {};
  const db = supabaseAdmin();
  const users = await Promise.all(ids.map((id) => db.auth.admin.getUserById(id).then((r) => r.data.user ?? null).catch(() => null)));
  return Object.fromEntries(users.flatMap((u) => (u?.email ? [[u.id, u.email]] : [])));
}

/** La última etiqueta de cada pedido: la que vale. */
export function latestLabelByRequest(labels: RequestLabel[]): Map<string, RequestLabel> {
  const out = new Map<string, RequestLabel>();
  for (const l of labels) {
    const prev = out.get(l.request_id);
    if (!prev || l.created_at >= prev.created_at) out.set(l.request_id, l);
  }
  return out;
}
