/**
 * Applies supabase/migrations/*.sql in order with SUPABASE_DB_URL and records them in `_migrations`.
 * Each file runs in its own transaction. Never prints the connection string.
 * Usage: pnpm db:migrate [--status]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadEnv, redact } from '@dale/core';

const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));

async function main() {
  const env = loadEnv();
  if (!env.SUPABASE_DB_URL) {
    console.log('Falta SUPABASE_DB_URL en ~/.dale/.env: no se aplicó nada.');
    process.exit(1);
  }
  const sql = postgres(env.SUPABASE_DB_URL, { max: 1, onnotice: () => {}, prepare: false });
  try {
    await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    if (process.argv.includes('--status')) {
      for (const f of files) console.log(`${applied.has(f) ? '✅' : '⏳'} ${f}`);
      return;
    }
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = readFileSync(join(dir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into _migrations (name) values (${file})`;
      });
      console.log(`✅ aplicada ${file}`);
      count++;
    }
    if (count === 0) console.log('Nada para aplicar: la base está al día.');
    const [check] = await sql<{ n: number }[]>`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('factories','projects','requests','content_versions','commands')`;
    console.log(`Verificación: ${check?.n ?? 0}/5 tablas principales presentes.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  const env = (() => {
    try {
      return loadEnv();
    } catch {
      return null;
    }
  })();
  const msg = err instanceof Error ? err.message : String(err);
  console.error('Falló la migración:', env ? redact(msg, env.secrets) : msg);
  process.exit(1);
});
