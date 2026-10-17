import "server-only";
import { dataMode, env } from "./env";
import { buildSample } from "./sample";
import { supabaseAdmin } from "./supabase/server";
import type {
  Approval,
  Category,
  ContentVersion,
  DaleEvent,
  DaleRequest,
  Message,
  Project,
  Quote,
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
  requests: DaleRequest[];
  events: DaleEvent[];
  messages: Message[];
  liveVersions: ContentVersion[];
  agencyName: string;
};

export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  if (mode() === "ejemplo") {
    const s = buildSample();
    return {
      projects: s.projects,
      requests: s.requests.slice(0, 12),
      events: s.events,
      messages: s.messages,
      liveVersions: s.versions.filter((v) => v.status === "viva"),
      agencyName: env.agencyName,
    };
  }
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const [projects, requests, liveVersions] = await Promise.all([
    db.from("projects").select("*").order("created_at").then(must<Project[]>),
    db.from("requests").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(60).then(must<DaleRequest[]>),
    db.from("content_versions").select("*").eq("status", "viva").then(must<ContentVersion[]>),
  ]);
  const ids = requests.map((r) => r.id);
  const [events, messages] = ids.length
    ? await Promise.all([
        db.from("events").select("*").in("request_id", ids).order("id").then(must<DaleEvent[]>),
        db.from("messages").select("*").in("request_id", ids).order("at").then(must<Message[]>),
      ])
    : [[], []];
  return { projects, requests, events, messages, liveVersions, agencyName: env.agencyName };
}

export async function getProjects(): Promise<Project[]> {
  if (mode() === "ejemplo") return buildSample().projects;
  return supabaseAdmin().from("projects").select("*").order("created_at").then(must<Project[]>);
}

export async function getRequests(filter: { category?: Category; status?: RequestStatus; q?: string } = {}) {
  let rows: DaleRequest[];
  let projects: Project[];
  if (mode() === "ejemplo") {
    const s = buildSample();
    rows = s.requests;
    projects = s.projects;
    if (filter.category) rows = rows.filter((r) => r.category === filter.category);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  } else {
    const db = supabaseAdmin();
    let q = db.from("requests").select("*").order("created_at", { ascending: false }).limit(300);
    if (filter.category) q = q.eq("category", filter.category);
    if (filter.status) q = q.eq("status", filter.status);
    [rows, projects] = await Promise.all([q.then(must<DaleRequest[]>), getProjects()]);
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
  request: DaleRequest;
  project: Project | null;
  events: DaleEvent[];
  messages: Message[];
  approvals: Approval[];
  versions: ContentVersion[];
  liveVersion: ContentVersion | null;
  quote: Quote | null;
};

export async function getRequestDetail(shortId: string): Promise<RequestDetail | null> {
  if (mode() === "ejemplo") {
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
    };
  }
  const db = supabaseAdmin();
  const request = await db.from("requests").select("*").eq("short_id", shortId).maybeSingle().then(must<DaleRequest | null>);
  if (!request) return null;
  const [project, events, messages, approvals, versions, liveVersion, quote] = await Promise.all([
    db.from("projects").select("*").eq("id", request.project_id).maybeSingle().then(must<Project | null>),
    db.from("events").select("*").eq("request_id", request.id).order("id").then(must<DaleEvent[]>),
    db.from("messages").select("*").eq("request_id", request.id).order("at").then(must<Message[]>),
    db.from("approvals").select("*").eq("request_id", request.id).order("at").then(must<Approval[]>),
    db.from("content_versions").select("*").eq("request_id", request.id).order("created_at").then(must<ContentVersion[]>),
    db.from("content_versions").select("*").eq("project_id", request.project_id).eq("status", "viva").maybeSingle().then(must<ContentVersion | null>),
    db.from("quotes").select("*").eq("request_id", request.id).maybeSingle().then(must<Quote | null>),
  ]);
  return { request, project, events, messages, approvals, versions, liveVersion, quote };
}

export type PendingApproval = {
  request: DaleRequest;
  project: Project | null;
  liveVersion: ContentVersion | null;
  screenshot: string | null;
};

export async function getPendingApprovals(): Promise<PendingApproval[]> {
  const statuses: RequestStatus[] = ["esperando_agencia", "agente_listo"];
  let requests: DaleRequest[];
  let projects: Project[];
  let versions: ContentVersion[];
  let messages: Message[] = [];
  if (mode() === "ejemplo") {
    const s = buildSample();
    requests = s.requests.filter((r) => statuses.includes(r.status));
    projects = s.projects;
    versions = s.versions.filter((v) => v.status === "viva");
  } else {
    const db = supabaseAdmin();
    [requests, projects, versions] = await Promise.all([
      db.from("requests").select("*").in("status", statuses).order("created_at").then(must<DaleRequest[]>),
      getProjects(),
      db.from("content_versions").select("*").eq("status", "viva").then(must<ContentVersion[]>),
    ]);
    if (requests.length)
      messages = await db
        .from("messages")
        .select("*")
        .in("request_id", requests.map((r) => r.id))
        .not("media", "is", null)
        .then(must<Message[]>);
  }
  return requests.map((request) => {
    const media = messages.filter((m) => m.request_id === request.id).map((m) => m.media).find((m) => m && typeof m.url === "string");
    return {
      request,
      project: projects.find((p) => p.id === request.project_id) ?? null,
      liveVersion: versions.find((v) => v.project_id === request.project_id) ?? null,
      screenshot: (media?.url as string | undefined) ?? null,
    };
  });
}

export async function getRules(projectId: string): Promise<Rules[]> {
  if (mode() === "ejemplo") return buildSample().rules.filter((r) => r.project_id === projectId).sort((a, b) => b.version - a.version);
  return supabaseAdmin()
    .from("rules")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(20)
    .then(must<Rules[]>);
}

export type QuoteRow = { quote: Quote; request: DaleRequest | null; project: Project | null };

export async function getQuotes(): Promise<QuoteRow[]> {
  let quotes: Quote[];
  let requests: DaleRequest[];
  let projects: Project[];
  if (mode() === "ejemplo") {
    const s = buildSample();
    ({ quotes, requests, projects } = s);
  } else {
    const db = supabaseAdmin();
    quotes = await db.from("quotes").select("*").order("created_at", { ascending: false }).then(must<Quote[]>);
    const ids = quotes.map((q) => q.request_id).filter((x): x is string => !!x);
    [requests, projects] = await Promise.all([
      ids.length ? db.from("requests").select("*").in("id", ids).then(must<DaleRequest[]>) : Promise.resolve([]),
      getProjects(),
    ]);
  }
  return quotes.map((quote) => {
    const request = requests.find((r) => r.id === quote.request_id) ?? null;
    return { quote, request, project: projects.find((p) => p.id === request?.project_id) ?? null };
  });
}

export async function getInsightsData(days = 30) {
  if (mode() === "ejemplo") {
    const s = buildSample();
    return { requests: s.requests, projects: s.projects };
  }
  const db = supabaseAdmin();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [requests, projects] = await Promise.all([
    db.from("requests").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(2000).then(must<DaleRequest[]>),
    getProjects(),
  ]);
  return { requests, projects };
}
