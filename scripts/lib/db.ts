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
  /** 0004 applied (R1): jobs, request_labels, memberships, ai_settings, rules.policy_text and publish_version_v2. Lists what is missing. */
  r1: { ok: boolean; missing: string[] };
  /** 0005 applied: anon can no longer read requests. Null when there is no anon key to try. */
  anonClosed: boolean | null;
  /** 0006 applied: get_preview_version exists and new projects default to walt.config.json. */
  previews: boolean;
  /** 0007 applied: factories.plan_intent and landing_events (the public landing). */
  landing: boolean;
}

/** Tables, columns and functions that 0004 adds; each one is probed over REST. */
const R1_TABLES = ['jobs', 'request_labels', 'memberships', 'ai_settings', 'wallets', 'usage_ledger', 'github_installations'] as const;

/**
 * What 0004 adds that is missing, probed over REST without side effects.
 * Every probe is a GET with `limit(0)`, never `head: true`: supabase-js turns the 404 of a HEAD to a
 * missing table into a 204 without error, so a HEAD probe says every table exists.
 */
export async function missingR1(db: SupabaseClient): Promise<string[]> {
  const missing: string[] = [];
  for (const t of R1_TABLES) {
    const { error } = await db.from(t).select('*').limit(0);
    if (error) missing.push(t);
  }
  const cols: [string, string][] = [
    ['rules', 'policy_text, config'],
    ['content_versions', 'version, publish_key'],
    ['processed_updates', 'key, source'],
  ];
  for (const [t, c] of cols) {
    const { error } = await db.from(t).select(c).limit(0);
    if (error) missing.push(`${t}.(${c})`);
  }
  // A nil version: v2 answers with its own "no existe", PostgREST with PGRST202 if the function is missing.
  const v2 = await db.rpc('publish_version_v2', { p_project: NIL, p_version: NIL });
  if (v2.error && (v2.error.code === 'PGRST202' || !/no existe/.test(v2.error.message))) missing.push('publish_version_v2');
  const sim = await db.rpc('similar_labeled_requests', { p_factory: NIL, p_text: '', p_k: 1 });
  if (sim.error) missing.push('similar_labeled_requests');
  return missing;
}

const NIL = '00000000-0000-4000-8000-000000000000';

/** Inspects the schema through the REST API (tables, publish_version and the 0002 revoke). */
export async function schemaStatus(db: SupabaseClient, env: WaltEnv): Promise<SchemaStatus> {
  const missingTables: string[] = [];
  for (const t of MAIN_TABLES) {
    const { error } = await db.from(t).select('*').limit(0);
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
  const c1 = await db.from('clients').select('id').limit(0);
  const c2 = await db.from('projects').select('client_id, is_sample').limit(0);
  const c3 = await db.from('requests').select('is_sample').limit(0);
  const clients = !c1.error && !c2.error && !c3.error;
  const r1Missing = await missingR1(db);
  let anonClosed: boolean | null = null;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const res = await anon.from('requests').select('id').limit(0);
    anonClosed = !!res.error && /permission denied/i.test(res.error.message);
  }
  // 0006: the preview RPC answers (an empty list for a nil id) instead of PGRST202.
  const preview = await db.rpc('get_preview_version', { p_id: NIL });
  const previews = !preview.error;
  const l1 = await db.from('factories').select('plan_intent, plan_cycle, plan_intent_at').limit(0);
  const l2 = await db.from('landing_events').select('id').limit(0);
  const landing = !l1.error && !l2.error;
  return { missingTables, publishVersion, anonBlocked, clients, r1: { ok: r1Missing.length === 0, missing: r1Missing }, anonClosed, previews, landing };
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
