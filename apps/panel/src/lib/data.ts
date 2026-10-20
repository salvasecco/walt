import "server-only";
import { dataMode, env } from "./env";
import { buildSample } from "./sample";
import { actorEmails, getLabelsFor } from "./relabel";
import { agencyNameOf, getScope, inScope } from "./session";
import { supabaseAdmin } from "./supabase/server";
import { AGENCY_WAIT_STATUSES, categoryVariants, isPendingAgency, normalizeCategory } from "./taxonomy";
import type {
  Approval,
  Category,
  ContentVersion,
  WaltEvent,
  WaltRequest,
  Message,
  Project,
  Quote,
  RequestLabel,
  RequestStatus,
  Rules,
} from "./types";

export class NotConfiguredError extends Error {
  constructor() {
    super("Supabase no está configurado en este entorno");
  }
}

function mode() {
  const m = dataMode();
  if (m === "sin_configurar") throw new NotConfiguredError();
  return m;
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type LiveSnapshot = {
  projects: Project[];
  requests: WaltRequest[];
  events: WaltEvent[];
  messages: Message[];
  liveVersions: ContentVersion[];
  agencyName: string;
};

// Todas las lecturas pasan por el alcance de quien mira (lib/session.ts): los proyectos de su agencia, o todos
// con el acceso de la instancia. Se lee con service role y se filtra acá; el navegador usa su propia sesión.

export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  const m = mode();
  const scope = await getScope();
  if (m === "ejemplo") {
    const s = buildSample();
    const sampleIds = new Set(s.projects.filter((p) => p.is_sample).map((p) => p.id));
    return {
      projects: s.projects,
      requests: s.requests.filter((r) => !sampleIds.has(r.project_id)).slice(0, 12),
      events: s.events,
      messages: s.messages,
      liveVersions: s.versions.filter((v) => v.status === "viva"),
      agencyName: env.agencyName,
    };
  }
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const [allRequests, liveVersions] = await Promise.all([
    inScope(db.from("requests").select("*").gte("created_at", since), scope).order("created_at", { ascending: false }).limit(60).then(must<WaltRequest[]>),
    inScope(db.from("content_versions").select("*").eq("status", "viva"), scope).then(must<ContentVersion[]>),
  ]);
  // En vivo es la pantalla de la demo: sin los clientes de ejemplo (migración 0003).
  const requests = allRequests.filter((r) => !r.is_sample);
  const ids = requests.map((r) => r.id);
  const [events, messages] = ids.length
    ? await Promise.all([
        db.from("events").select("*").in("request_id", ids).order("id").then(must<WaltEvent[]>),
        db.from("messages").select("*").in("request_id", ids).order("at").then(must<Message[]>),
      ])
    : [[], []];
  return { projects: scope.projects, requests, events, messages, liveVersions, agencyName: agencyNameOf(scope.viewer) };
}

export async function getProjects(): Promise<Project[]> {
  mode();
  return (await getScope()).projects;
}

export async function getRequests(filter: { category?: Category; status?: RequestStatus; q?: string } = {}) {
  const m = mode();
  const scope = await getScope();
  const projects = scope.projects;
  let rows: WaltRequest[];
  if (m === "ejemplo") {
    rows = buildSample().requests;
    if (filter.category) rows = rows.filter((r) => normalizeCategory(r.category) === filter.category);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  } else {
    let q = inScope(supabaseAdmin().from("requests").select("*"), scope);
    // Hasta la migración de datos conviven los nombres viejos: se buscan los dos.
    if (filter.category) q = q.in("category", categoryVariants(filter.category));
    if (filter.status) q = q.eq("status", filter.status);
    rows = await q.order("created_at", { ascending: false }).limit(300).then(must<WaltRequest[]>);
  }
  if (filter.q) {
    const needle = filter.q.toLowerCase();
    rows = rows.filter(
      (r) => r.raw_text.toLowerCase().includes(needle) || r.short_id.toLowerCase().includes(needle) || (r.interpretation?.summary ?? "").toLowerCase().includes(needle),
    );
  }
  return { rows, projects };
}

