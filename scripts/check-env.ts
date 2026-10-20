/**
 * Checks every credential without showing it (SPEC §4) and prints a table with ✅ / ❌.
 * Usage: pnpm check [--md]
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { loadEnv, redact, type WaltEnv } from '@walt/core';
import { connect, schemaStatus } from './lib/db.js';

const run = promisify(execFile);

interface Row {
  name: string;
  ok: boolean;
  detail: string;
}

const TIMEOUT = 10_000;

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  return { status: res.status, body };
}

async function checkTelegram(env: WaltEnv): Promise<Row> {
  const name = 'Telegram (getMe)';
  if (!env.TELEGRAM_BOT_TOKEN) return { name, ok: false, detail: 'falta TELEGRAM_BOT_TOKEN' };
  const { body } = await getJson(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`, {});
  if (!body?.ok) return { name, ok: false, detail: 'el token no es válido' };
  const same = !env.TELEGRAM_BOT_USERNAME || body.result.username === env.TELEGRAM_BOT_USERNAME;
  return { name, ok: same, detail: same ? `@${body.result.username}, modo ${env.TELEGRAM_MODE}` : 'TELEGRAM_BOT_USERNAME no coincide con el bot' };
}

async function checkSupabaseApi(env: WaltEnv): Promise<Row> {
  const name = 'Supabase (select con service role)';
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { name, ok: false, detail: 'falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' };
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const { status } = await getJson(`${env.SUPABASE_URL}/rest/v1/projects?select=id&limit=1`, {
    apikey: key,
    Authorization: `Bearer ${key}`,
  });
  if (status === 200) return { name, ok: true, detail: 'responde' };
  if (status === 404) return { name, ok: false, detail: 'responde, pero falta la tabla projects: aplicá 0001 en el SQL Editor' };
  return { name, ok: false, detail: `HTTP ${status}` };
}

async function checkSupabaseAnon(env: WaltEnv): Promise<Row> {
  const name = 'Supabase (clave anon)';
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { name, ok: false, detail: 'falta SUPABASE_ANON_KEY' };
  const { status } = await getJson(`${env.SUPABASE_URL}/rest/v1/projects?select=id&limit=1`, {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
  });
  return { name, ok: status === 200, detail: status === 200 ? 'lee projects' : `HTTP ${status}` };
}

async function checkSchema(env: WaltEnv): Promise<Row> {
  const name = 'Migraciones (vía REST)';
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { name, ok: false, detail: 'falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' };
  const s = await schemaStatus(connect(env), env);
  if (s.missingTables.length || !s.publishVersion) return { name, ok: false, detail: '0001 sin aplicar: corré pnpm db:migrate para ver qué pegar' };
  if (s.anonBlocked === false) return { name, ok: false, detail: '0001 aplicada, falta 0002 (pnpm db:migrate --copy 0002)' };
  if (!s.clients) return { name, ok: false, detail: 'falta 0003 (pnpm db:migrate --copy 0003)' };
  if (!s.r1.ok) return { name, ok: false, detail: `falta 0004, la del R1 (pnpm db:migrate --copy 0004): ${s.r1.missing.slice(0, 3).join(', ')}` };
  return { name, ok: true, detail: `0001 a 0004 aplicadas${s.anonClosed ? ' y la anon cerrada (0005)' : '; 0005 (cerrar la anon) pendiente'}` };
}

async function checkGithub(env: WaltEnv): Promise<Row> {
  const name = `GitHub (usuario y acceso a ${env.DEMO_REPO})`;
  if (!env.GITHUB_TOKEN) return { name, ok: false, detail: `falta GITHUB_TOKEN (modo ${env.GITHUB_MODE})` };
  const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'walt-check' };
  const user = await getJson('https://api.github.com/user', headers);
  if (user.status !== 200) return { name, ok: false, detail: `el token no es válido (HTTP ${user.status})` };
  const repo = await getJson(`https://api.github.com/repos/${env.DEMO_REPO}`, headers);
  if (repo.status !== 200) return { name, ok: false, detail: `${user.body.login} no ve ${env.DEMO_REPO}` };
  const push = repo.body?.permissions?.push;
  return { name, ok: push !== false, detail: `${user.body.login}${push === false ? ', sin permiso de escritura' : ', con escritura'}` };
}

async function checkModel(env: WaltEnv): Promise<Row> {
  const name = `Modelo (${env.LLM_PROVIDER})`;
  if (env.LLM_PROVIDER === 'fake') return { name, ok: false, detail: 'proveedor falso: la demo necesita el modelo real' };
  if (env.LLM_PROVIDER === 'bedrock') {
    const ok = !!(env.AWS_REGION && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
    return { name, ok, detail: ok ? 'credenciales de AWS presentes (sin llamada de prueba)' : 'faltan credenciales de AWS' };
  }
  if (!env.ANTHROPIC_API_KEY) return { name, ok: false, detail: 'falta ANTHROPIC_API_KEY' };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: TIMEOUT, maxRetries: 1 });
  const models = [...new Set([env.MODEL_INTERPRET, env.MODEL_AGENT])];
  for (const m of models) await client.models.retrieve(m);
  return { name, ok: true, detail: `${models.join(' y ')} disponibles` };
}

async function checkVercel(): Promise<Row> {
  const name = 'Vercel (vercel whoami)';
  try {
    const { stdout } = await run('vercel', ['whoami'], { timeout: 20_000 });
    const who = stdout.trim().split('\n').pop() ?? '';
    return { name, ok: who.length > 0, detail: who ? 'sesión iniciada' : 'sin sesión' };
  } catch (err) {
    const code = (err as { code?: string }).code;
    return { name, ok: false, detail: code === 'ENOENT' ? 'no está instalada la CLI de vercel' : 'sin sesión: corré vercel login' };
  }
}

function checkPresent(env: WaltEnv): Row[] {
  return [
    { name: 'Panel (PANEL_PASSWORD)', ok: !!env.PANEL_PASSWORD, detail: env.PANEL_PASSWORD ? 'definida' : 'falta' },
    { name: 'Sitio demo (DEMO_SITE_URL)', ok: !!env.DEMO_SITE_URL, detail: env.DEMO_SITE_URL ? 'definida' : 'falta: se usa http://localhost:3001' },
    { name: 'Audios (OPENAI_API_KEY, opcional)', ok: !!env.OPENAI_API_KEY, detail: env.OPENAI_API_KEY ? 'definida' : 'sin audios: se pide por escrito' },
  ];
}

async function main() {
  const env = loadEnv();
  const checks: [string, () => Promise<Row>][] = [
    ['Telegram', () => checkTelegram(env)],
    ['Supabase', () => checkSupabaseApi(env)],
    ['Supabase anon', () => checkSupabaseAnon(env)],
    ['Migraciones', () => checkSchema(env)],
    ['GitHub', () => checkGithub(env)],
    ['Modelo', () => checkModel(env)],
    ['Vercel', () => checkVercel()],
  ];
  const rows: Row[] = await Promise.all(
    checks.map(async ([label, fn]) => {
      try {
        return await fn();
      } catch (err) {
        const msg = redact(err instanceof Error ? err.message : String(err), env.secrets).slice(0, 120);
        return { name: label, ok: false, detail: `error: ${msg}` };
      }
    }),
  );
  rows.push(...checkPresent(env));

  if (process.argv.includes('--md')) {
    console.log('| Chequeo | Estado | Detalle |\n|---|---|---|');
    for (const r of rows) console.log(`| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail} |`);
  } else {
    const width = Math.max(...rows.map((r) => r.name.length));
    for (const r of rows) console.log(`${r.ok ? '✅' : '❌'}  ${r.name.padEnd(width)}  ${r.detail}`);
  }
  console.log(`\nModos: TELEGRAM_MODE=${env.TELEGRAM_MODE} GITHUB_MODE=${env.GITHUB_MODE} LLM_PROVIDER=${env.LLM_PROVIDER} SCREENSHOTS=${env.SCREENSHOTS}`);
}

main().catch((err) => {
  console.error('check-env falló:', err instanceof Error ? err.message : err);
  process.exit(1);
});
