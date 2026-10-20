import { defaultRules, type Interpretation } from '@walt/core';
import { bakeryConfig, bakeryContent, bakerySchema } from '@walt/core/fixtures';
import { describe, expect, it } from 'vitest';
import { createFakeProvider, simulateRequest, type AiProvider, type InterpretInput } from '../src/index.js';

const project = { config: bakeryConfig(), content: bakeryContent(), schema: bakerySchema() };
const base = { agencyName: 'Estudio Faro', clientName: 'Mabel', now: '2026-10-14T12:00:00-03:00' };

/** The fake provider, or a fixed interpretation, recording what the model received. */
function provider(fixed?: Partial<Interpretation>): AiProvider & { inputs: InterpretInput[] } {
  const fake = createFakeProvider();
  const inputs: InterpretInput[] = [];
  return {
    ...fake,
    inputs,
    async interpret(input) {
      inputs.push(input);
      const r = await fake.interpret(input);
      return fixed ? { ...r, interpretation: { ...r.interpretation, kind: 'simple', confidence: 0.9, ops: [], needsCode: false, unexpressedParts: [], ...fixed } } : r;
    },
  };
}

describe('simulateRequest: cómo lo clasificaría y por qué, sin efectos', () => {
  it('un cambio de precio grande es simple, con la advertencia', async () => {
    const ai = provider({ ops: [{ type: 'set_price', productId: 'pan-masa-madre', value: 95 }] });
    const r = await simulateRequest({ ...base, ai, text: 'la masa madre a 95', rules: defaultRules(), content: project });
    expect(r.decision).toMatchObject({ category: 'simple', lane: 'contenido', warnings: ['Pan de masa madre baja de $220 a $95 (-57%)'] });
    expect(r.gate?.changes).toEqual([{ pointer: '/products/1/price', before: 220, after: 95 }]);
  });

  it('la política y "siempre algo nuevo" de las reglas llegan al modelo', async () => {
    const ai = provider();
    const rules = defaultRules();
    rules.policy_text = 'Lo de los precios mayoristas es delicado';
    rules.config = { ...rules.config!, alwaysNew: ['integrar Mercado Pago'] };
    await simulateRequest({ ...base, ai, text: 'hola', rules, content: project, examples: [{ text: 'agregá un login', category: 'delicado' }] });
    expect(ai.inputs[0]).toMatchObject({
      policyText: 'Lo de los precios mayoristas es delicado',
      alwaysNew: ['integrar Mercado Pago'],
      examples: [{ text: 'agregá un login', category: 'delicado' }],
    });
  });

  it('dos lecturas que pasan el gate van como opciones', async () => {
    const ai = provider({
      options: [
        { label: 'Crema tostado', ops: [{ type: 'set_color', token: 'background', value: '#F5E6D3' }] },
        { label: 'Gris piedra', ops: [{ type: 'set_color', token: 'background', value: '#E7E5E4' }] },
      ],
    });
    const r = await simulateRequest({ ...base, ai, text: 'poné el fondo más oscuro', rules: defaultRules(), content: project });
    expect(r.decision).toMatchObject({ category: 'simple', lane: 'contenido' });
    expect(r.options?.map((o) => o.label)).toEqual(['Crema tostado', 'Gris piedra']);
  });

  it('en modo código, con las rutas que tocaría, muestra lo que diría la doble clasificación', async () => {
    const ai = provider({ needsCode: true, codeInstruction: 'Agregar un aviso', unexpressedParts: ['aviso'] });
    const r = await simulateRequest({ ...base, ai, text: 'agregá un aviso', rules: defaultRules(), paths: ['components/Aviso.tsx', 'supabase/migrations/0009.sql'] });
    expect(r.decision).toMatchObject({ category: 'simple', lane: 'codigo' });
    expect(r.diff).toEqual({ category: 'delicado', reasons: ['Toca supabase/migrations/0009.sql: la base de datos'] });
    expect(ai.inputs[0]!.inventory.products).toEqual([]);
  });

  it('el pedido con código en el texto queda bloqueado', async () => {
    const r = await simulateRequest({ ...base, ai: provider(), text: 'poné <script>alert(1)</script>', rules: defaultRules(), content: project });
    expect(r.decision.category).toBe('bloqueado');
  });
});
