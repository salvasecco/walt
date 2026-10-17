import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

let admin: SupabaseClient | null = null;

/** Cliente con service role: solo del lado del servidor (lecturas del panel y acciones). */
export function supabaseAdmin(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceKey) throw new Error("Supabase no está configurado");
  admin ??= createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
