"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPassword, createSessionValue, authMode, SESSION_COOKIE } from "@/lib/auth";
import { dataMode, env } from "@/lib/env";
import { safeRedirect } from "@/lib/redirect";
import { isRole, memberChangeError, type Role } from "@/lib/roles";
import {
  AccessError,
  createAgency,
  currentUser,
  FACTORY_COOKIE,
  forgetTenancyProbe,
  getTenancy,
  membershipsOf,
  requireViewer,
} from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseUser } from "@/lib/supabase/ssr";
import { findUserIdByEmail, getTeam } from "@/lib/team";

export type FormState = { error?: string; ok?: string } | undefined;
export type Result = { ok: true; message?: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mensajes de Supabase Auth en castellano, sin filtrar si un mail existe o no. */
function authErrorText(error: { code?: string; message?: string; status?: number }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Mail o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Confirmá tu mail: te mandamos un link al registrarte.";
    case "weak_password":
      return "La contraseña es muy débil: usá al menos 8 caracteres, con letras y números.";
    case "email_address_invalid":
      return "Revisá el mail.";
    case "signup_disabled":
      return "El registro está cerrado en este momento.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Hubo muchos intentos seguidos: probá de nuevo en unos minutos.";
    default:
      return error.status === 429 ? "Hubo muchos intentos seguidos: probá de nuevo en unos minutos." : "No se pudo completar. Probá de nuevo.";
  }
}

/** Origen del panel para los links de los mails: PANEL_URL o el host del pedido. */
async function origin(): Promise<string> {
  if (env.panelUrl) return env.panelUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function errorText(e: unknown) {
  if (e instanceof AccessError) return e.message;
  return e instanceof Error ? e.message : "Error inesperado";
}

// ── Entrar y salir ─────────────────────────────────────────────────────────

/** Contraseña del panel: modo de una sola agencia (sin 0004) o acceso de emergencia (0004 sin usuarios). */
export async function loginWithPassword(_prev: FormState, form: FormData): Promise<FormState> {
  if (authMode() === "sin_configurar") return { error: "Falta configurar PANEL_PASSWORD en este entorno." };
  const { tenancy, members } = await getTenancy();
  if (tenancy === "multi" && members > 0) return { error: "Ya hay usuarios: entrá con tu mail. La contraseña del panel solo sirve mientras no haya ninguno." };
  const password = String(form.get("password") ?? "");
  if (!checkPassword(password)) {
    await wait(400);
    return { error: "Contraseña incorrecta." };
  }
  const { value, maxAge } = createSessionValue();
  (await cookies()).set(SESSION_COOKIE, value, { httpOnly: true, secure: env.isProduction, sameSite: "lax", path: "/", maxAge });
  redirect(safeRedirect(String(form.get("desde") ?? "")));
}

export async function loginWithEmail(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email) || !password) return { error: "Completá mail y contraseña." };
  const { error } = await (await supabaseUser()).auth.signInWithPassword({ email, password });
  if (error) {
    await wait(400);
    return { error: authErrorText(error) };
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect(safeRedirect(String(form.get("desde") ?? "")));
}

export async function sendMagicLink(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Revisá el mail." };
  const next = safeRedirect(String(form.get("desde") ?? ""));
  const { error } = await (await supabaseUser()).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  // Para un mail sin cuenta Supabase devuelve error: no se dice, así no se puede averiguar quién tiene cuenta.
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) return { error: authErrorText(error) };
  return { ok: "Si ese mail tiene cuenta, te llega un link para entrar. Abrilo en este navegador." };
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(FACTORY_COOKIE);
  if (await currentUser()) await (await supabaseUser()).auth.signOut();
  redirect("/entrar");
}

