import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv, redact, type WaltEnv } from '@walt/core';

/**
 * Supabase client with the service role, over HTTPS. The scripts never use SUPABASE_DB_URL:
 * the network only allows port 443 outbound.
 */
export function connect(env: WaltEnv = loadEnv()): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en ~/.walt/.env: no se hizo nada.');
    process.exit(1);
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Throws with the PostgREST message when a supabase-js call fails, and returns its data otherwise. */
export function must<D>(res: { data: D; error: { message: string } | null }, what: string): D {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export const MAIN_TABLES = [
  'factories', 'projects', 'contacts', 'invites', 'rules', 'requests', 'events',
  'messages', 'content_versions', 'approvals', 'quotes', 'commands', 'processed_updates',
] as const;

export interface SchemaStatus {
  missingTables: string[];
  /** publish_version exists and is callable by the service role. */
  publishVersion: boolean;
  /** 0002 applied: anon can no longer call publish_version. Null when there is no anon key to try. */
  anonBlocked: boolean | null;
  /** 0003 applied: `clients` exists and projects/requests have the new columns. */
  clients: boolean;
}

const NIL = '00000000-0000-4000-8000-000000000000';

/** Inspects the schema through the REST API (tables, publish_version and the 0002 revoke). */
export async function schemaStatus(db: SupabaseClient, env: WaltEnv): Promise<SchemaStatus> {
  const missingTables: string[] = [];
  for (const t of MAIN_TABLES) {
    const { error } = await db.from(t).select('*', { count: 'exact', head: true });
    if (error) missingTables.push(t);
  }
  // With nil ids the function exists if it raises its own "no existe" error, not PostgREST's PGRST202.
  const svc = await db.rpc('publish_version', { p_project: NIL, p_version: NIL });
  const publishVersion = !svc.error || (svc.error.code !== 'PGRST202' && /no existe/.test(svc.error.message));
  let anonBlocked: boolean | null = null;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY && publishVersion) {
    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const res = await anon.rpc('publish_version', { p_project: NIL, p_version: NIL });
    // Only the revoke gives "permission denied for function"; without it anon reaches the body and fails there.
    anonBlocked = !!res.error && /permission denied for function/i.test(res.error.message);
  }
  const c1 = await db.from('clients').select('id', { head: true, count: 'exact' });
  const c2 = await db.from('projects').select('client_id, is_sample', { head: true, count: 'exact' });
  const c3 = await db.from('requests').select('is_sample', { head: true, count: 'exact' });
  const clients = !c1.error && !c2.error && !c3.error;
  return { missingTables, publishVersion, anonBlocked, clients };
}

/** Runs a script's main and prints errors without secrets. */
export function runMain(label: string, main: () => Promise<void>): void {
  main().catch((err) => {
    let secrets: string[] = [];
    try {
      secrets = loadEnv().secrets;
    } catch {
      // ignore
    }
    console.error(`${label} falló:`, redact(err instanceof Error ? err.message : String(err), secrets));
    process.exit(1);
  });
}
