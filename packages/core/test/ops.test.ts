import { describe, expect, it } from 'vitest';
import { applyOps, OpValidationError, revertChanges, roundPrice, type Op } from '../src/index.js';
import { bakeryConfig, bakeryContent } from '../src/fixtures.js';

const config = bakeryConfig();
const priceOf = (c: unknown, id: string) => (c as ReturnType<typeof bakeryContent>).products.find((p) => p.id === id)!.price;

describe('roundPrice', () => {
  it.each([
    [88.000000001, 'none', 88],
    [82.555, 'none', 82.56],
    [82.5, 'integer', 83],
    [82.4, 'integer', 82],
    [82.5, 'nearest_5', 85],
    [82.4, 'nearest_5', 80],
    [49.5, 'nearest_5', 50],
    [286, 'nearest_5', 285],
    [264, 'nearest_5', 265],
    [242, 'nearest_10', 240],
    [245, 'nearest_10', 250],
  ] as const)('%s con %s da %s', (value, rounding, expected) => {
    expect(roundPrice(value, rounding)).toBe(expected);
  });
});

describe('applyOps', () => {
  it('set_price cambia un precio y no muta la entrada', () => {
    const content = bakeryContent();
    const copy = structuredClone(content);
    const r = applyOps(content, [{ type: 'set_price', productId: 'pan-flauta', value: 95 }], config);
    expect(priceOf(r.content, 'pan-flauta')).toBe(95);
    expect(r.changes).toEqual([{ pointer: '/products/0/price', before: 80, after: 95 }]);
    expect(content).toEqual(copy);
  });

  it('set_text cambia un texto del config', () => {
    const r = applyOps(bakeryContent(), [{ type: 'set_text', path: '/hero/title', value: 'Pan caliente' }], config);
    expect(r.changes).toEqual([{ pointer: '/hero/title', before: 'El pan de siempre, recién salido', after: 'Pan caliente' }]);
  });

  it('set_text fuera del config es un error', () => {
    expect(() => applyOps(bakeryContent(), [{ type: 'set_text', path: '/contact/whatsapp', value: 'x' }], config)).toThrow(
      OpValidationError,
    );
  });

  it('adjust_prices 10% a todos con múltiplos de 5', () => {
    const r = applyOps(
      bakeryContent(),
      [{ type: 'adjust_prices', filter: { all: true }, percent: 10, rounding: 'nearest_5' }],
      config,
    );
    const prices = (r.content as ReturnType<typeof bakeryContent>).products.map((p) => p.price);
    expect(prices).toEqual([90, 240, 100, 285, 265, 85, 200, 50, 100]);
    expect(prices.every((p) => p % 5 === 0)).toBe(true);
    expect(r.changes).toHaveLength(9);
  });

  it('adjust_prices por categoría y por monto', () => {
    const r = applyOps(
      bakeryContent(),
      [{ type: 'adjust_prices', filter: { category: 'facturas' }, amount: 10, rounding: 'none' }],
      config,
    );
    expect(r.changes.map((c) => c.after)).toEqual([270, 250, 85]);
  });

  it('adjust_prices por ids con redondeo entero', () => {
    const r = applyOps(
      bakeryContent(),
      [{ type: 'adjust_prices', filter: { productIds: ['croissant'] }, percent: 7, rounding: 'integer' }],
      config,
    );
    expect(priceOf(r.content, 'croissant')).toBe(80);
  });

  it('adjust_prices exige percent o amount, nunca los dos', () => {
    const both = { type: 'adjust_prices', filter: { all: true }, percent: 10, amount: 5, rounding: 'none' } as Op;
    const none = { type: 'adjust_prices', filter: { all: true }, rounding: 'none' } as Op;
    expect(() => applyOps(bakeryContent(), [both], config)).toThrow(OpValidationError);
    expect(() => applyOps(bakeryContent(), [none], config)).toThrow(OpValidationError);
  });

  it('adjust_prices nunca deja un precio en cero o negativo', () => {
    expect(() =>
      applyOps(bakeryContent(), [{ type: 'adjust_prices', filter: { all: true }, percent: -100, rounding: 'none' }], config),
    ).toThrow(/quedaría/);
    expect(() =>
      applyOps(bakeryContent(), [{ type: 'adjust_prices', filter: { productIds: ['alfajor-maicena'] }, amount: -44, rounding: 'nearest_5' }], config),
    ).toThrow(OpValidationError);
  });

  it('categoría o producto inexistente es un error, nunca se ignora', () => {
    expect(() =>
      applyOps(bakeryContent(), [{ type: 'adjust_prices', filter: { category: 'pizzas' }, percent: 5, rounding: 'none' }], config),
    ).toThrow(/pizzas/);
    expect(() => applyOps(bakeryContent(), [{ type: 'set_price', productId: 'empanada', value: 10 }], config)).toThrow(/empanada/);
  });

  it('set_availability', () => {
    const r = applyOps(bakeryContent(), [{ type: 'set_availability', productId: 'medialunas', available: false }], config);
    expect(r.changes).toEqual([{ pointer: '/products/3/available', before: true, after: false }]);
  });

  it('set_color por token', () => {
    const r = applyOps(bakeryContent(), [{ type: 'set_color', token: 'background', value: '#7C3AED' }], config);
    expect(r.changes).toEqual([{ pointer: '/theme/background', before: '#FFF7ED', after: '#7C3AED' }]);
    expect(() => applyOps(bakeryContent(), [{ type: 'set_color', token: 'link', value: '#000000' }], config)).toThrow(/link/);
  });

  it('set_banner solo cambia los campos que vienen', () => {
    const r = applyOps(
      bakeryContent(),
      [{ type: 'set_banner', enabled: true, text: 'Black Friday', discountPercent: 25, endsAt: '2026-10-18T23:59:00-03:00' }],
      config,
    );
    expect(r.changes.map((c) => c.pointer).sort()).toEqual(['/banner/discountPercent', '/banner/enabled', '/banner/endsAt', '/banner/text']);
  });

  it('set_hours y cierre del día', () => {
    const r = applyOps(bakeryContent(), [{ type: 'set_hours', day: 'dom', open: null, close: null }], config);
    expect(r.changes).toEqual([
      { pointer: '/hours/6/open', before: '08:00', after: null },
      { pointer: '/hours/6/close', before: '13:00', after: null },
    ]);
    expect(() => applyOps(bakeryContent(), [{ type: 'set_hours', day: 'dom', open: '9:00', close: '13:00' }], config)).toThrow();
    expect(() => applyOps(bakeryContent(), [{ type: 'set_hours', day: 'dom', open: '09:00', close: null }], config)).toThrow();
  });

  it('toggle_section', () => {
    const r = applyOps(bakeryContent(), [{ type: 'toggle_section', section: 'about', visible: false }], config);
    expect(r.changes).toEqual([{ pointer: '/sections/about', before: true, after: false }]);
    expect(() => applyOps(bakeryContent(), [{ type: 'toggle_section', section: 'blog', visible: true }], config)).toThrow(/blog/);
  });

  it('dos operaciones sobre el mismo valor dejan un solo cambio, y si vuelve al original no hay cambio', () => {
    const r = applyOps(
      bakeryContent(),
      [
        { type: 'set_price', productId: 'cafe', value: 100 },
        { type: 'set_price', productId: 'cafe', value: 110 },
      ],
      config,
    );
    expect(r.changes).toEqual([{ pointer: '/products/8/price', before: 90, after: 110 }]);
    const back = applyOps(
      bakeryContent(),
      [
        { type: 'set_price', productId: 'cafe', value: 100 },
        { type: 'set_price', productId: 'cafe', value: 90 },
      ],
      config,
    );
    expect(back.changes).toEqual([]);
  });
});

describe('revertChanges', () => {
  it('vuelve a como estaba', () => {
    const original = bakeryContent();
    const r = applyOps(original, [{ type: 'adjust_prices', filter: { all: true }, percent: 10, rounding: 'nearest_5' }], config);
    const back = revertChanges(r.content, r.changes);
    expect('conflict' in back).toBe(false);
    if (!('conflict' in back)) {
      expect(back.content).toEqual(original);
      expect(back.changes[0]).toEqual({ pointer: r.changes[0]!.pointer, before: r.changes[0]!.after, after: r.changes[0]!.before });
    }
  });

  it('con conflicto devuelve los punteros y no aplica nada (todo o nada)', () => {
    const r = applyOps(
      bakeryContent(),
      [
        { type: 'set_price', productId: 'pan-flauta', value: 95 },
        { type: 'set_price', productId: 'cafe', value: 100 },
      ],
      config,
    );
    // Someone changed the café afterwards.
    const later = applyOps(r.content, [{ type: 'set_price', productId: 'cafe', value: 120 }], config).content;
    const snapshot = structuredClone(later);
    const back = revertChanges(later, r.changes);
    expect(back).toEqual({ conflict: ['/products/8/price'] });
    expect(later).toEqual(snapshot);
  });
});
