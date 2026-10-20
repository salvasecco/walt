/**
 * The network only allows HTTPS, so migrations are applied by hand in the Supabase SQL Editor.
 * This script checks, over the REST API with the service role, what is applied and says what to paste.
 * Usage: pnpm db:migrate [--copy <prefix>]   (--copy 0004 puts that migration in the clipboard with pbcopy)
 * 0005 (closing anon) goes after the panel uses Supabase Auth for realtime: it is listed, not forced.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '@walt/core';
import { connect, runMain, schemaStatus } from './lib/db.js';

const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));

runMain('db:migrate', async () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const i = process.argv.indexOf('--copy');
  if (i > 0) {
    const prefix = process.argv[i + 1] ?? '';
    const name = files.find((f) => f.startsWith(prefix));
    if (!name) {
      console.log(`No hay ninguna migración que empiece con "${prefix}". Hay: ${files.join(', ')}`);
      process.exitCode = 1;
      return;
    }
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

  console.log(`${s.clients ? '✅' : '⏳'} 0003_clients.sql`);
  console.log(`${s.r1.ok ? '✅' : '⏳'} 0004_r1.sql${s.r1.ok ? '' : `  faltan: ${s.r1.missing.join(', ')}`}`);
  const closed = s.anonClosed === true;
  console.log(
    `${closed ? '✅' : '⏳'} 0005_r1_cierre_anon.sql${s.anonClosed === null ? '  (sin clave anon para comprobarla)' : ''}` +
      (closed ? '' : '  (la última: después de publicar el panel con Supabase Auth y crear el dueño de la agencia en Equipo)'),
  );

  console.log(`${s.previews ? '✅' : '⏳'} 0006_r1_vistas_previas.sql${s.previews ? '' : '  (la anon deja de leer borradores; el sitio ya está listo)'}`);

  const pending = [
    ...(init ? [] : ['0001']),
    ...(revoke ? [] : ['0002']),
    ...(s.clients ? [] : ['0003']),
    ...(s.r1.ok ? [] : ['0004']),
    // 0006 before 0005: 0005 closes anon and goes last, once the panel uses Supabase Auth.
    ...(s.previews ? [] : ['0006']),
    ...(closed || s.anonClosed === null ? [] : ['0005']),
  ];
  if (pending.length === 0) {
    console.log('La base está al día.');
    return;
  }
  console.log('\nAplicalas en orden en Supabase → SQL Editor:');
  for (const p of pending) {
    const note = p === '0004' ? '   (después reiniciá el worker: pasa solo a la cola durable)' : p === '0005' ? '   (recién con el panel de Supabase Auth en uso)' : '';
    console.log(`  pnpm db:migrate --copy ${p}   → pegar y Run${note}`);
  }
  process.exitCode = 2;
});
