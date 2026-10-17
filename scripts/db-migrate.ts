/**
 * The network only allows HTTPS, so migrations are applied by hand in the Supabase SQL Editor.
 * This script checks, over the REST API with the service role, what is applied and says what to paste.
 * Usage: pnpm db:migrate [--copy <file>]   (--copy puts a migration in the clipboard with pbcopy)
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '@dale/core';
import { connect, runMain, schemaStatus } from './lib/db.js';

const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));

runMain('db:migrate', async () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const i = process.argv.indexOf('--copy');
  if (i > 0) {
    const name = files.find((f) => f.startsWith(process.argv[i + 1] ?? '')) ?? files[0]!;
    execFileSync('pbcopy', { input: readFileSync(join(dir, name)) });
    console.log(`📋 ${name} copiada: pegala en Supabase → SQL Editor → Run.`);
    return;
  }

  const env = loadEnv();
  const s = await schemaStatus(connect(env), env);
  const init = s.missingTables.length === 0 && s.publishVersion;
  console.log(`${init ? '✅' : '⏳'} 0001_init.sql${init ? '' : `  faltan: ${[...s.missingTables, ...(s.publishVersion ? [] : ['publish_version'])].join(', ')}`}`);
  const revoke = s.anonBlocked === true;
  console.log(`${revoke ? '✅' : '⏳'} 0002_revoke_publish_version.sql${s.anonBlocked === null ? '  (sin clave anon para comprobarla)' : ''}`);

  const pending = [...(init ? [] : ['0001']), ...(revoke ? [] : ['0002'])];
  if (pending.length === 0) {
    console.log('La base está al día.');
    return;
  }
  console.log('\nAplicalas en orden en Supabase → SQL Editor:');
  for (const p of pending) console.log(`  pnpm db:migrate --copy ${p}   → pegar y Run`);
  process.exitCode = 2;
});
