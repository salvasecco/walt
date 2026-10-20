import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRole, type Role } from "./roles";
import { supabaseAdmin } from "./supabase/server";
import type { Factory } from "./types";

export type TeamMember = { userId: string; email: string | null; role: Role; lastSignInAt: string | null; invited: boolean };

/**
 * Miembros de una agencia con su mail. Las memberships se leen con el cliente de quien mira (`db`, su sesión
 * con RLS); los mails salen de la API de administración de Supabase Auth, que solo anda con service role, y
 * solo para esos ids.
 */
export async function getTeam(db: SupabaseClient, factoryId: string): Promise<TeamMember[]> {
  const { data, error } = await db.from("memberships").select("user_id, role").eq("factory_id", factoryId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((m): m is { user_id: string; role: Role } => isRole(m.role));
  const admin = supabaseAdmin();
  const users = await Promise.all(rows.map((m) => admin.auth.admin.getUserById(m.user_id).then((r) => r.data.user ?? null)));
  const order: Record<Role, number> = { owner: 0, admin: 1, member: 2 };
  return rows
    .map((m, i) => ({
      userId: m.user_id,
      email: users[i]?.email ?? null,
      role: m.role,
      lastSignInAt: users[i]?.last_sign_in_at ?? null,
      invited: !!users[i] && !users[i]!.email_confirmed_at,
    }))
    .sort((a, b) => order[a.role] - order[b.role] || (a.email ?? "").localeCompare(b.email ?? ""));
}

/** Busca un usuario de Supabase Auth por mail (API de administración: service role; pagina de a 200, alcanza para la beta). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const db = supabaseAdmin();
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === needle);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Agencias sin ningún miembro, para el acceso de emergencia (crear su dueño). Solo lo usa el dueño de la
 * instancia, sin usuarios todavía: va con service role y ve todas las agencias.
 */
export async function factoriesWithoutMembers(): Promise<Factory[]> {
  const db = supabaseAdmin();
  const [{ data: factories, error }, { data: members, error: e2 }] = await Promise.all([
    db.from("factories").select("*").order("created_at"),
    db.from("memberships").select("factory_id"),
  ]);
  if (error) throw new Error(error.message);
  if (e2) throw new Error(e2.message);
  const taken = new Set((members ?? []).map((m) => m.factory_id as string));
  return (factories as Factory[]).filter((f) => !taken.has(f.id));
}
