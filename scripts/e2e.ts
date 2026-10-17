/**
 * End-to-end (SPEC §16): asks for a price change as a client, approves with [Dale], checks the live
 * version and the site HTML, reverts with [Volver a como estaba] and checks again.
 *
 * Runs the real worker pipeline in-process on the console channel (no Telegram), with whatever the
 * environment has: Postgres + real model + real GitHub when the credentials exist. It prints which parts
 * were real and never claims a site check it could not do.
 *
 * Usage: pnpm e2e [--strict]   (--strict fails if the model, the base or the site are not real)
 */
import { loadEnv, redact, SEED_IDS } from '@walt/core';
import { buildApp } from '../apps/worker/src/app.ts';
import { ConsoleChannel } from '../apps/worker/src/channel/console.ts';

const CHAT = 990_000_001; // fixed fake chat id for the e2e client contact
const strict = process.argv.includes('--strict');

type Content = { products: { id: string; price: number }[] };
const flauta = (c: unknown) => (c as Content).products.find((p) => p.id === 'pan-flauta')!.price;

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Fetches the site until it shows `versionId` live and the pan flauta at `price`, up to 20 s. */
async function siteShows(siteUrl: string, versionId: string, price: number): Promise<string> {
  const deadline = Date.now() + 20_000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${siteUrl}?e2e=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
      const html = await res.text();
      const source = html.match(/data-content-source="(\w+)"/)?.[1];
      const version = html.match(/data-version-id="([^"]*)"/)?.[1];
      const shown = html.match(/data-product="pan-flauta"[\s\S]*?data-testid="price"[^>]*>([^<]+)</)?.[1]?.trim();
      last = `fuente ${source ?? '?'}, versión ${version || '—'}, pan flauta "${shown ?? '?'}"`;
      if (source === 'live' && version === versionId && shown?.replace(/\D/g, '') === String(price)) return `ok: ${last}`;
    } catch (err) {
      last = `fetch falló: ${err instanceof Error ? err.message : String(err)}`; // no secrets in a public URL fetch
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(last);
}

async function main(): Promise<void> {
  const env = loadEnv({ fallbackToFake: true });
  const channel = new ConsoleChannel((l) => console.log(l), { [CHAT]: 'cliente e2e' });
  const app = await buildApp(env, { channel });
  const { worker, store } = app;
  const siteUrl = env.DEMO_SITE_URL;
  const realModel = env.LLM_PROVIDER !== 'fake';
  const realDb = store.kind === 'postgres';
  const siteCheck = realDb && !!siteUrl;

  console.log('— Modo —');
  console.log(`  modelo: ${env.LLM_PROVIDER}${realModel ? '' : ' (FALSO: intérprete por reglas, no es la IA)'}`);
  console.log(`  base: ${store.kind}${realDb ? '' : ' (en memoria)'}`);
  console.log(`  GitHub: ${env.GITHUB_MODE}`);
  console.log(`  sitio: ${siteCheck ? siteUrl : 'sin chequeo del HTML (hace falta Supabase y DEMO_SITE_URL)'}`);
  if (env.downgraded.length) console.log(`  bajados a falso por falta de credenciales: ${env.downgraded.join(', ')}`);
  if (strict && (!realModel || !realDb || !siteCheck)) {
    console.log('\n--strict: falta el modelo real, la base o el sitio. No se corrió nada.');
    await app.close();
    process.exit(1);
  }

  try {
    await store.ensureContact({
      project_id: SEED_IDS.project,
      display_name: 'Cliente e2e',
      role: 'cliente',
      telegram_chat_id: CHAT,
    });
    const live0 = await store.getLiveVersion(SEED_IDS.project);
    if (!live0) throw new Error('El proyecto no tiene versión viva: corré pnpm seed');
    const before = flauta(live0.content);
    const target = before === 95 ? 85 : 95;
    const text = `subí el pan flauta a ${target}`;
    console.log(`\n— 1. Pedido: "${text}" (hoy está a ${before}) —`);
    const t0 = Date.now();
    await worker.handle({ kind: 'text', chatId: CHAT, fromName: 'Cliente e2e', text });
    await worker.idle();

    const ok = channel.lastButton(CHAT, 'ok:');
    check(!!ok, 'Llegó la vista previa con [Dale]');
    if (!ok) throw new Error('El pedido no llegó a esperar al cliente; mirá los mensajes de arriba');
    const short = ok.slice(3);

    console.log('\n— 2. El cliente aprueba —');
    await worker.handle({ kind: 'callback', chatId: CHAT, fromName: 'Cliente e2e', data: ok });
    await worker.idle();
    const published = await store.getRequestByShortId(short);
    check(published?.status === 'publicado', 'Pedido publicado', `estado ${published?.status}, ${Date.now() - t0} ms desde el pedido`);
    const live1 = await store.getLiveVersion(SEED_IDS.project);
    check(!!live1 && flauta(live1.content) === target, 'Versión viva con el precio nuevo', `pan flauta ${live1 ? flauta(live1.content) : '?'}`);
    if (live1?.git_error) console.log(`  ⚠️  commit falló (la versión igual quedó viva): ${live1.git_error}`);
    else if (live1?.git_commit_sha) console.log(`  commit ${live1.git_commit_sha.slice(0, 7)}`);
    if (siteCheck && live1) {
      try {
        check(true, 'El sitio muestra el precio nuevo', await siteShows(siteUrl!, live1.id, target));
      } catch (err) {
        check(false, 'El sitio muestra el precio nuevo', (err as Error).message);
      }
    }

    console.log('\n— 3. Volver a como estaba —');
    const undo = channel.lastButton(CHAT, 'undo:');
    check(!!undo, 'Llegó [Volver a como estaba]');
    if (undo) {
      await worker.handle({ kind: 'callback', chatId: CHAT, fromName: 'Cliente e2e', data: undo });
      await worker.idle();
      const reverted = await store.getRequestByShortId(short);
      check(reverted?.status === 'revertido', 'Pedido revertido', `estado ${reverted?.status}`);
      const live2 = await store.getLiveVersion(SEED_IDS.project);
      check(!!live2 && flauta(live2.content) === before, 'Versión viva con el precio de antes', `pan flauta ${live2 ? flauta(live2.content) : '?'}`);
      if (siteCheck && live2) {
        try {
          check(true, 'El sitio volvió al precio de antes', await siteShows(siteUrl!, live2.id, before));
        } catch (err) {
          check(false, 'El sitio volvió al precio de antes', (err as Error).message);
        }
      }
    }
  } finally {
    await app.close();
  }

  console.log(`\n${failures === 0 ? '✅ e2e en verde' : `❌ e2e con ${failures} falla(s)`}${siteCheck ? '' : ' (sin chequeo del sitio)'}${realModel ? '' : ' (modelo FALSO)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  let secrets: string[] = [];
  try {
    secrets = loadEnv().secrets;
  } catch {
    // ignore
  }
  console.error('e2e falló:', redact(err instanceof Error ? err.message : String(err), secrets));
  process.exit(1);
});
