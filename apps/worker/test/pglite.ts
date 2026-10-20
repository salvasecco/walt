import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import type { Db } from '../src/store/pg.js';

export const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));

/**
 * Supabase Vault stand-in for tests: same functions and view, secrets in plain text. Never in a
 * migration: a real Postgres without Vault must fail instead of storing keys unencrypted.
 */
export const VAULT_SHIM = `
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(), name text unique, description text not null default '',
  secret text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, coalesce(new_description, '')) returning id $$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
    description = coalesce(new_description, description), updated_at = now() where id = secret_id $$;
create or replace view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;
`;

export function migrationFiles(upTo?: string): string[] {
  return readdirSync(MIGRATIONS)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .filter((n) => !upTo || n.slice(0, 4) <= upTo);
}

async function migrated(upTo?: string): Promise<PGlite> {
  const pg = new PGlite({ extensions: { pg_trgm } });
  await pg.exec(VAULT_SHIM);
  for (const f of migrationFiles(upTo)) await pg.exec(readFileSync(MIGRATIONS + f, 'utf8'));
  return pg;
}

const templates = new Map<string, Promise<PGlite>>();

/**
 * PGlite with pg_trgm, the Vault stand-in and the real migrations applied (all, or up to `upTo`, e.g.
 * '0003'). The migrated database is built once per `upTo` and cloned for each caller.
 */
export async function freshPglite(opts: { upTo?: string } = {}): Promise<PGlite> {
  const key = opts.upTo ?? 'all';
  let t = templates.get(key);
  if (!t) {
    t = migrated(opts.upTo);
    templates.set(key, t);
  }
  return (await (await t).clone()) as PGlite;
}

/** The store's Db over PGlite. */
export function pgliteDb(pg: PGlite): Db {
  type Q = { query: PGlite['query'] };
  const wrap = (q: Q) => ({ query: async <T>(text: string, params: unknown[] = []) => (await q.query<T>(text, params)).rows });
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn({ ...wrap(tx as unknown as Q), transaction: () => Promise.reject(new Error('anidada')), close: async () => {} })),
    close: () => pg.close(),
  };
}
