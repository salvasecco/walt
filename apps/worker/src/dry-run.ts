import { createAi } from '@dale/ai';
import { buildInventory, decide, DEFAULT_RULES, loadEnv, runGate, type GateResult } from '@dale/core';
import { bakeryConfig, bakeryContent, bakerySchema } from '@dale/core/fixtures';

/**
 * Minimal dry-run without Telegram nor DB: interpret → gate → decide over the bakery fixture.
 * 01-worker replaces it with the real pipeline on the console channel (SPEC §9).
 */
async function main() {
  const text = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim();
  if (!text) {
    console.error('Uso: pnpm dry-run "<pedido>"');
    process.exit(1);
  }
  const env = loadEnv({ fallbackToFake: true });
  const ai = createAi(env);
  const config = bakeryConfig();
  const content = bakeryContent();
  const inventory = buildInventory(config, content);

  let t = performance.now();
  const lap = () => {
    const ms = Math.round(performance.now() - t);
    t = performance.now();
    return `${ms} ms`;
  };
  const { interpretation } = await ai.interpret({
    inventory,
    history: [],
    text,
    agencyName: env.DEMO_AGENCY_NAME,
    clientName: 'Panadería Mabel',
    now: new Date().toISOString(),
  });
  console.log(`interpretado (${ai.name}, ${lap()}):`, JSON.stringify(interpretation, null, 2));
  let gate: GateResult | null = null;
  if (interpretation.kind === 'cambio' && interpretation.ops.length > 0) {
    gate = runGate({ config, content, schema: bakerySchema(), ops: interpretation.ops, rules: DEFAULT_RULES, secrets: env.secrets });
    console.log(`gate (${lap()}):`, gate.outcome, gate.reasons, gate.changes);
  }
  const decision = decide(interpretation, gate, DEFAULT_RULES, { rawText: text, projectMode: 'contenido' });
  console.log(`decidido (${lap()}):`, decision);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
