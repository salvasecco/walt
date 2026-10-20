import "server-only";
import { dataMode } from "./env";
import { OP_LABEL } from "./labels";
import { getFactoryLabels } from "./relabel";
import { toEditable } from "./rules";
import { buildSample } from "./sample";
import { getScope, inScope } from "./session";
import { suggestRules, type RequestLite, type RuleSuggestion } from "./suggestions";
import { supabaseAdmin } from "./supabase/server";
import type { EditableRules, OpType, Project, RequestLabel, Rules, WaltEvent, WaltRequest } from "./types";

const DAY = 86_400_000;
/** Ventana de aprendizaje para las sugerencias: los últimos 90 días. */
export const LEARNING_DAYS = 90;

export type LearningData = {
  ready: boolean;
  projects: Project[];
  labels: RequestLabel[];
  requests: RequestLite[];
  rules: Map<string, EditableRules>;
};

function filesOf(events: Pick<WaltEvent, "request_id" | "step" | "status" | "detail">[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of events) {
    if (e.step !== "agente_pr" || e.status !== "ok") continue;
    const files = (e.detail as { archivos?: unknown } | null)?.archivos;
    if (Array.isArray(files)) out.set(e.request_id, files.filter((f): f is string => typeof f === "string"));
  }
  return out;
}

const toLite = (r: Pick<WaltRequest, "id" | "short_id" | "project_id" | "raw_text" | "lane" | "category" | "ops">, files: Map<string, string[]>): RequestLite => ({
  id: r.id,
  short_id: r.short_id,
  project_id: r.project_id,
  raw_text: r.raw_text,
  lane: r.lane,
  category: r.category,
  opTypes: (r.ops ?? []).map((o) => o.type),
  files: files.get(r.id) ?? [],
});

/** Reetiquetados, pedidos (con los archivos que tocó el agente) y reglas vigentes de los proyectos de la agencia. */
export async function getLearningData(projectIds?: string[]): Promise<LearningData> {
  const scope = await getScope();
  const projects = scope.projects.filter((p) => !projectIds || projectIds.includes(p.id));
  const ids = projects.map((p) => p.id);
  const since = new Date(Date.now() - LEARNING_DAYS * DAY).toISOString();
  if (dataMode() === "ejemplo") {
    const s = buildSample();
    const files = filesOf(s.events);
    const rules = new Map<string, EditableRules>();
    for (const p of projects) {
      const last = s.rules.filter((r) => r.project_id === p.id).sort((a, b) => b.version - a.version)[0] ?? null;
      rules.set(p.id, toEditable(last));
    }
    const reqs = s.requests.filter((r) => ids.includes(r.project_id) && r.created_at >= since);
    return { ready: true, projects, labels: s.labels.filter((l) => reqs.some((r) => r.id === l.request_id)), requests: reqs.map((r) => toLite(r, files)), rules };
  }
  if (dataMode() !== "supabase" || !ids.length) return { ready: dataMode() === "supabase", projects, labels: [], requests: [], rules: new Map() };
  const db = supabaseAdmin();
  const [labelsRes, requests, rulesRows] = await Promise.all([
    getFactoryLabels(scope.all ? null : scope.factoryId, since),
    inScope(db.from("requests").select("id, short_id, project_id, raw_text, lane, category, ops").gte("created_at", since).in("project_id", ids), scope)
      .order("created_at", { ascending: false })
      .limit(3000)
      .then((r) => {
        if (r.error) throw new Error(r.error.message);
        return r.data as Pick<WaltRequest, "id" | "short_id" | "project_id" | "raw_text" | "lane" | "category" | "ops">[];
      }),
    db
      .from("rules")
      .select("*")
      .in("project_id", ids)
      .order("version", { ascending: false })
      .limit(ids.length * 20)
      .then((r) => {
        if (r.error) throw new Error(r.error.message);
        return r.data as Rules[];
      }),
  ]);
  // Un reetiquetado reciente puede ser de un pedido de antes de la ventana: se trae también.
  const known = new Set(requests.map((r) => r.id));
  const missing = [...new Set(labelsRes.labels.map((l) => l.request_id).filter((id) => !known.has(id)))];
  if (missing.length) {
    const { data, error } = await inScope(db.from("requests").select("id, short_id, project_id, raw_text, lane, category, ops").in("id", missing.slice(0, 500)), scope);
    if (error) throw new Error(error.message);
    requests.push(...((data ?? []) as typeof requests).filter((r) => ids.includes(r.project_id)));
  }
  const codeIds = requests.filter((r) => r.lane === "codigo").map((r) => r.id);
  const events: WaltEvent[] = [];
  for (let i = 0; i < codeIds.length; i += 200) {
    const { data, error } = await db.from("events").select("request_id, step, status, detail").in("request_id", codeIds.slice(i, i + 200)).eq("step", "agente_pr").eq("status", "ok");
    if (error) throw new Error(error.message);
    events.push(...(data as WaltEvent[]));
  }
  const files = filesOf(events);
  const rules = new Map<string, EditableRules>();
  for (const p of projects) rules.set(p.id, toEditable(rulesRows.find((r) => r.project_id === p.id) ?? null));
  const inProjects = new Set(requests.map((r) => r.id));
  return { ready: labelsRes.ready, projects, labels: labelsRes.labels.filter((l) => inProjects.has(l.request_id)), requests: requests.map((r) => toLite(r, files)), rules };
}

/** Sugerencias de reglas por proyecto, a partir de los reetiquetados (función pura `suggestRules`). */
export function suggestionsFrom(data: LearningData): RuleSuggestion[] {
  return data.projects.flatMap((p) =>
    suggestRules({
      projectId: p.id,
      rules: data.rules.get(p.id)!,
      labels: data.labels,
      requests: data.requests,
      opLabel: (t) => OP_LABEL[t as OpType] ?? t,
    }),
  );
}
