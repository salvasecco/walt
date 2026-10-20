import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assistantName } from "@walt/core/copy";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authMode, SESSION_COOKIE, verifySessionValue } from "./auth";
import { dataMode, env } from "./env";
import { isSupabaseAuthCookie } from "./redirect";
import { can, isRole, PERMISSION_TEXT, ROLE_LABEL, type Permission, type Role } from "./roles";
import { buildSample } from "./sample";
import { supabaseAdmin } from "./supabase/server";
import { supabaseUser } from "./supabase/ssr";
import type { Factory, Project, WaltRequest } from "./types";

/**
 * Multi-agencia (R1). Cuatro situaciones:
 * - `ejemplo` / `sin_configurar`: sin Supabase, como antes (datos de ejemplo en desarrollo).
 * - `legacy`: Supabase sin la migración 0004 (no hay `memberships`). Una sola agencia con PANEL_PASSWORD, como hoy.
 * - `multi`: con 0004. Supabase Auth; cada usuario ve solo su agencia. PANEL_PASSWORD queda como acceso de
 *   emergencia del dueño de la instancia, y solo mientras no haya ningún usuario con agencia.
 */
export type Tenancy = "ejemplo" | "sin_configurar" | "legacy" | "multi";

export const FACTORY_COOKIE = "walt_factory";

/** Tabla o vista inexistente: Postgres 42P01, PostgREST PGRST205 (no está en el schema cache). */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? "");
}

/** Columna inexistente (p. ej. `rules.policy_text` antes de 0004): 42703 o PGRST204. */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(error.message ?? "");
}

/** Función RPC inexistente: PGRST202 o 42883. */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

type Probe = { at: number; tenancy: "legacy" | "multi"; members: number };
let probe: Probe | null = null;

/**
 * ¿Está la 0004? Se mira una vez cada 30 s por instancia (5 s mientras no haya usuarios). Es una consulta de
 * esquema, no de datos de una agencia: va con service role, con `limit(0)` (solo el conteo, ninguna fila) y GET
 * (con HEAD, supabase-js convierte el 404 de una tabla que no existe en un 204 sin error).
 */
async function probeTenancy(): Promise<Probe> {
  if (probe && Date.now() - probe.at < (probe.members > 0 ? 30_000 : 5_000)) return probe;
  const { count, error } = await supabaseAdmin().from("memberships").select("user_id", { count: "exact" }).limit(0);
  if (error && !isMissingRelation(error)) throw new Error(error.message);
  probe = error ? { at: Date.now(), tenancy: "legacy", members: 0 } : { at: Date.now(), tenancy: "multi", members: count ?? 0 };
  return probe;
}

/** Después de crear o borrar memberships desde el panel. */
export function forgetTenancyProbe() {
  probe = null;
}

export const getTenancy = cache(async (): Promise<{ tenancy: Tenancy; members: number }> => {
  const m = dataMode();
  if (m !== "supabase") return { tenancy: m, members: 0 };
  const p = await probeTenancy();
  return { tenancy: p.tenancy, members: p.members };
});

export type MembershipWithFactory = { user_id: string; factory_id: string; role: Role; factory: Factory };

export type Viewer = {
  /** user: Supabase Auth. password: PANEL_PASSWORD. open: desarrollo sin contraseña. */
  kind: "user" | "password" | "open";
  tenancy: Tenancy;
  userId: string | null;
  email: string | null;
  role: Role;
  /** Agencia activa. null con el acceso de la instancia (contraseña o desarrollo): ve todas. */
  factory: Factory | null;
  memberships: MembershipWithFactory[];
  /** Usuario de Supabase sin agencia: tiene que crearla (/registro/agencia). */
  needsAgency: boolean;
  /** Contraseña del panel con la base multi-agencia y ningún usuario todavía. */
  emergency: boolean;
};

export type AuthUser = { id: string; email: string | null; meta: Record<string, unknown> };

/** El cliente de Supabase con la sesión del usuario de este pedido (uno por pedido, como pide @supabase/ssr). */
const userClient = cache(() => supabaseUser());

/** Usuario de Supabase Auth de este pedido, o null. Sin cookie de sesión no consulta nada. */
export const currentUser = cache(async (): Promise<AuthUser | null> => {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const jar = await cookies();
  if (!jar.getAll().some((c) => isSupabaseAuthCookie(c.name))) return null;
  const { data, error } = await (await userClient()).auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    meta: (claims.user_metadata as Record<string, unknown> | undefined) ?? {},
  };
});

