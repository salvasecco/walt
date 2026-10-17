import "server-only";
import { cache } from "react";
import { buildBoard, type AttQuote, type AttRequest, type AttVersion, type Column, type ProjectAttention } from "./attention";
import { clientHealth, countsAsChange, lastMonths, monthKey, usageByMonth, type Health, type MonthUsage } from "./client-health";
import { NotConfiguredError } from "./data";
import { dataMode } from "./env";
import { buildSample } from "./sample";
import { supabaseAdmin } from "./supabase/server";
import type { Client, Contact, DaleRequest, Message, Project, Quote, RequestStatus } from "./types";

const DAY = 86_400_000;

function mode() {
  const m = dataMode();
  if (m === "sin_configurar") throw new NotConfiguredError();
  return m;
}

function must<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const LIGHT_REQUEST = "id, short_id, project_id, raw_text, status, category, lane, cost_usd, created_at, summary:interpretation->>summary";

/** Pedido liviano: sin los jsonb grandes, con el resumen de la interpretación. */
export type LightRequest = Pick<DaleRequest, "id" | "short_id" | "project_id" | "raw_text" | "status" | "category" | "lane" | "cost_usd" | "created_at"> & {
  summary: string | null;
};

const toLight = (r: DaleRequest): LightRequest => ({
  id: r.id,
  short_id: r.short_id,
  project_id: r.project_id,
  raw_text: r.raw_text,
  status: r.status,
  category: r.category,
  lane: r.lane,
  cost_usd: r.cost_usd,
  created_at: r.created_at,
  summary: r.interpretation?.summary ?? null,
});

type Base = { projects: Project[]; clients: Client[]; clientsReady: boolean };

/** Proyectos y clientes. Sin la migración 0003, `clientsReady` es false y no hay clientes. */
const getBase = cache(async (): Promise<Base> => {
  if (mode() === "ejemplo") {
    const s = buildSample();
    return { projects: s.projects, clients: s.clients, clientsReady: true };
  }
  const db = supabaseAdmin();
  const [projects, clientsRes] = await Promise.all([
    db.from("projects").select("*").order("created_at").then(must<Project[]>),
    db.from("clients").select("*").order("name"),
  ]);
  if (clientsRes.error) return { projects, clients: [], clientsReady: false };
  return { projects, clients: clientsRes.data as Client[], clientsReady: true };
});

const OPEN: RequestStatus[] = ["esperando_agencia", "agente_listo", "esperando_cliente", "recibido", "interpretando", "cotizando", "agente_trabajando", "publicando"];

export type AttentionCard = ProjectAttention & { project: Project; client: Client | null; sample: boolean };

export type AttentionData = {
  board: Record<Column, AttentionCard[]>;
  needCount: number;
  clientsReady: boolean;
  now: number;
};

