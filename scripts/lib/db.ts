import postgres from 'postgres';
import { loadEnv, redact, type DaleEnv } from '@dale/core';

/** Opens a Postgres connection with SUPABASE_DB_URL, or exits with a clear message. */
export function connect(env: DaleEnv = loadEnv()): postgres.Sql {
  if (!env.SUPABASE_DB_URL) {
    console.log('Falta SUPABASE_DB_URL en ~/.dale/.env: no se hizo nada.');
    process.exit(1);
  }
  return postgres(env.SUPABASE_DB_URL, { max: 1, prepare: false, onnotice: () => {} });
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
