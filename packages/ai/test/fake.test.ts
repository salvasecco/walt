import { buildInventory, decide, defaultRules, runGate, type Category } from '@dale/core';
import { bakeryConfig, bakeryContent, bakerySchema } from '@dale/core/fixtures';
import { describe, expect, it } from 'vitest';
import { createAi, nextWeekdayEnd } from '../src/index.js';

const ai = createAi({ LLM_PROVIDER: 'fake' });
const config = bakeryConfig();
const content = bakeryContent();
const inventory = buildInventory(config, content);
const NOW = '2026-10-17T14:00:00-03:00'; // sábado

async function run(text: string) {
  const { interpretation } = await ai.interpret({ inventory, history: [], text, agencyName: 'Estudio Faro', clientName: 'Mabel', now: NOW });
  const gate =
    interpretation.kind === 'cambio' && interpretation.ops.length > 0
      ? runGate({ config, content, schema: bakerySchema(), ops: interpretation.ops, rules: defaultRules() })
      : null;
  return { interpretation, gate, decision: decide(interpretation, gate, defaultRules(), { rawText: text, projectMode: 'contenido' }) };
}

describe('proveedor falso: casos de la demo (SPEC §1)', () => {
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
  it.each(cases)('%s → %s', async (text, expected) => {
    expect((await run(text)).decision.category).toBe(expected);
  });

  it('el pan flauta queda en 95', async () => {
    const r = await run('subí el pan flauta a 95');
    expect(r.gate?.changes).toEqual([{ pointer: '/products/0/price', before: 80, after: 95 }]);
  });

  it('el cartel empieza ya y se vence el domingo', async () => {
    const r = await run('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    expect(r.interpretation.ops[0]).toMatchObject({ type: 'set_banner', enabled: true, discountPercent: 25, startsAt: null, endsAt: '2026-10-18T23:59:00-03:00' });
    expect(r.decision.lane).toBe('contenido');
  });

  it('el fondo violeta es un color válido', async () => {
    const r = await run('poné el fondo violeta');
    expect(r.gate?.changes[0]).toMatchObject({ pointer: '/theme/background', after: '#EDE9FE' });
  });

  it('responde la consulta con lo que dice la web', async () => {
    const { answer } = await ai.answerConsulta({ inventory, text: '¿a qué hora abren el domingo?' });
    expect(answer).toBe('El domingo abrimos de 08:00 a 13:00.');
  });

  it('arma un borrador de presupuesto', async () => {
    const { quote } = await ai.draftQuote({ text: 'reservar tortas online', pastQuotes: [] });
    expect(quote.amountUsd).toBeGreaterThan(0);
    expect(quote.etaDays).toBeGreaterThan(0);
  });
});

describe('nextWeekdayEnd', () => {
  it('el domingo siguiente en Montevideo', () => {
    expect(nextWeekdayEnd('2026-10-17T14:00:00-03:00', 'domingo')).toBe('2026-10-18T23:59:00-03:00');
    expect(nextWeekdayEnd('2026-10-18T10:00:00-03:00', 'viernes')).toBe('2026-10-23T23:59:00-03:00');
  });
});

describe('proveedor falso: colores del contrato ampliado', () => {
  it('"cambiá el título a naranja" sale por contenido con el token title', async () => {
    const r = await run('cambiá el título a naranja');
    expect(r.interpretation.ops).toEqual([{ type: 'set_color', token: 'title', value: '#EA580C' }]);
    expect(r.decision.category).toBe('permitido');
  });
  it('"poné los botones en verde" usa un verde que se lee con texto blanco', async () => {
    const r = await run('poné los botones en verde');
    expect(r.interpretation.ops).toEqual([{ type: 'set_color', token: 'button', value: '#15803D' }]);
    expect(r.decision.category).toBe('permitido');
  });
  it('botones amarillos: también cambia el texto del botón a oscuro', async () => {
    const r = await run('poné los botones en amarillo');
    expect(r.interpretation.ops.map((o) => (o as { token: string }).token)).toEqual(['button', 'buttonText']);
    expect(r.decision.category).toBe('permitido');
  });
});