/** Tablero de Atención. Compartido en un mismo render entre el layout (contador) y la pantalla. */
export const getAttention = cache(async (): Promise<AttentionData> => {
  const now = Date.now();
  const base = await getBase();
  let requests: AttRequest[];
  let quotes: AttQuote[];
  let versions: AttVersion[];
  if (mode() === "ejemplo") {
    const s = buildSample(now);
    const shortOf = new Map(s.requests.map((r) => [r.id, r]));
    requests = s.requests.filter((r) => OPEN.includes(r.status) || now - Date.parse(r.created_at) <= 7 * DAY).map(toLight);
    quotes = s.quotes.map((q) => ({ ...q, project_id: shortOf.get(q.request_id ?? "")?.project_id ?? null, request_short_id: shortOf.get(q.request_id ?? "")?.short_id ?? null }));
    versions = s.versions.map((v) => ({ ...v, request_short_id: shortOf.get(v.request_id ?? "")?.short_id ?? null }));
  } else {
    const db = supabaseAdmin();
    const since = new Date(now - 7 * DAY).toISOString();
    const [reqs, qs, vs] = await Promise.all([
      db
        .from("requests")
        .select(LIGHT_REQUEST)
        .or(`status.in.(${OPEN.join(",")}),created_at.gte.${since}`)
        .order("created_at", { ascending: false })
        .limit(1000)
        .then(must<LightRequest[]>),
      db.from("quotes").select("id, status, title, created_at, request_id").in("status", ["borrador", "enviado"]).then(must<{ id: string; status: AttQuote["status"]; title: string; created_at: string; request_id: string }[]>),
      db
        .from("content_versions")
        .select("id, project_id, request_id, status, git_error, git_commit_sha, created_at")
        .eq("status", "viva")
        .not("git_error", "is", null)
        .then(must<(Omit<AttVersion, "request_short_id"> & { request_id: string | null })[]>),
    ]);
    const known = new Map(reqs.map((r) => [r.id, { project_id: r.project_id, short_id: r.short_id }]));
    const missing = [...new Set([...qs.map((q) => q.request_id), ...vs.map((v) => v.request_id)].filter((id): id is string => !!id && !known.has(id)))];
    if (missing.length) {
      const extra = await db.from("requests").select("id, project_id, short_id").in("id", missing).then(must<{ id: string; project_id: string; short_id: string }[]>);
      for (const r of extra) known.set(r.id, r);
    }
    requests = reqs;
    quotes = qs.map((q) => ({ ...q, project_id: known.get(q.request_id)?.project_id ?? null, request_short_id: known.get(q.request_id)?.short_id ?? null }));
    versions = vs.map((v) => ({ ...v, request_short_id: v.request_id ? (known.get(v.request_id)?.short_id ?? null) : null }));
  }
  const raw = buildBoard(base.projects.map((p) => p.id), { requests, quotes, versions }, now);
  const clientById = new Map(base.clients.map((c) => [c.id, c]));
  const projectById = new Map(base.projects.map((p) => [p.id, p]));
  const decorate = (a: ProjectAttention): AttentionCard => {
    const project = projectById.get(a.projectId)!;
    const client = project.client_id ? (clientById.get(project.client_id) ?? null) : null;
    return { ...a, project, client, sample: !!(project.is_sample || client?.is_sample) };
  };
  const board = {
    te_necesita: raw.te_necesita.map(decorate),
    esperando_cliente: raw.esperando_cliente.map(decorate),
    en_curso: raw.en_curso.map(decorate),
    al_dia: raw.al_dia.map(decorate),
  };
  return { board, needCount: board.te_necesita.length, clientsReady: base.clientsReady, now };
});

/** Contador del menú: proyectos en "Te necesita". Nunca rompe el layout. */
export async function getNeedCount(): Promise<number> {
  if (dataMode() === "sin_configurar") return 0;
  try {
    return (await getAttention()).needCount;
  } catch {
    return 0;
  }
}

// ── Clientes ──────────────────────────────────────────────────────────────

const MONTHS = 6;

export type ClientSummary = {
  client: Client;
  projects: Project[];
  usedThisMonth: number;
  costThisMonth: number;
  lastRequestAt: string | null;
  health: Health;
  needCount: number;
};

/** Cada cliente con su consumo del mes y su salud. Los proyectos sin cliente van aparte. */
async function summarize(base: Base, requests: LightRequest[], attention: AttentionData): Promise<ClientSummary[]> {
  const month = monthKey(attention.now);
  const needsByProject = new Map(attention.board.te_necesita.map((c) => [c.projectId, c.items.filter((i) => i.column === "te_necesita").map((i) => i.since)]));
  return base.clients.map((client) => {
    const projects = base.projects.filter((p) => p.client_id === client.id);
    const ids = new Set(projects.map((p) => p.id));
    const own = requests.filter((r) => ids.has(r.project_id));
    const thisMonth = own.filter((r) => monthKey(r.created_at) === month);
    const usedThisMonth = thisMonth.filter(countsAsChange).length;
    const costThisMonth = thisMonth.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    const lastRequestAt = own.reduce<string | null>((m, r) => (!m || r.created_at > m ? r.created_at : m), null);
    const needsSince = projects.flatMap((p) => needsByProject.get(p.id) ?? []);
    const health = clientHealth({ quota: client.monthly_quota, usedThisMonth, needsSince, lastRequestAt, now: attention.now });
    return { client, projects, usedThisMonth, costThisMonth, lastRequestAt, health, needCount: needsSince.length };
  });
}

async function requestsSince(projectIds: string[] | null, since: string): Promise<LightRequest[]> {
  if (mode() === "ejemplo") {
    return buildSample()
      .requests.filter((r) => r.created_at >= since && (!projectIds || projectIds.includes(r.project_id)))
      .map(toLight);
  }
  let q = supabaseAdmin().from("requests").select(LIGHT_REQUEST).gte("created_at", since);
  if (projectIds) q = q.in("project_id", projectIds);
  return q.order("created_at", { ascending: false }).limit(5000).then(must<LightRequest[]>);
}