export type RequestDetail = {
  request: WaltRequest;
  project: Project | null;
  events: WaltEvent[];
  messages: Message[];
  approvals: Approval[];
  versions: ContentVersion[];
  liveVersion: ContentVersion | null;
  quote: Quote | null;
  /** Reetiquetados de la agencia (0004). `labelsReady` false: falta la tabla. */
  labels: (RequestLabel & { actor_email: string | null })[];
  labelsReady: boolean;
};

async function withLabels(requestId: string) {
  const { ready, labels } = await getLabelsFor([requestId]);
  const emails = await actorEmails(labels.map((l) => l.actor_user_id));
  return { labelsReady: ready, labels: labels.map((l) => ({ ...l, actor_email: l.actor_user_id ? (emails[l.actor_user_id] ?? null) : null })) };
}

export async function getRequestDetail(shortId: string): Promise<RequestDetail | null> {
  const m = mode();
  const scope = await getScope();
  if (m === "ejemplo") {
    const s = buildSample();
    const request = s.requests.find((r) => r.short_id === shortId);
    if (!request) return null;
    return {
      request,
      project: s.projects.find((p) => p.id === request.project_id) ?? null,
      events: s.events.filter((e) => e.request_id === request.id),
      messages: s.messages.filter((m) => m.request_id === request.id),
      approvals: s.approvals.filter((a) => a.request_id === request.id),
      versions: s.versions.filter((v) => v.request_id === request.id),
      liveVersion: s.versions.find((v) => v.status === "viva" && v.project_id === request.project_id) ?? null,
      quote: s.quotes.find((q) => q.request_id === request.id) ?? null,
      ...(await withLabels(request.id)),
    };
  }
  const db = supabaseAdmin();
  const request = await db.from("requests").select("*").eq("short_id", shortId).maybeSingle().then(must<WaltRequest | null>);
  // Un pedido de otra agencia no existe para quien mira.
  const project = request ? (scope.projects.find((p) => p.id === request.project_id) ?? null) : null;
  if (!request || !project) return null;
  const [events, messages, approvals, versions, liveVersion, quote, labels] = await Promise.all([
    db.from("events").select("*").eq("request_id", request.id).order("id").then(must<WaltEvent[]>),
    db.from("messages").select("*").eq("request_id", request.id).order("at").then(must<Message[]>),
    db.from("approvals").select("*").eq("request_id", request.id).order("at").then(must<Approval[]>),
    db.from("content_versions").select("*").eq("request_id", request.id).order("created_at").then(must<ContentVersion[]>),
    db.from("content_versions").select("*").eq("project_id", request.project_id).eq("status", "viva").maybeSingle().then(must<ContentVersion | null>),
    db.from("quotes").select("*").eq("request_id", request.id).maybeSingle().then(must<Quote | null>),
    withLabels(request.id),
  ]);
  return { request, project, events, messages, approvals, versions, liveVersion, quote, ...labels };
}

/** Lo que el agente quiere cambiar en el código: el diff guardado con el evento del PR. */
export type CodeReview = { diff: string; files: string[] };

export type PendingApproval = {
  request: WaltRequest;
  project: Project | null;
  liveVersion: ContentVersion | null;
  screenshot: string | null;
  code: CodeReview | null;
};

