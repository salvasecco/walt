import { createInterface } from 'node:readline';
import { describeEnv, loadEnv, missingCredentials, redact } from '@walt/core';
import { buildApp } from './app.js';
import { ConsoleChannel } from './channel/console.js';
import { TelegramChannel } from './channel/telegram.js';
import { CONSOLE_CHATS, ensureConsoleContacts } from './console-contacts.js';
import { loadExtraEnv } from './extra-env.js';
import { startHealthServer, type HealthServer, type ReadinessCheck } from './health.js';
import { createLogger, logFormatFromEnv } from './log.js';

export { buildApp, storeFromEnv } from './app.js';
export { Worker } from './pipeline.js';
export { DurableWorker } from './durable.js';
export { JobRunner } from './queue.js';
export { MemoryStore, seedMemory } from './store/memory.js';
export { PgStore, postgresDb, type Db } from './store/pg.js';
export type { Store } from './store/types.js';

/**
 * Worker entry point (SPEC §2, §12, §17). One process: Telegram (polling or webhook) or the console, the
 * queue, the pipeline, the panel commands and an HTTP server with /healthz, /readyz and /metrics.
 *
 * Queue: durable in Postgres when Supabase has migration 0004 (WORKER_QUEUE=auto, the default); with an
 * older database it says so and keeps the in-memory queue as before. Never logs secret values.
 */
export async function main(): Promise<void> {
  const env = loadEnv({ fallbackToFake: true });
  const extra = loadExtraEnv();
  const logger = createLogger({
    format: logFormatFromEnv(),
    secrets: [...env.secrets, ...extra.secrets],
    base: { service: 'walt-worker', worker_id: extra.workerId },
  });
  const log = (l: string) => logger.line(redact(l, env.secrets));
  log(`[worker] arrancando ${JSON.stringify(describeEnv(env))}`);
  for (const m of missingCredentials({ ...env, LLM_PROVIDER: 'fake', GITHUB_MODE: 'fake', TELEGRAM_MODE: 'console' })) {
    log(`[worker] faltan credenciales para ${m.mode}: ${m.keys.join(', ')}`);
  }
  if (env.downgraded.length > 0) log(`[worker] en modo falso por falta de credenciales: ${env.downgraded.join(', ')}`);

  const telegram = env.TELEGRAM_MODE !== 'console' && env.TELEGRAM_BOT_TOKEN ? new TelegramChannel(env.TELEGRAM_BOT_TOKEN, log) : null;
  const channel = telegram ?? new ConsoleChannel(log, { [CONSOLE_CHATS.cliente]: 'cliente', [CONSOLE_CHATS.agencia]: 'agencia' });
  const app = await buildApp(env, {
    channel,
    log,
    logger,
    extra,
    durable: extra.queueMode === 'durable' ? true : extra.queueMode === 'memoria' ? false : 'auto',
  });
  log(`[worker] base: ${app.store.kind} · cola: ${app.mode} · id ${extra.workerId}`);
  if (app.store.kind === 'postgres' && !app.schema.r1) {
    log(
      `[worker] ⚠️ la base no tiene la migración 0004 (falta: ${app.schema.missing.join(', ')}). Sigo como antes: cola en memoria, ` +
        'publish_version sin locking, sin ledger de uso ni GitHub App. Para la cola durable: pnpm db:migrate --copy 0004',
    );
  }

  if (app.runner) {
    // Durable: what a restart cut is retried from its job; what has no job goes to derivado (cron `reap`).
    app.runner.start();
    app.cron?.start();
  } else {
    const recovered = await app.worker.recoverInterrupted();
    if (recovered > 0) log(`[worker] ${recovered} pedido(s) cortados por un reinicio pasaron a derivado`);
  }
  app.commands.start();

  let telegramUp = !telegram;
  const checks: Record<string, () => Promise<ReadinessCheck>> = {
    telegram: async () => ({ ok: telegramUp, detail: telegram ? env.TELEGRAM_MODE : 'consola' }),
  };
  let health: HealthServer | null = null;
  if (extra.port > 0) {
    try {
      health = await startHealthServer({
        port: extra.port,
        checks: app.readiness(checks),
        metrics: () => app.metrics(),
        routes: telegram && env.TELEGRAM_MODE === 'webhook' ? { 'POST /telegram': telegram.webhookHandler(env.TELEGRAM_WEBHOOK_SECRET!) } : {},
        log,
      });
    } catch (err) {
      if (env.TELEGRAM_MODE === 'webhook') throw err;
      log(`[health] no pude abrir el puerto ${extra.port} (${err instanceof Error ? err.message : String(err)}): sigo sin health checks`);
    }
  }

  if (telegram) {
    telegram.onUpdate((u) => app.intake(u));
    if (env.TELEGRAM_MODE === 'webhook') {
      if (!health) throw new Error('El webhook necesita el servidor HTTP (PORT)');
      await telegram.setWebhook(env.PUBLIC_WORKER_URL!, env.TELEGRAM_WEBHOOK_SECRET!);
    } else {
      await telegram.startPolling();
    }
    telegramUp = true;
  } else {
    // Console: each line is a client message; "boton <data>" presses a client button, "agencia <data>" an agency one.
    await ensureConsoleContacts(app.store);
    log('[worker] consola: escribí un pedido; "boton ok:XXXXXX" o "agencia gok:XXXXXX" para los botones');
    const rl = createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      const l = line.trim();
      if (!l) return;
      const m = l.match(/^(boton|agencia)\s+(\S+)$/);
      const u = m
        ? { kind: 'callback' as const, chatId: m[1] === 'agencia' ? CONSOLE_CHATS.agencia : CONSOLE_CHATS.cliente, fromName: 'consola', data: m[2]! }
        : { kind: 'text' as const, chatId: CONSOLE_CHATS.cliente, fromName: 'consola', text: l };
      void app.intake(u).catch((err) => log(`[consola] ${err instanceof Error ? err.message : String(err)}`));
    });
  }

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    log(`[worker] ${signal}: cerrando (dejo de tomar trabajos y espero los que corren)`);
    // First readiness goes 503 so the platform stops sending traffic; then stop receiving and drain.
    health?.setDraining(true);
    await telegram?.stop();
    await app.close();
    await health?.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    let secrets: string[] = [];
    try {
      secrets = [...loadEnv().secrets, ...loadExtraEnv().secrets];
    } catch {
      // ignore
    }
    console.error('[worker] no arrancó:', redact(err instanceof Error ? err.message : String(err), secrets));
    process.exit(1);
  });
}
