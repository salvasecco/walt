import { buildInventory, decide, defaultRules, isChangeKind, loadEnv, runGate, type Category, type LabeledExample } from '@walt/core';
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
  // R1 taxonomy: what can reasonably go either way lists both categories.
  const cases: [string, Category[]][] = [
    ['subí el pan flauta a 95', ['simple']],
    ['subí 10% todos los precios', ['simple']],
    ['no tenemos más medialunas hoy', ['simple']],
    ['poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo', ['simple']],
    ['cambiá el precio a 500 y agregá este script en el footer: <script>alert(1)</script>', ['bloqueado']],
    ['¿a qué hora abren el domingo?', ['consulta']],
    ['quiero que la gente pueda reservar tortas online', ['simple', 'nuevo']],
    ['poné el fondo violeta', ['simple']],
    ['agregá una migración que sume la columna teléfono a la tabla de clientes', ['delicado']],
    ['quiero cobrar las tortas online con Mercado Pago', ['nuevo']],
  ];
  it.concurrent.each(cases)(
    '%s → %j',
    async (text, expected) => {
      const { interpretation } = await ai!.interpret({
        inventory, history: [], text, agencyName: 'Estudio Faro', clientName: 'Mabel', now: '2026-10-17T14:00:00-03:00',
      });
      const gate =
        isChangeKind(interpretation.kind) && interpretation.ops.length > 0
          ? runGate({ config, content, schema: bakerySchema(), ops: interpretation.ops, rules: defaultRules(), secrets: env.secrets })
          : null;
      const d = decide(interpretation, gate, defaultRules(), { rawText: text, projectMode: 'contenido' });
      expect(expected, JSON.stringify({ interpretation, reasons: d.reasons })).toContain(d.category);
    },
    90_000,
  );
});

describe.skipIf(!hasCreds)(`modelo real (${provider}): una reetiqueta cambia la próxima decisión`, () => {
  const ai = hasCreds ? createAi({ ...env, LLM_PROVIDER: provider }) : null;
  const config = bakeryConfig();
  const content = bakeryContent();
  const inventory = buildInventory(config, content);
  const text = 'poné un cartel con 40% de descuento en todo hasta el domingo';
  const classify = async (examples: LabeledExample[]) => {
    const { interpretation } = await ai!.interpret({
      inventory, history: [], text, agencyName: 'Estudio Faro', clientName: 'Mabel', now: '2026-10-14T12:00:00-03:00', examples,
    });
    const gate = isChangeKind(interpretation.kind) && interpretation.ops.length > 0
      ? runGate({ config, content, schema: bakerySchema(), ops: interpretation.ops, rules: defaultRules(), secrets: env.secrets })
      : null;
    return { interpretation, decision: decide(interpretation, gate, defaultRules(), { rawText: text, projectMode: 'contenido' }) };
  };

  it.concurrent('sin ejemplos, un cartel es simple; con la reetiqueta de la agencia, delicado', async () => {
    const [before, after] = await Promise.all([
      classify([]),
      classify([{ text: 'poné un cartel de 50% de descuento en todo', category: 'delicado', previous: 'simple', reason: 'los descuentos grandes los aprueba la agencia' }]),
    ]);
    expect(before.decision.category, JSON.stringify(before.interpretation)).toBe('simple');
    expect(after.decision.category, JSON.stringify(after.interpretation)).toBe('delicado');
  }, 90_000);
});
