import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { loadEnv, SEED_IDS, describeEnv, normalizeCategory, redact, type Interpretation } from '@walt/core';
import { buildApp, memoryStore } from './app.js';
import { ConsoleChannel } from './channel/console.js';
import { CONSOLE_CHATS, ensureConsoleContacts } from './console-contacts.js';

const USAGE = 'Uso: pnpm dry-run "<pedido>" [--approve] [--agency] [--undo] [--audio <archivo>] [--project <id>] [--memoria]';

/**
 * `pnpm dry-run "<pedido>" [--approve] [--agency] [--undo] [--audio <archivo>] [--project <id>] [--memoria]`
 * `--approve` approves (client `ok`, or agency `gok` when it waits for the agency).
 * `--agency` also approves a code change as the agency once the agent has its PR (`gok`), then the client
 * publishes it from the preview (`ok`) and the run waits until it is on the web.
 * `--audio <file>` sends the file as a Telegram voice note (same handler) instead of text.
 * `--memoria` uses the in-memory store even when Supabase is configured.
 * Runs the real pipeline (SPEC §9) on the console channel and prints every step with its time,
 * plus a summary per step at the end.
 */
export function parseArgs(argv: string[]) {
  const out = { text: '', approve: false, agency: false, undo: false, memory: false, audio: '', project: SEED_IDS.project as string };
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--approve') out.approve = true;
    else if (a === '--agency') out.agency = out.approve = true;
    else if (a === '--audio') out.audio = argv[++i] ?? '';
    else if (a === '--undo') out.undo = out.approve = true;
    else if (a === '--memoria') out.memory = true;
    else if (a === '--project') out.project = argv[++i] ?? out.project;
    else if (a !== '--') words.push(a);
  }
  out.text = words.join(' ').trim();
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.text && !args.audio) {
    console.error(USAGE);
    process.exit(1);
  }
  const env = loadEnv({ fallbackToFake: true });
  const t0 = performance.now();
  const at = () => `+${String(Math.round(performance.now() - t0)).padStart(5)} ms`;
  const steps: { step: string; status: string; durationMs: number | null; at: number }[] = [];
  const channel = new ConsoleChannel((l) => console.log(`${at()} ${l}`), { [CONSOLE_CHATS.cliente]: 'cliente', [CONSOLE_CHATS.agencia]: 'agencia' });
  const app = await buildApp(env, {
    channel,
    ...(args.memory ? { store: memoryStore(env) } : {}),
    log: (l) => console.log(`${at()} ${redact(l, env.secrets)}`),
    onEvent: (e) => {
      if (e.status === 'inicio') return;
      steps.push({ step: e.step, status: e.status, durationMs: e.durationMs, at: Math.round(performance.now() - t0) });
      const mark = e.status === 'ok' ? '✓' : '✗';
      const dur = e.durationMs !== null ? ` (${e.durationMs} ms)` : '';
      const detail = e.detail ? ` ${redact(JSON.stringify(e.detail), env.secrets)}` : '';
      console.log(`${at()} ${mark} ${e.step}${dur}${detail}`);
    },
  });
  const modes = describeEnv(env);
  console.log(`dry-run · modelo ${modes.LLM_PROVIDER} · base ${app.store.kind} · github ${modes.GITHUB_MODE} · capturas ${modes.SCREENSHOTS}`);
  if (env.downgraded.length) console.log(`(en modo falso por falta de credenciales: ${env.downgraded.join(', ')})`);
  try {
    const { cliente } = await ensureConsoleContacts(app.store, args.project);
    if (args.audio) {
      const file = args.audio;
      console.log(`${at()} 🎙️ cliente manda un audio: ${file}`);
      await app.worker.handle({
        kind: 'voice',
        chatId: CONSOLE_CHATS.cliente,
        fromName: cliente.display_name,
        download: async () => ({ data: await readFile(file), mime: audioMime(file) }),
      });
    } else {
      console.log(`${at()} 📩 cliente: ${args.text}`);
      await app.worker.handle({ kind: 'text', chatId: CONSOLE_CHATS.cliente, fromName: cliente.display_name, text: args.text });
    }
    await app.worker.idle();
    let req = await app.store.latestRequestOfContact(cliente.id, [
      'recibido', 'interpretando', 'respondido', 'cotizando', 'cotizado', 'esperando_cliente', 'esperando_agencia', 'agente_trabajando',
      'agente_listo', 'publicando', 'publicado', 'revertido', 'rechazado', 'bloqueado', 'derivado', 'descartado', 'charla',
    ]);
    if (!req) {
      if (!args.audio) throw new Error('No se creó el pedido');
      console.log('\nSin pedido: el audio no se transcribió (mirá la respuesta de arriba).');
      return;
    }

    // The agency approves first when it has to (risky content, or a code change with its PR); the client
    // always publishes from the preview.
    for (let i = 0; i < 3 && args.approve; i++) {
      const asAgency = req.status === 'esperando_agencia' || (args.agency && req.status === 'agente_listo');
      if (!asAgency && req.status !== 'esperando_cliente') break;
      const data = `${asAgency ? 'gok' : 'ok'}:${req.short_id}`;
      console.log(`${at()} 👆 ${asAgency ? 'agencia' : 'cliente'} aprieta ${data}`);
      await app.worker.handle({ kind: 'callback', chatId: asAgency ? CONSOLE_CHATS.agencia : CONSOLE_CHATS.cliente, fromName: 'consola', data });
      await app.worker.idle();
      req = (await app.store.getRequest(req.id))!;
    }
    if (args.undo && req.status === 'publicado') {
      const data = `undo:${req.short_id}`;
      console.log(`${at()} 👆 cliente aprieta ${data}`);
      await app.worker.handle({ kind: 'callback', chatId: CONSOLE_CHATS.cliente, fromName: 'consola', data });
      await app.worker.idle();
      req = (await app.store.getRequest(req.id))!;
    }
    const it = req.interpretation as Interpretation | null;
    console.log('\nResultado');
    console.log(`  pedido     #${req.short_id} (${req.id})`);
    console.log(`  estado     ${req.status}`);
    console.log(`  categoría  ${normalizeCategory(req.category) ?? '—'}${req.lane ? ` · carril ${req.lane}` : ''}`);
    if (it) console.log(`  resumen    ${it.summary} (confianza ${Math.round(it.confidence * 100)}%)`);
    if (it?.ops.length) console.log(`  ops        ${JSON.stringify(it.ops)}`);
    const reasons = (req.gate as { reasons?: string[] } | null)?.reasons ?? [];
    if (reasons.length) console.log(`  razones    ${reasons.join(' · ')}`);
    if (req.changes) console.log(`  cambios    ${JSON.stringify(req.changes)}`);
    if (req.preview_url) console.log(`  vista      ${req.preview_url}`);
    if (req.error) console.log(`  error      ${req.error}`);
    console.log(`  costo      USD ${Number(req.cost_usd).toFixed(5)}`);
    console.log(`  total      ${Math.round(performance.now() - t0)} ms`);
    console.log('\nPasos (duración · terminó en)');
    for (const s of steps) {
      const dur = s.durationMs !== null ? `${(s.durationMs / 1000).toFixed(1)} s` : '—';
      console.log(`  ${s.status === 'ok' ? '✓' : '✗'} ${s.step.padEnd(17)} ${dur.padStart(8)} · +${(s.at / 1000).toFixed(1)} s`);
    }
  } finally {
    await app.close();
  }
}

function audioMime(file: string): string {
  const ext = extname(file).toLowerCase();
  const map: Record<string, string> = { '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'audio/webm', '.aiff': 'audio/aiff' };
  return map[ext] ?? 'application/octet-stream';
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => {
  let secrets: string[] = [];
  try {
    secrets = loadEnv().secrets;
  } catch {
    // ignore
  }
  console.error('dry-run falló:', redact(err instanceof Error ? err.message : String(err), secrets));
  process.exit(1);
});
