import { createInterface } from 'node:readline';
import { describeEnv, loadEnv, missingCredentials, redact } from '@dale/core';
import { buildApp } from './app.js';
import { ConsoleChannel } from './channel/console.js';
import { TelegramChannel } from './channel/telegram.js';
import { CONSOLE_CHATS, ensureConsoleContacts } from './console-contacts.js';

export { buildApp, storeFromEnv } from './app.js';
export { Worker } from './pipeline.js';
export { MemoryStore, seedMemory } from './store/memory.js';
export { PgStore, postgresDb, type Db } from './store/pg.js';
export type { Store } from './store/types.js';

/**
 * Worker entry point (SPEC §2, §12, §17). One process: Telegram (polling or webhook) or
 * the console, queues, pipeline and the panel commands poller. Never logs secret values.
 */
export async function main(): Promise<void> {
  const env = loadEnv({ fallbackToFake: true });
  const log = (l: string) => console.log(redact(l, env.secrets));
  log(`[worker] arrancando ${JSON.stringify(describeEnv(env))}`);
  for (const m of missingCredentials({ ...env, LLM_PROVIDER: 'fake', GITHUB_MODE: 'fake', TELEGRAM_MODE: 'console' })) {
    log(`[worker] faltan credenciales para ${m.mode}: ${m.keys.join(', ')}`);
  }
  if (env.downgraded.length > 0) log(`[worker] en modo falso por falta de credenciales: ${env.downgraded.join(', ')}`);

  const telegram = env.TELEGRAM_MODE !== 'console' && env.TELEGRAM_BOT_TOKEN ? new TelegramChannel(env.TELEGRAM_BOT_TOKEN, log) : null;
  const channel = telegram ?? new ConsoleChannel(log, { [CONSOLE_CHATS.cliente]: 'cliente', [CONSOLE_CHATS.agencia]: 'agencia' });
  const app = await buildApp(env, { channel, log });
  log(`[worker] base: ${app.store.kind}`);
  const recovered = await app.worker.recoverInterrupted();
  if (recovered > 0) log(`[worker] ${recovered} pedido(s) cortados por un reinicio pasaron a derivado`);
  app.commands.start();

  if (telegram) {
    telegram.onUpdate((u) => app.worker.handle(u));
    if (env.TELEGRAM_MODE === 'webhook') {
      await telegram.startWebhook(env.PUBLIC_WORKER_URL!, env.TELEGRAM_WEBHOOK_SECRET!, Number(process.env.PORT ?? 8080));
    } else {
      await telegram.startPolling();
    }
  } else {
    // Console: each line is a client message; "boton <data>" presses a client button, "agencia <data>" an agency one.
    await ensureConsoleContacts(app.store);
    log('[worker] consola: escribí un pedido; "boton ok:XXXXXX" o "agencia gok:XXXXXX" para los botones');
    const rl = createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      const l = line.trim();
      if (!l) return;
      const m = l.match(/^(boton|agencia)\s+(\S+)$/);
      if (m) {
        void app.worker.handle({ kind: 'callback', chatId: m[1] === 'agencia' ? CONSOLE_CHATS.agencia : CONSOLE_CHATS.cliente, fromName: 'consola', data: m[2]! });
      } else {
        void app.worker.handle({ kind: 'text', chatId: CONSOLE_CHATS.cliente, fromName: 'consola', text: l });
      }
    });
  }

  const shutdown = async (signal: string) => {
    log(`[worker] ${signal}: cerrando`);
    await telegram?.stop();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[worker] no arrancó:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
