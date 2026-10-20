import "server-only";
import { dataMode } from "./env";
import { computeQuality, type QApproval, type QRequest, type Quality } from "./quality";
import { getLabelsFor } from "./relabel";
import { buildSample } from "./sample";
import { getScope, inScope } from "./session";
import { supabaseAdmin } from "./supabase/server";
import type { Approval, Project, WaltEvent } from "./types";

const DAY = 86_400_000;

export type QualityView = {
  days: number;
  overall: Quality;
  perProject: { project: Project; quality: Quality }[];
  labelsReady: boolean;
};

async function chunked<T>(ids: string[], fetch: (part: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await fetch(ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** Calidad de la agencia en los últimos `days` días, con los datos reales (o los de ejemplo en desarrollo). */
export async function getQualityView(days: number): Promise<QualityView> {
  const scope = await getScope();
  const since = new Date(Date.now() - days * DAY).toISOString();
  let requests: QRequest[];
  let approvals: QApproval[];
  let published: Pick<WaltEvent, "request_id" | "at">[];
  if (dataMode() === "ejemplo") {
    const s = buildSample();
    requests = s.requests.filter((r) => r.created_at >= since);
    const ids = new Set(requests.map((r) => r.id));
    approvals = s.approvals.filter((a) => ids.has(a.request_id));
    published = s.events.filter((e) => ids.has(e.request_id) && e.step === "publicado" && e.status === "ok");
  } else {
    const db = supabaseAdmin();
    const { data, error } = await inScope(db.from("requests").select("id, project_id, category, status, parent_request_id, cost_usd, created_at").gte("created_at", since), scope)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    requests = data as QRequest[];
    const ids = requests.map((r) => r.id);
    [approvals, published] = await Promise.all([
      chunked<Approval>(ids, (part) => db.from("approvals").select("request_id, actor, decision, at").in("request_id", part)),
      chunked<WaltEvent>(ids, (part) => db.from("events").select("request_id, at").in("request_id", part).eq("step", "publicado").eq("status", "ok")),
    ]);
  }
  const { ready, labels } = await getLabelsFor(requests.map((r) => r.id));
  const publishedAt = new Map<string, string>();
  for (const e of published) if (!publishedAt.has(e.request_id) || e.at < publishedAt.get(e.request_id)!) publishedAt.set(e.request_id, e.at);
  const overall = computeQuality({ requests, labels, approvals, publishedAt });
  const perProject = scope.projects
    .map((project) => {
      const mine = requests.filter((r) => r.project_id === project.id);
      return { project, quality: computeQuality({ requests: mine, labels, approvals, publishedAt }) };
    })
    .filter((x) => x.quality.requests > 0)
    .sort((a, b) => b.quality.requests - a.quality.requests);
  return { days, overall, perProject, labelsReady: ready };
}