// ── Registro de agencias ──────────────────────────────────────────────────

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const { tenancy } = await getTenancy();
  if (tenancy !== "multi") return { error: "Todavía no se pueden registrar agencias: falta aplicar la migración 0004." };
  const agency = String(form.get("agency") ?? "").trim();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (agency.length < 2) return { error: "Poné el nombre de tu agencia." };
  if (!EMAIL_RE.test(email)) return { error: "Revisá el mail." };
  if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  const { data, error } = await (await supabaseUser()).auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await origin()}/auth/confirm?next=/atencion`, data: { agency_name: agency, full_name: name } },
  });
  if (error) return { error: authErrorText(error) };
  // Mail ya registrado: Supabase devuelve un usuario sin identidades para no revelarlo.
  if (data.user && (data.user.identities?.length ?? 0) === 0) return { error: "Ese mail ya tiene cuenta: entrá o pedí un link." };
  if (data.session && data.user) {
    await createAgency(data.user.id, agency);
    redirect("/atencion");
  }
  return { ok: `Te mandamos un mail a ${email} para confirmar la cuenta. Al abrir el link queda creada ${agency}.` };
}

/** Usuario con sesión y sin agencia (por ejemplo, si el link de confirmación se abrió en otro navegador). */
export async function createMyAgency(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if ((await membershipsOf(user.id)).length) redirect("/atencion");
  try {
    await createAgency(user.id, String(form.get("agency") ?? ""));
  } catch (e) {
    return { error: errorText(e) };
  }
  redirect("/atencion");
}

export async function switchFactory(factoryId: string): Promise<Result> {
  try {
    const v = await requireViewer();
    if (!v.memberships.some((m) => m.factory_id === factoryId)) return { ok: false, error: "No sos parte de esa agencia." };
    (await cookies()).set(FACTORY_COOKIE, factoryId, { httpOnly: true, secure: env.isProduction, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

// ── Equipo ────────────────────────────────────────────────────────────────

/** Suma a alguien a la agencia activa. Si no tiene cuenta, Supabase le manda una invitación por mail. */
export async function addMember(input: { email: string; role: Role }): Promise<Result> {
  try {
    const v = await requireViewer("equipo");
    if (!v.factory) return { ok: false, error: "Elegí una agencia." };
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "Revisá el mail." };
    if (!isRole(input.role) || (input.role !== "member" && v.role !== "owner")) return { ok: false, error: "Solo el dueño puede sumar admins o dueños." };
    const db = supabaseAdmin();
    let userId = await findUserIdByEmail(email);
    let message = `${email} ya puede entrar a ${v.factory.name}.`;
    if (!userId) {
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${await origin()}/auth/confirm?next=/atencion`,
        data: { invited_to: v.factory.name },
      });
      if (error) return { ok: false, error: authErrorText(error) };
      userId = data.user.id;
      message = `Le mandamos una invitación a ${email}.`;
    }
    const { error } = await db.from("memberships").insert({ user_id: userId, factory_id: v.factory.id, role: input.role });
    if (error) return { ok: false, error: error.code === "23505" ? "Ya es parte del equipo." : error.message };
    forgetTenancyProbe();
    revalidatePath("/equipo");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function changeMemberRole(userId: string, role: Role | null): Promise<Result> {
  try {
    const v = await requireViewer("equipo");
    if (!v.factory) return { ok: false, error: "Elegí una agencia." };
    if (role !== null && !isRole(role)) return { ok: false, error: "Rol inválido." };
    const team = await getTeam(v.factory.id);
    const target = team.find((m) => m.userId === userId);
    if (!target) return { ok: false, error: "No es parte del equipo." };
    const why = memberChangeError(v.role, target.role, role, team.filter((m) => m.role === "owner").length, userId === v.userId);
    if (why) return { ok: false, error: why };
    const db = supabaseAdmin();
    const q =
      role === null
        ? db.from("memberships").delete().eq("factory_id", v.factory.id).eq("user_id", userId)
        : db.from("memberships").update({ role }).eq("factory_id", v.factory.id).eq("user_id", userId);
    const { error } = await q;
    if (error) return { ok: false, error: error.message };
    forgetTenancyProbe();
    revalidatePath("/equipo");
    return { ok: true, message: role === null ? "Listo, ya no es parte del equipo." : "Rol actualizado." };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function changeMyPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) return { error: "Entrá con tu mail para cambiar la contraseña." };
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  const { error } = await (await supabaseUser()).auth.updateUser({ password });
  if (error) return { error: authErrorText(error) };
  return { ok: "Contraseña actualizada." };
}

/**
 * Acceso de emergencia (0004 aplicada y ningún usuario): crea el usuario dueño de una agencia que ya existe,
 * por ejemplo la del seed. Desde que hay un dueño, la contraseña del panel deja de servir.
 */
export async function bootstrapOwner(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const v = await requireViewer("roles");
    if (!v.emergency) return { error: "Solo con el acceso de emergencia del dueño de la instancia." };
    if (dataMode() !== "supabase") return { error: "Necesita Supabase." };
    const factoryId = String(form.get("factory") ?? "");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!EMAIL_RE.test(email)) return { error: "Revisá el mail." };
    if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
    const db = supabaseAdmin();
    const { data: factory } = await db.from("factories").select("id, name").eq("id", factoryId).maybeSingle();
    if (!factory) return { error: "Elegí la agencia." };
    let userId = await findUserIdByEmail(email);
    if (!userId) {
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return { error: authErrorText(error) };
      userId = data.user.id;
    }
    const { error } = await db.from("memberships").insert({ user_id: userId, factory_id: factory.id, role: "owner" });
    if (error && error.code !== "23505") return { error: error.message };
    forgetTenancyProbe();
  } catch (e) {
    return { error: errorText(e) };
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/entrar?listo=dueño");
}