/**
 * Agencias del usuario. Se leen con su propia sesión (RLS de la 0004: ve sus memberships y sus agencias);
 * `db` permite pasar el cliente que acaba de iniciar la sesión (por ejemplo, en /auth/confirm).
 */
export async function membershipsOf(userId: string, db?: SupabaseClient): Promise<MembershipWithFactory[]> {
  db ??= await userClient();
  const { data, error } = await db.from("memberships").select("user_id, factory_id, role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((m): m is { user_id: string; factory_id: string; role: Role } => isRole(m.role));
  if (!rows.length) return [];
  const { data: factories, error: e2 } = await db.from("factories").select("*").in("id", rows.map((m) => m.factory_id));
  if (e2) throw new Error(e2.message);
  const byId = new Map((factories as Factory[]).map((f) => [f.id, f]));
  return rows
    .filter((m) => byId.has(m.factory_id))
    .map((m) => ({ ...m, factory: byId.get(m.factory_id)! }))
    .sort((a, b) => a.factory.name.localeCompare(b.factory.name, "es"));
}

function instanceViewer(kind: "password" | "open", tenancy: Tenancy, emergency: boolean): Viewer {
  return { kind, tenancy, userId: null, email: null, role: "owner", factory: null, memberships: [], needsAgency: false, emergency };
}

/** Quién está mirando el panel, una vez por render. null: no entró (o su acceso ya no vale). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const { tenancy, members } = await getTenancy();
  const jar = await cookies();
  const mode = authMode();
  const password = mode === "password" && verifySessionValue(jar.get(SESSION_COOKIE)?.value);
  const open = mode === "abierto";
  if (tenancy !== "multi") {
    if (password) return instanceViewer("password", tenancy, false);
    if (open) return instanceViewer("open", tenancy, false);
    return null;
  }
  const user = await currentUser();
  if (user) {
    const memberships = await membershipsOf(user.id);
    const wanted = jar.get(FACTORY_COOKIE)?.value;
    const active = memberships.find((m) => m.factory_id === wanted) ?? memberships[0] ?? null;
    return {
      kind: "user",
      tenancy,
      userId: user.id,
      email: user.email,
      role: active?.role ?? "member",
      factory: active?.factory ?? null,
      memberships,
      needsAgency: !active,
      emergency: false,
    };
  }
  // Acceso de emergencia: solo mientras ningún usuario tenga agencia.
  if (members === 0 && (password || open)) return instanceViewer(password ? "password" : "open", tenancy, true);
  return null;
});

/**
 * Con qué cliente se lee (y se escribe lo que la RLS deja) para quien mira:
 * - un usuario de Supabase Auth (con la 0004): su sesión, `authenticated` con la RLS por agencia;
 * - el acceso de la instancia (antes de la 0004, o el de emergencia): la service role, que ve todo. No hay
 *   usuarios ni agencias por usuario: es el dueño de la instancia (docs/DECISIONES.md, R1 panel).
 * Igual, cada consulta filtra explícitamente por los proyectos de la agencia activa (`inScope`).
 */
export async function dbFor(viewer: Viewer | null): Promise<SupabaseClient> {
  if (viewer?.kind === "user" && viewer.tenancy === "multi") return userClient();
  return supabaseAdmin();
}

export type Scope = {
  viewer: Viewer;
  /** El cliente de quien mira (`dbFor`). */
  db: SupabaseClient;
  /** Agencia activa; null = todas (acceso de la instancia). */
  factoryId: string | null;
  all: boolean;
  projects: Project[];
  projectIds: string[];
};

/** Proyectos que ve `viewer`: los de su agencia, o todos con el acceso de la instancia. Una lectura por render. */
const loadScope = cache(async (viewer: Viewer): Promise<Scope> => {
  const factoryId = viewer.factory?.id ?? null;
  const all = viewer.kind !== "user";
  const configured = dataMode() === "supabase";
  const db = configured ? await dbFor(viewer) : (null as unknown as SupabaseClient);
  let projects: Project[];
  if (dataMode() === "ejemplo") projects = buildSample().projects;
  else if (!configured || (!all && !factoryId)) projects = [];
  else {
    let q = db.from("projects").select("*").order("created_at");
    if (!all) q = q.eq("factory_id", factoryId!);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    projects = data as Project[];
  }
  return { viewer, db, factoryId, all, projects, projectIds: projects.map((p) => p.id) };
});

/**
 * Lo que puede ver quien mira. Desde un Server Component sin acceso redirige a /entrar (o a crear la agencia),
 * así ninguna lectura sale sin filtro aunque el layout y la página rendericen en paralelo.
 */
export const getScope = cache(async (): Promise<Scope> => {
  const viewer = await getViewer();
  if (!viewer) redirect("/entrar");
  if (viewer.needsAgency) redirect("/registro/agencia");
  return loadScope(viewer);
});

/**
 * Pedidos sin los de ejemplo (`is_sample`, migración 0003): las métricas salen solo de datos reales.
 * Si la columna no existe, ninguno es de ejemplo y se consulta sin ella.
 */
export async function realRows<T>(cols: string, run: (cols: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<T[]> {
  let res = await run(`${cols}, is_sample`);
  if (res.error && isMissingColumn(res.error)) res = await run(cols);
  if (res.error) throw new Error(res.error.message);
  return ((res.data ?? []) as (T & { is_sample?: boolean })[]).filter((r) => !r.is_sample);
}

/** Agrega el filtro por proyecto a una consulta, salvo con el acceso de la instancia. */
export function inScope<Q>(q: Q, scope: Scope, column = "project_id"): Q {
  if (scope.all) return q;
  return (q as unknown as { in(c: string, v: readonly string[]): Q }).in(column, scope.projectIds);
}

export class AccessError extends Error {}

/** Para cada acción de servidor: quién es y si puede. No alcanza con el proxy. */
export async function requireViewer(permission: Permission = "operar"): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new AccessError("Tu sesión venció: entrá de nuevo.");
  if (v.needsAgency) throw new AccessError("Primero creá tu agencia.");
  if (!can(v.role, permission)) throw new AccessError(`Con el rol ${ROLE_LABEL[v.role]} no podés ${PERMISSION_TEXT[permission]}.`);
  return v;
}

/** El proyecto tiene que ser de la agencia de quien actúa. */
export async function requireProject(projectId: string, permission: Permission = "operar"): Promise<{ viewer: Viewer; project: Project; db: SupabaseClient }> {
  const viewer = await requireViewer(permission);
  const scope = await loadScope(viewer);
  const project = scope.projects.find((p) => p.id === projectId);
  if (!project) throw new AccessError("Ese proyecto no es de tu agencia.");
  return { viewer, project, db: scope.db };
}

/** El pedido tiene que ser de un proyecto de la agencia de quien actúa. */
export async function requireRequest(
  requestId: string,
  permission: Permission = "operar",
): Promise<{ viewer: Viewer; project: Project; request: WaltRequest; db: SupabaseClient }> {
  const viewer = await requireViewer(permission);
  const scope = await loadScope(viewer);
  if (dataMode() === "ejemplo") {
    const r = buildSample().requests.find((x) => x.id === requestId);
    const project = r && scope.projects.find((p) => p.id === r.project_id);
    if (!r || !project) throw new AccessError("Ese pedido no es de tu agencia.");
    return { viewer, project, request: r, db: scope.db };
  }
  const { data, error } = await scope.db.from("requests").select("*").eq("id", requestId).maybeSingle();
  if (error) throw new Error(error.message);
  const project = data && scope.projects.find((p) => p.id === data.project_id);
  if (!data || !project) throw new AccessError("Ese pedido no es de tu agencia.");
  return { viewer, project, request: data as WaltRequest, db: scope.db };
}

/** Crea la agencia y deja al usuario como dueño, en una transacción (RPC `create_factory` de la 0004). */
export async function createAgency(userId: string, name: string): Promise<Factory> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (clean.length < 2) throw new Error("Poné el nombre de la agencia.");
  const db = supabaseAdmin();
  const { data: id, error } = await db.rpc("create_factory", { p_name: clean, p_assistant_name: assistantName(clean), p_owner: userId });
  if (error) throw new Error(isMissingFunction(error) ? "Falta aplicar la migración 0004." : error.message);
  forgetTenancyProbe();
  const { data: factory, error: e2 } = await db.from("factories").select("*").eq("id", id as string).single();
  if (e2) throw new Error(e2.message);
  return factory as Factory;
}

/**
 * El token de GitHub de la instancia (`GITHUB_TOKEN`) solo para el acceso de la instancia. Un usuario de una
 * agencia no lo usa: con él podría mirar repos privados ajenos a los que ese token llega (el registro es
 * abierto). Para sus repos, la GitHub App de su agencia (pendiente de conectar en el panel).
 */
export function githubTokenFor(viewer: Viewer | null): string {
  return viewer && viewer.kind !== "user" ? env.githubToken : "";
}

/** Nombre de la agencia para mostrar: la activa, o la de DEMO_AGENCY_NAME con el acceso de la instancia. */
export function agencyNameOf(viewer: Viewer | null): string {
  return viewer?.factory?.name ?? env.agencyName;
}
