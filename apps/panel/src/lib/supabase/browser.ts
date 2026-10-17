"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Cliente anon del navegador, solo para realtime y lecturas permitidas por RLS. */
export function supabaseBrowser(url: string, anonKey: string): SupabaseClient {
  client ??= createClient(url, anonKey, { auth: { persistSession: false } });
  return client;
}
