"use client";
import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cómo se conecta el navegador: con la sesión del usuario (0004, RLS por agencia) o con la clave anon (antes). */
export type RealtimeConfig = { url: string; anonKey: string; auth: "user" | "anon" };

let anon: SupabaseClient | null = null;
let user: SupabaseClient | null = null;

/** Cliente del navegador para realtime. Con usuarios lleva su sesión (cookies de @supabase/ssr), nunca la service role. */
export function supabaseBrowser(cfg: RealtimeConfig): SupabaseClient {
  if (cfg.auth === "user") return (user ??= createBrowserClient(cfg.url, cfg.anonKey));
  return (anon ??= createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } }));
}

/** Antes de suscribirse: que el realtime vaya con el token del usuario y no con el anon (si no, RLS no deja ver nada). */
export async function authRealtime(db: SupabaseClient, cfg: RealtimeConfig): Promise<void> {
  if (cfg.auth !== "user") return;
  const { data } = await db.auth.getSession();
  if (data.session) await db.realtime.setAuth(data.session.access_token);
}