/** Lo que espera la aprobación de la agencia: solo lo delicado (brief §1). */
export async function getPendingApprovals(): Promise<PendingApproval[]> {
  const statuses: RequestStatus[] = [...AGENCY_WAIT_STATUSES];
  const m = mode();
  const scope = await getScope();
  const projects = scope.projects;
  let requests: WaltRequest[];
  let versions: ContentVersion[];
  let messages: Message[] = [];
  let prEvents: WaltEvent[] = [];
  if (m === "ejemplo") {
    const s = buildSample();
    requests = s.requests.filter(isPendingAgency);
    prEvents = s.events.filter((e) => e.step === "agente_pr" && e.status === "ok");
    versions = s.versions.filter((v) => v.status === "viva");
  } else {
    const db = supabaseAdmin();
    [requests, versions] = await Promise.all([
      inScope(db.from("requests").select("*").in("status", statuses).in("category", categoryVariants("delicado")), scope)
        .order("created_at")
        .then(must<WaltRequest[]>),
      inScope(db.from("content_versions").select("*").eq("status", "viva"), scope).then(must<ContentVersion[]>),
    ]);
    if (requests.length)
      messages = await db
        .from("messages")
        .select("*")
        .in("request_id", requests.map((r) => r.id))
        .not("media", "is", null)
        .then(must<Message[]>);
    const codeIds = requests.filter((r) => r.lane === "codigo").map((r) => r.id);
    if (codeIds.length)
      prEvents = await db
        .from("events")
        .select("*")
        .in("request_id", codeIds)
        .eq("step", "agente_pr")
        .eq("status", "ok")
        .then(must<WaltEvent[]>);
  }
  return requests.map((request) => {
    const media = messages.filter((m) => m.request_id === request.id).map((m) => m.media).find((m) => m && typeof m.url === "string");
    const pr = prEvents.filter((e) => e.request_id === request.id).at(-1)?.detail;
    return {
      request,
      project: projects.find((p) => p.id === request.project_id) ?? null,
      liveVersion: versions.find((v) => v.project_id === request.project_id) ?? null,
      screenshot: (media?.url as string | undefined) ?? null,
      code:
        pr && typeof pr.diff === "string"
          ? { diff: pr.diff, files: Array.isArray(pr.archivos) ? (pr.archivos as string[]) : [] }
          : null,
    };
  });
}

export async function getRules(projectId: string): Promise<Rules[]> {
  const m = mode();
  const scope = await getScope();
  if (!scope.projectIds.includes(projectId)) return [];
  if (m === "ejemplo") return buildSample().rules.filter((r) => r.project_id === projectId).sort((a, b) => b.version - a.version);
  return supabaseAdmin()
    .from("rules")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(20)
    .then(must<Rules[]>);
}

export type QuoteRow = { quote: Quote; request: WaltRequest | null; project: Project | null };

export async function getQuotes(): Promise<QuoteRow[]> {
  const m = mode();
  const scope = await getScope();
  let quotes: Quote[];
  let requests: WaltRequest[];
  if (m === "ejemplo") {
    ({ quotes, requests } = buildSample());
  } else {
    const db = supabaseAdmin();
    // Solo los presupuestos de pedidos de proyectos de la agencia (join por quotes.request_id).
    let q = db.from("quotes").select("*, request:requests!quotes_request_id_fkey!inner(project_id)");
    if (!scope.all) q = q.in("request.project_id", scope.projectIds);
    const rows = await q.order("created_at", { ascending: false }).then(must<(Quote & { request?: unknown })[]>);
    quotes = rows.map((row) => {
      const quote = { ...row };
      delete quote.request;
      return quote;
    });
    const ids = quotes.map((x) => x.request_id).filter((x): x is string => !!x);
    requests = ids.length ? await db.from("requests").select("*").in("id", ids).then(must<WaltRequest[]>) : [];
  }
  return quotes.map((quote) => {
    const request = requests.find((r) => r.id === quote.request_id) ?? null;
    return { quote, request, project: scope.projects.find((p) => p.id === request?.project_id) ?? null };
  });
}

export async function getInsightsData(days = 30) {
  const m = mode();
  const scope = await getScope();
  if (m === "ejemplo") {
    const s = buildSample();
    return { requests: s.requests, projects: s.projects };
  }
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const requests = await inScope(supabaseAdmin().from("requests").select("*").gte("created_at", since), scope)
    .order("created_at", { ascending: false })
    .limit(2000)
    .then(must<WaltRequest[]>);
  return { requests, projects: scope.projects };
}
