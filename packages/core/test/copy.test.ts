import { describe, expect, it } from 'vitest';
import { copy } from '../src/copy.ts';

describe('copy', () => {
  it('every text is short, non-empty and never names Walt or Claude (marca blanca)', () => {
    for (const [key, fn] of Object.entries(copy)) {
      const args = Array.from({ length: (fn as (...a: unknown[]) => string).length }, (_, i) => (i === 2 ? 3 : `x${i}`));
      const text = (fn as (...a: unknown[]) => string)(...args);
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
});
