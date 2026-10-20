/**
 * Demo del R1 (docs/DEMO.md): los cuatro casos con el pipeline real del worker, en el canal de consola y con
 * la base en memoria (no toca Supabase: anda con la 0004 aplicada o sin ella). El modelo, GitHub y las
 * capturas son los del entorno: la demo corre con el modelo real.
 *
 *   simple      «subí los panes a 95»: vista previa con la advertencia de la masa madre (baja de $220 a $95)
 *               y [Dale]; el cliente aprueba y se publica sin la agencia; después [Volver a como estaba].
 *   delicado    «guardá las reservas en la base de datos»: el agente arma el PR y espera a la agencia. Al
 *               final la agencia lo descarta (se cierra el PR), salvo con --dejar-pr.
 *   nuevo       «quiero cobrar las tortas online con Mercado Pago»: presupuesto; la agencia lo manda, el
 *               cliente lo acepta y recibe el link de la seña (de prueba: no se cobra).
 *   reetiqueta  un cartel con 50% de descuento sale simple; la agencia lo reetiqueta como delicado («los
 *               descuentos grandes los aprueba la agencia»); uno parecido, con 40%, ahora va a la agencia.
 *
 * Uso: pnpm demo:r1 [simple] [delicado] [nuevo] [reetiqueta] [--dejar-pr]   (sin casos, corre los cuatro)
 * Con GITHUB_MODE=real, publicar y volver atrás commitean content/site.json en el repo del sitio (como el
 * dry-run) y el caso delicado abre un PR de verdad. Sale con 1 si algún caso no dio lo esperado.
 */
import { loadEnv, normalizeCategory, redact, REQUEST_STATUSES, type RequestRow, type WaltEnv } from '@walt/core';
import { buildApp, memoryStore, type App } from '../apps/worker/src/app.ts';
import { ConsoleChannel } from '../apps/worker/src/channel/console.ts';
import { CONSOLE_CHATS, ensureConsoleContacts } from '../apps/worker/src/console-contacts.ts';

const CASES = ['simple', 'delicado', 'nuevo', 'reetiqueta'] as const;
type CaseName = (typeof CASES)[number];

const TEXTS = {
  simple: 'subí los panes a 95',
  delicado: 'guardá las reservas en la base de datos',
  nuevo: 'quiero cobrar las tortas online con Mercado Pago',
  reetiquetaPrimero: 'poné un cartel de 50% de descuento en todo',
  reetiquetaMotivo: 'los descuentos grandes los aprueba la agencia',
  reetiquetaDespues: 'poné un cartel con 40% de descuento en todo hasta el domingo',
} as const;
const PANES = ['pan-flauta', 'pan-masa-madre', 'baguette'];

interface Outcome {
  caso: CaseName;
  pedidos: { text: string; short: string; category: string; lane: string; status: string; costUsd: number }[];
  checks: { ok: boolean; label: string }[];
  ms: number;
}

const t0 = performance.now();
const at = () => `+${String(Math.round(performance.now() - t0)).padStart(6)} ms`;

interface Session {
  app: App;
  channel: ConsoleChannel;
  clienteId: string;
  close(): Promise<void>;
}

async function session(env: WaltEnv): Promise<Session> {
  const channel = new ConsoleChannel((l) => console.log(`${at()} ${l}`), { [CONSOLE_CHATS.cliente]: 'cliente', [CONSOLE_CHATS.agencia]: 'agencia' });
  const app = await buildApp(env, {
    channel,
    store: memoryStore(env),
    log: (l) => console.log(`${at()} ${redact(l, env.secrets)}`),
    onEvent: (e) => {
      if (e.status === 'inicio') return;
      const dur = e.durationMs !== null ? ` (${e.durationMs} ms)` : '';
      const detail = e.detail ? ` ${redact(JSON.stringify(e.detail), env.secrets).slice(0, 400)}` : '';
      console.log(`${at()} ${e.status === 'ok' ? '✓' : '✗'} ${e.step}${dur}${detail}`);
    },
  });
  const { cliente } = await ensureConsoleContacts(app.store);
  return { app, channel, clienteId: cliente.id, close: () => app.close() };
}

async function ask(s: Session, text: string): Promise<RequestRow> {
  console.log(`\n${at()} 📩 cliente: ${text}`);
  await s.app.worker.handle({ kind: 'text', chatId: CONSOLE_CHATS.cliente, fromName: 'Mabel', text });
  await s.app.idle();
  const req = await s.app.store.latestRequestOfContact(s.clienteId, [...REQUEST_STATUSES]);
  if (!req) throw new Error(`No se creó el pedido para «${text}»`);
  return req;
}

async function press(s: Session, who: 'cliente' | 'agencia', data: string): Promise<void> {
  console.log(`${at()} 👆 ${who} aprieta ${data}`);
  await s.app.worker.handle({ kind: 'callback', chatId: CONSOLE_CHATS[who], fromName: 'consola', data });
  await s.app.idle();
}

