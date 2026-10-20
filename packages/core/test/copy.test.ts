import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, copy, warningsBlock, withBlock } from '../src/copy.ts';
import { CATEGORIES } from '../src/types.ts';

/** Numeric parameters get a number, the rest a placeholder string. */
const NUMERIC = new Set(['monto', 'dias', 'sena', 'n']);
function argsFor(fn: (...a: unknown[]) => string): unknown[] {
  const params = (fn.toString().match(/^\(([^)]*)\)/)?.[1] ?? '').split(',').map((p) => p.split(':')[0]!.trim()).filter(Boolean);
  return params.map((p, i) => (NUMERIC.has(p) ? 3 : `x${i}`));
}

describe('copy', () => {
  it('every text is short, non-empty and never names Walt or Claude (marca blanca)', () => {
    for (const [key, fn] of Object.entries(copy)) {
      const f = fn as (...a: unknown[]) => string;
      const text = f(...argsFor(f));
      expect(text, key).toBeTruthy();
      expect(text.length, key).toBeLessThan(400);
      expect(text, key).not.toMatch(/Claude/);
      expect(text, key).not.toMatch(/(soy|asistente) Walt/i); // "Dale," as "ok" is fine
    }
  });

  it('includes the worker texts moved from apps/worker', () => {
    expect(copy.limitePedidos()).toMatch(/muchos pedidos/);
    expect(copy.agenciaDerivado('Mabel', 'ABC234', 'subo el pan', 'timeout')).toContain('#ABC234');
  });

  it('presupuesto con alcance, plazo, precio y seña', () => {
    expect(copy.presupuestoConSena('Estudio Faro', 'Cobros con Mercado Pago', 450, 10, 'Integración del checkout.', 225)).toBe(
      'Presupuesto de Estudio Faro: Cobros con Mercado Pago.\nIntegración del checkout.\nPlazo: 10 días. Precio: USD 450, con una seña de USD 225 para arrancar.',
    );
    expect(copy.linkSena(225, 'https://pagos.walt.example/sena/q1')).toContain('USD 225');
  });

  it('advertencias para la vista previa', () => {
    expect(warningsBlock([])).toBe('');
    expect(warningsBlock(['Pan de masa madre baja de $220 a $95 (-57%)', ' '])).toBe('Ojo:\n• Pan de masa madre baja de $220 a $95 (-57%)');
    expect(withBlock('¿Así? Subo los panes a $95', warningsBlock(['a']))).toBe('¿Así? Subo los panes a $95\nOjo:\n• a');
    expect(withBlock('hola', '')).toBe('hola');
  });

  it('cada categoría tiene su nombre', () => {
    for (const c of CATEGORIES) expect(CATEGORY_LABELS[c]).toBeTruthy();
  });
});
