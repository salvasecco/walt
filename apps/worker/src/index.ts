import { describeEnv, loadEnv, missingCredentials } from '@dale/core';

/**
 * Worker entry point. For now it only boots and logs the modes; 01-worker builds the
 * bot, the queues and the pipeline (SPEC §9). Never logs secret values.
 */
export function main(): void {
  const env = loadEnv({ fallbackToFake: true });
  console.log('[worker] arrancando', describeEnv(env));
  for (const m of missingCredentials({ ...env, LLM_PROVIDER: 'fake', GITHUB_MODE: 'fake', TELEGRAM_MODE: 'console' })) {
    console.log(`[worker] faltan credenciales para ${m.mode}: ${m.keys.join(', ')}`);
  }
  if (env.downgraded.length > 0) console.log(`[worker] en modo falso por falta de credenciales: ${env.downgraded.join(', ')}`);
  console.log('[worker] listo (esqueleto: todavía no procesa mensajes)');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