export type ClientsOverview = { rows: ClientSummary[]; unlinked: Project[]; clientsReady: boolean; now: number };

export async function getClientsOverview(): Promise<ClientsOverview> {
  const now = Date.now();
  const [base, attention, requests] = await Promise.all([getBase(), getAttention(), requestsSince(null, new Date(now - 62 * DAY).toISOString())]);
  const rows = await summarize(base, requests, attention);
  const linked = new Set(base.clients.map((c) => c.id));
  const unlinked = base.projects.filter((p) => !p.client_id || !linked.has(p.client_id));
  // Lo urgente primero; después, por nombre.
  const rank = { rojo: 0, ambar: 1, verde: 2 } as const;
  rows.sort((a, b) => rank[a.health.level] - rank[b.health.level] || a.client.name.localeCompare(b.client.name, "es"));
  return { rows, unlinked, clientsReady: base.clientsReady, now };
}

export type ClientDetail = ClientSummary & {
  now: number;
  requests: LightRequest[];
  quotes: (Quote & { short_id: string | null })[];
  messages: (Message & { contact_name: string | null; project_name: string | null })[];
  usage: MonthUsage[];
  attention: AttentionCard[];
};

export async function getClientDetail(id: string): Promise<ClientDetail | null> {
  const now = Date.now();
  const [base, attention] = await Promise.all([getBase(), getAttention()]);
  const client = base.clients.find((c) => c.id === id);
  if (!client) return null;
  const projectIds = base.projects.filter((p) => p.client_id === id).map((p) => p.id);
  const months = lastMonths(now, MONTHS);
  const since = new Date(Date.UTC(Number(months[0]!.slice(0, 4)), Number(months[0]!.slice(5)) - 1, 1) - DAY).toISOString();
  // Pedidos y contactos no dependen entre sí: van en paralelo.
  const [requests, realContacts] = await Promise.all([
    projectIds.length ? requestsSince(projectIds, since) : Promise.resolve([] as LightRequest[]),
    mode() === "supabase" && projectIds.length
      ? supabaseAdmin().from("contacts").select("id, project_id, display_name, role, created_at").in("project_id", projectIds).then(must<Contact[]>)
      : Promise.resolve([] as Contact[]),
  ]);
  const [summary] = await summarize({ ...base, clients: [client] }, requests, attention);

  let contacts: Contact[] = realContacts;
  let messages: Message[] = [];
  let quotes: Quote[] = [];
  if (mode() === "ejemplo") {
    const s = buildSample();
    contacts = s.contacts.filter((c) => projectIds.includes(c.project_id));
    const contactIds = new Set(contacts.map((c) => c.id));
    const reqIds = new Set(requests.map((r) => r.id));
    messages = s.messages.filter((m) => (m.contact_id && contactIds.has(m.contact_id)) || (m.request_id && reqIds.has(m.request_id)));
    quotes = s.quotes.filter((q) => q.request_id && reqIds.has(q.request_id));
  } else if (projectIds.length) {
    const db = supabaseAdmin();
    const reqIds = requests.map((r) => r.id);
    [messages, quotes] = await Promise.all([
      contacts.length
        ? db
            .from("messages")
            .select("*")
            .in("contact_id", contacts.map((c) => c.id))
            .order("at", { ascending: false })
            .limit(80)
            .then(must<Message[]>)
        : Promise.resolve([]),
      reqIds.length ? db.from("quotes").select("*").in("request_id", reqIds.slice(0, 300)).order("created_at", { ascending: false }).then(must<Quote[]>) : Promise.resolve([]),
    ]);
  }
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const projectById = new Map(base.projects.map((p) => [p.id, p]));
  const shortById = new Map(requests.map((r) => [r.id, r.short_id]));
  const recent = [...messages].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80).reverse();
  return {
    ...summary!,
    now,
    requests,
    quotes: quotes.map((q) => ({ ...q, short_id: q.request_id ? (shortById.get(q.request_id) ?? null) : null })),
    messages: recent.map((m) => {
      const c = m.contact_id ? contactById.get(m.contact_id) : undefined;
      return { ...m, contact_name: c?.display_name ?? null, project_name: c ? (projectById.get(c.project_id)?.name ?? null) : null };
    }),
    usage: usageByMonth(requests, months),
    attention: Object.values(attention.board)
      .flat()
      .filter((c) => c.project.client_id === id),
  };
}
