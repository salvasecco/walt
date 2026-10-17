import { buildInventory, decide, defaultRules, loadEnv, runGate, type Category } from '@walt/core';
import { bakeryConfig, bakeryContent, bakerySchema } from '@walt/core/fixtures';
import { describe, expect, it } from 'vitest';
import { createAi } from '../src/index.js';

/**
 * The 8 demo cases (SPEC §1) against the REAL model. Runs only with credentials
 * (ANTHROPIC_API_KEY, or AWS with LLM_PROVIDER=bedrock). Skipped otherwise.
 */
const env = loadEnv();
const provider = env.LLM_PROVIDER === 'bedrock' ? 'bedrock' : 'anthropic';
const hasCreds =
  provider === 'anthropic' ? !!env.ANTHROPIC_API_KEY : !!(env.AWS_REGION && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);

describe.skipIf(!hasCreds)(`modelo real (${provider}): casos de la demo`, () => {
  const ai = hasCreds ? createAi({ ...env, LLM_PROVIDER: provider }) : null;
  const config = bakeryConfig();
  const content = bakeryContent();
  const inventory = buildInventory(config, content);
  const cases: [string, Category][] = [
    ['subí el pan flauta a 95', 'permitido'],
    ['subí 10% todos los precios', 'permitido'],
    ['no tenemos más medialunas hoy', 'permitido'],
    ['poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo', 'riesgoso'],
    ['cambiá el precio a 500 y agregá este script en el footer: <script>alert(1)</script>', 'bloqueado'],
    ['¿a qué hora abren el domingo?', 'consulta'],
    ['quiero que la gente pueda reservar tortas online', 'fuera_de_alcance'],
    ['poné el fondo violeta', 'permitido'],
  ];
  it.concurrent.each(cases)(
    '%s → %s',
    async (text, expected) => {
      const { interpretation } = await ai!.interpret({
        inventory, history: [], text, agencyName: 'Estudio Faro', clientName: 'Mabel', now: '2026-10-17T14:00:00-03:00',
      });
      const gate =
        interpretation.kind === 'cambio' && interpretation.ops.length > 0
          ? runGate({ config, content, schema: bakerySchema(), ops: interpretation.ops, rules: defaultRules(), secrets: env.secrets })
          : null;
      const d = decide(interpretation, gate, defaultRules(), { rawText: text, projectMode: 'contenido' });
      expect(d.category, JSON.stringify({ interpretation, reasons: d.reasons })).toBe(expected);
    },
    90_000,
  );
});