const reload = async (s: Session, req: RequestRow) => (await s.app.store.getRequest(req.id))!;
const category = (req: RequestRow) => normalizeCategory(req.category) ?? '—';
const sentTo = (s: Session, who: 'cliente' | 'agencia') => s.channel.sent.filter((m) => m.chatId === CONSOLE_CHATS[who]);
const buttonsTo = (s: Session, who: 'cliente' | 'agencia', short: string) =>
  sentTo(s, who).flatMap((m) => m.buttons?.flat() ?? []).flatMap((b) => ('data' in b && b.data.endsWith(`:${short}`) ? [b.data] : []));

function record(out: Outcome, req: RequestRow): void {
  out.pedidos.push({
    text: req.raw_text,
    short: req.short_id,
    category: category(req),
    lane: req.lane ?? '—',
    status: req.status,
    costUsd: Number(req.cost_usd) || 0,
  });
}

function check(out: Outcome, ok: boolean, label: string): void {
  out.checks.push({ ok, label });
  console.log(`${at()} ${ok ? '✅' : '❌'} ${label}`);
}

async function runSimple(env: WaltEnv, out: Outcome): Promise<void> {
  const s = await session(env);
  try {
    let req = await ask(s, TEXTS.simple);
    check(out, category(req) === 'simple', `«${TEXTS.simple}» es simple (salió ${category(req)})`);
    check(out, req.status === 'esperando_cliente', `vista previa al cliente con [Dale] (estado ${req.status})`);
    check(out, !buttonsTo(s, 'agencia', req.short_id).some((d) => d.startsWith('gok:')), 'la agencia no tiene nada que aprobar');
    const warnings = ((req.gate as { warnings?: string[] } | null)?.warnings ?? []).join(' · ');
    check(out, /masa madre/i.test(warnings), `advertencia en la vista previa: ${warnings || '(ninguna)'}`);
    if (req.status === 'esperando_cliente') {
      await press(s, 'cliente', `ok:${req.short_id}`);
      req = await reload(s, req);
      check(out, req.status === 'publicado', `publicado con el «Dale» del cliente (estado ${req.status})`);
      const live = await s.app.store.getLiveVersion(req.project_id);
      const products = (live?.content as { products?: { id: string; price: number }[] } | undefined)?.products ?? [];
      const prices = PANES.map((id) => products.find((p) => p.id === id)?.price);
      check(out, prices.every((p) => p === 95), `versión viva con los panes a 95 (${PANES.map((id, i) => `${id} ${prices[i] ?? '?'}`).join(', ')})`);
      if (req.status === 'publicado') {
        await press(s, 'cliente', `undo:${req.short_id}`);
        req = await reload(s, req);
        check(out, req.status === 'revertido', `[Volver a como estaba] (estado ${req.status})`);
      }
    }
    record(out, req);
  } finally {
    await s.close();
  }
}

async function runDelicado(env: WaltEnv, out: Outcome, keepPr: boolean): Promise<void> {
  const s = await session(env);
  try {
    let req = await ask(s, TEXTS.delicado);
    check(out, category(req) === 'delicado', `«${TEXTS.delicado}» es delicado (salió ${category(req)})`);
    const waiting = req.status === 'agente_listo' || req.status === 'esperando_agencia';
    check(out, waiting, `espera a la agencia (estado ${req.status}${req.pr_url ? `, ${req.pr_url}` : ''})`);
    check(out, buttonsTo(s, 'agencia', req.short_id).some((d) => d.startsWith('gok:')), 'la agencia recibió [Aprobar]');
    check(out, !buttonsTo(s, 'cliente', req.short_id).some((d) => d.startsWith('ok:')), 'el cliente todavía no puede publicar');
    record(out, req);
    if (waiting && !keepPr) {
      // The agency discards it so the demo does not leave a PR open (it would merge a DB change into the demo site).
      await press(s, 'agencia', `gno:${req.short_id}`);
      req = await reload(s, req);
      console.log(`${at()} (descartado por la agencia para no dejar el PR abierto: estado ${req.status})`);
    }
  } finally {
    await s.close();
  }
}

async function runNuevo(env: WaltEnv, out: Outcome): Promise<void> {
  const s = await session(env);
  try {
    let req = await ask(s, TEXTS.nuevo);
    check(out, category(req) === 'nuevo', `«${TEXTS.nuevo}» es algo nuevo (salió ${category(req)})`);
    const quote = req.quote_id ? await s.app.store.getQuote(req.quote_id) : null;
    check(out, !!quote, quote ? `presupuesto borrador: «${quote.title}», USD ${quote.amount_usd}, ${quote.eta_days} días` : 'presupuesto borrador');
    if (quote) {
      console.log(`${at()} 🧾 la agencia manda el presupuesto desde el panel (enviar_presupuesto)`);
      await s.app.worker.runCommand({
        id: globalThis.crypto.randomUUID(),
        type: 'enviar_presupuesto',
        request_id: req.id,
        payload: { quote_id: quote.id, via: 'panel' },
        status: 'pendiente',
        error: null,
        done_at: null,
        created_at: new Date().toISOString(),
      });
      await s.app.idle();
      check(out, buttonsTo(s, 'cliente', req.short_id).some((d) => d.startsWith('qok:')), 'el cliente recibió el presupuesto con [Aceptar]');
      await press(s, 'cliente', `qok:${req.short_id}`);
      req = await reload(s, req);
      const accepted = await s.app.store.getQuote(quote.id);
      check(out, accepted?.status === 'aceptado', `presupuesto aceptado (estado ${accepted?.status})`);
      const link = sentTo(s, 'cliente')
        .map((m) => m.text ?? '')
        .join('\n')
        .match(/https:\/\/\S+/g)
        ?.find((u) => /sena|seña|pago/i.test(u));
      check(out, !!link, link ? `link de la seña: ${link}` : 'link de la seña');
    }
    record(out, req);
  } finally {
    await s.close();
  }
}

async function runReetiqueta(env: WaltEnv, out: Outcome): Promise<void> {
  const s = await session(env);
  try {
    const first = await ask(s, TEXTS.reetiquetaPrimero);
    check(out, category(first) === 'simple', `antes: «${TEXTS.reetiquetaPrimero}» es simple (salió ${category(first)})`);
    record(out, first);
    if (first.status === 'esperando_cliente') await press(s, 'cliente', `no:${first.short_id}`);
    console.log(`${at()} 🏷️  la agencia reetiqueta #${first.short_id}: simple → delicado («${TEXTS.reetiquetaMotivo}»)`);
    await s.app.store.labelRequest(first.id, 'delicado', TEXTS.reetiquetaMotivo, null);
    const second = await ask(s, TEXTS.reetiquetaDespues);
    check(out, category(second) === 'delicado', `después: «${TEXTS.reetiquetaDespues}» es delicado (salió ${category(second)})`);
    check(out, second.status === 'esperando_agencia', `va a la agencia (estado ${second.status})`);
    record(out, second);
  } finally {
    await s.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keepPr = args.includes('--dejar-pr');
  const picked = args.filter((a): a is CaseName => (CASES as readonly string[]).includes(a));
  const unknown = args.filter((a) => !a.startsWith('--') && !(CASES as readonly string[]).includes(a));
  if (unknown.length) {
    console.error(`No conozco: ${unknown.join(', ')}. Casos: ${CASES.join(', ')}`);
    process.exit(1);
  }
  const env = loadEnv({ fallbackToFake: true });
  console.log(`demo:r1 · modelo ${env.LLM_PROVIDER}${env.LLM_PROVIDER === 'fake' ? ' (FALSO: no es la IA)' : ` (${env.MODEL_INTERPRET})`} · base en memoria · github ${env.GITHUB_MODE} · capturas ${env.SCREENSHOTS}`);
  if (env.downgraded.length) console.log(`(en modo falso por falta de credenciales: ${env.downgraded.join(', ')})`);

  const outcomes: Outcome[] = [];
  for (const caso of picked.length ? picked : CASES) {
    console.log(`\n━━━━━━━━ ${caso} ━━━━━━━━`);
    const out: Outcome = { caso, pedidos: [], checks: [], ms: 0 };
    const start = performance.now();
    try {
      if (caso === 'simple') await runSimple(env, out);
      else if (caso === 'delicado') await runDelicado(env, out, keepPr);
      else if (caso === 'nuevo') await runNuevo(env, out);
      else await runReetiqueta(env, out);
    } catch (err) {
      check(out, false, `falló: ${redact(err instanceof Error ? err.message : String(err), env.secrets)}`);
    }
    out.ms = Math.round(performance.now() - start);
    outcomes.push(out);
  }

  console.log('\nResumen');
  let total = 0;
  let failures = 0;
  for (const o of outcomes) {
    const bad = o.checks.filter((c) => !c.ok).length;
    failures += bad;
    const cost = o.pedidos.reduce((a, p) => a + p.costUsd, 0);
    total += cost;
    console.log(`  ${bad === 0 ? '✅' : '❌'} ${o.caso.padEnd(11)} ${(o.ms / 1000).toFixed(1).padStart(6)} s  USD ${cost.toFixed(4)}`);
    for (const p of o.pedidos) console.log(`       #${p.short} ${p.category}/${p.lane} → ${p.status}  «${p.text}»`);
    for (const c of o.checks.filter((x) => !x.ok)) console.log(`       ❌ ${c.label}`);
  }
  console.log(`  costo de IA total: USD ${total.toFixed(4)} (lo que sumaron los pedidos)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  let secrets: string[] = [];
  try {
    secrets = loadEnv().secrets;
  } catch {
    // ignore
  }
  console.error('demo:r1 falló:', redact(err instanceof Error ? err.message : String(err), secrets));
  process.exit(1);
});
