import { describe, expect, it } from 'vitest';
import { checkText, defaultRules, inventoryPointers, runGate, type Op, type Rules } from '../src/index.js';
import { bakeryConfig, bakeryContent, bakerySchema } from '../src/fixtures.js';

const config = bakeryConfig();
const schema = bakerySchema();
const gate = (ops: Op[], extra: { rules?: Rules; secrets?: string[]; autoPublishedThisMonth?: number } = {}) =>
  runGate({ config, content: bakeryContent(), schema, ops, rules: extra.rules ?? defaultRules(), ...extra });

describe('runGate', () => {
  it('un cambio de precio chico pasa solo, sin advertencias', () => {
    const r = gate([{ type: 'set_price', productId: 'pan-flauta', value: 95 }]);
    expect(r.outcome).toBe('auto');
    expect(r.changes).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it('subir 10% todos los precios pasa solo', () => {
    expect(gate([{ type: 'adjust_prices', filter: { all: true }, percent: 10, rounding: 'nearest_5' }]).outcome).toBe('auto');
  });

  it('el cartel pasa solo con las reglas por defecto (R1)', () => {
    const r = gate([{ type: 'set_banner', enabled: true, text: 'Black Friday: 25% en todo', discountPercent: 25, startsAt: null, endsAt: '2026-10-18T23:59:00-03:00' }]);
    expect(r.outcome).toBe('auto');
    expect(r.warnings).toEqual([]);
  });

  it('con la regla del cartel en agencia, va a la agencia', () => {
    const rules = defaultRules();
    rules.policies.set_banner = 'agencia';
    const r = gate([{ type: 'set_banner', enabled: true, text: 'Black Friday', discountPercent: 25 }], { rules });
    expect(r.outcome).toBe('agencia');
    expect(r.reasons.join(' ')).toMatch(/agencia/);
  });

  it('un descuento grande en el cartel es una advertencia', () => {
    const r = gate([{ type: 'set_banner', enabled: true, text: 'Liquidación', discountPercent: 50 }]);
    expect(r.outcome).toBe('auto');
    expect(r.warnings).toEqual(['El cartel aplica 50% de descuento a todos los precios']);
  });

  it('una política bloqueado bloquea', () => {
    const rules = defaultRules();
    rules.policies.set_color = 'bloqueado';
    expect(gate([{ type: 'set_color', token: 'background', value: '#7C3AED' }], { rules }).outcome).toBe('bloqueado');
  });

  describe('contraste del texto', () => {
    it('un fondo violeta claro pasa solo', () => {
      expect(gate([{ type: 'set_color', token: 'background', value: '#EDE9FE' }]).outcome).toBe('auto');
    });
    it('un fondo violeta pleno deja el texto difícil de leer: advertencia, no agencia', () => {
      const r = gate([{ type: 'set_color', token: 'background', value: '#7C3AED' }]);
      expect(r.outcome).toBe('auto');
      expect(r.warnings.join(' ')).toMatch(/El texto queda con poco contraste sobre el fondo \(\d+,\d:1, se recomienda 4.5:1\)/);
    });
    it('cambiar el color principal no mira el contraste del texto', () => {
      expect(gate([{ type: 'set_color', token: 'primary', value: '#7C3AED' }]).outcome).toBe('auto');
    });
    it('el título naranja legible pasa solo; uno muy claro va a la agencia', () => {
      expect(gate([{ type: 'set_color', token: 'title', value: '#EA580C' }]).warnings).toEqual([]);
      const r = gate([{ type: 'set_color', token: 'title', value: '#FACC15' }]);
      expect(r.outcome).toBe('auto');
      expect(r.warnings.join(' ')).toMatch(/El título queda con poco contraste sobre el fondo/);
    });
    it('un fondo nuevo también se mide contra el título', () => {
      const r = gate([{ type: 'set_color', token: 'background', value: '#1C1917' }]);
      expect(r.warnings.join(' ')).toMatch(/título/);
    });
    it('botones: texto del botón contra el color del botón', () => {
      expect(gate([{ type: 'set_color', token: 'button', value: '#15803D' }]).warnings).toEqual([]);
      const r = gate([{ type: 'set_color', token: 'button', value: '#16A34A' }]);
      expect(r.outcome).toBe('auto');
      expect(r.warnings.join(' ')).toMatch(/texto de los botones/);
      expect(
        gate([
          { type: 'set_color', token: 'button', value: '#FACC15' },
          { type: 'set_color', token: 'buttonText', value: '#1C1917' },
        ]).warnings,
      ).toEqual([]);
    });
    it('el color del texto se puede cambiar y se mide contra el fondo', () => {
      expect(gate([{ type: 'set_color', token: 'text', value: '#292524' }]).warnings).toEqual([]);
      expect(gate([{ type: 'set_color', token: 'text', value: '#FDE68A' }]).warnings).toHaveLength(1);
    });
  });

  describe('textos de las secciones', () => {
    it('títulos y subtítulos de secciones se cambian solos', () => {
      const r = gate([{ type: 'set_text', path: '/headings/hours/subtitle', value: 'Te esperamos' }]);
      expect(r.outcome).toBe('auto');
      expect(r.changes).toEqual([{ pointer: '/headings/hours/subtitle', before: '', after: 'Te esperamos' }]);
    });
  });

  describe('límite de precio: advertencia para la vista previa (R1)', () => {
    it('justo en el límite (30%) no avisa', () => {
      const r = gate([{ type: 'set_price', productId: 'pan-flauta', value: 104 }]);
      expect(r.outcome).toBe('auto');
      expect(r.warnings).toEqual([]);
    });
    it('más del límite pasa igual, con la advertencia con el nombre del producto', () => {
      const r = gate([{ type: 'set_price', productId: 'pan-flauta', value: 105 }]);
      expect(r.outcome).toBe('auto');
      expect(r.warnings).toEqual(['Pan flauta sube de $80 a $105 (+31%)']);
    });
    it('una baja grande también: «la masa madre baja de $220 a $95»', () => {
      const r = gate([{ type: 'set_price', productId: 'pan-masa-madre', value: 95 }]);
      expect(r.outcome).toBe('auto');
      expect(r.warnings).toEqual(['Pan de masa madre baja de $220 a $95 (-57%)']);
    });
    it('el umbral de la config gana sobre el límite viejo', () => {
      const rules = defaultRules();
      rules.config = { ...rules.config!, priceWarnPct: 10 };
      expect(gate([{ type: 'set_price', productId: 'pan-flauta', value: 95 }], { rules }).warnings).toEqual(['Pan flauta sube de $80 a $95 (+19%)']);
    });
    it('muchos precios: las primeras advertencias y un resumen', () => {
      const r = gate([{ type: 'adjust_prices', filter: { all: true }, percent: 500, rounding: 'nearest_5' }]);
      expect(r.outcome).toBe('auto');
      expect(r.warnings).toHaveLength(5);
      expect(r.warnings.at(-1)).toBe('Y 5 precios más cambian más de 30%');
    });
    it('decimales con coma', () => {
      expect(gate([{ type: 'set_price', productId: 'alfajor-maicena', value: 99.5 }]).warnings).toEqual(['Alfajor de maicena sube de $45 a $99,50 (+121%)']);
    });
  });

  describe('cupo del mes', () => {
    const op: Op = { type: 'set_price', productId: 'pan-flauta', value: 95 };
    it('debajo del cupo pasa', () => {
      expect(gate([op], { autoPublishedThisMonth: 199 }).outcome).toBe('auto');
    });
    it('pasado el cupo pide a la agencia', () => {
      const r = gate([op], { autoPublishedThisMonth: 200 });
      expect(r.outcome).toBe('agencia');
      expect(r.reasons.join(' ')).toMatch(/cupo/);
    });
  });

  it('muchas operaciones juntas: advertencia, no agencia', () => {
    const rules = defaultRules();
    rules.limits.maxOpsPerRequest = 2;
    const ops: Op[] = ['pan-flauta', 'baguette', 'cafe'].map((id) => ({ type: 'set_availability', productId: id, available: false }));
    const r = gate(ops, { rules });
    expect(r.outcome).toBe('auto');
    expect(r.warnings).toEqual(['Son 3 cambios juntos: revisalos bien']);
  });

  it('un texto con un secreto se bloquea', () => {
    const secret = 'sk-ant-super-secreto-123';
    const r = gate([{ type: 'set_text', path: '/hero/subtitle', value: `La clave es ${secret}` }], { secrets: [secret] });
    expect(r.outcome).toBe('bloqueado');
    expect(r.reasons.join(' ')).toMatch(/secreto/);
  });

  it('un secreto corto (menos de 8) no cuenta', () => {
    expect(gate([{ type: 'set_text', path: '/hero/subtitle', value: 'abc' }], { secrets: ['abc'] }).outcome).toBe('auto');
  });

  it.each([
    ['<b>hola</b>', /< o >/],
    ['Hola {{user}}', /\{\{/],
    ['javascript:alert(1)', /javascript/],
    ['hola\u0007', /control/],
    ['x'.repeat(301), /300/],
    ['mirá http://example.com', /https/],
  ])('bloquea el texto %j', (value, reason) => {
    const r = gate([{ type: 'set_text', path: '/hero/subtitle', value }]);
    expect(r.outcome).toBe('bloqueado');
    expect(r.reasons.join(' ')).toMatch(reason);
  });

  it('acepta links https', () => {
    expect(gate([{ type: 'set_text', path: '/about/text', value: 'Seguinos en https://instagram.com/mabel' }]).outcome).toBe('auto');
  });

  it('colores tienen que ser #RRGGBB', () => {
    expect(gate([{ type: 'set_color', token: 'primary', value: 'violeta' }]).outcome).toBe('bloqueado');
    expect(gate([{ type: 'set_color', token: 'primary', value: '#7c3aed' }]).outcome).toBe('auto');
  });

  it('precios con más de 2 decimales se bloquean', () => {
    expect(gate([{ type: 'set_price', productId: 'pan-flauta', value: 85.555 }]).outcome).toBe('bloqueado');
    expect(gate([{ type: 'set_price', productId: 'pan-flauta', value: 85.5 }]).outcome).toBe('auto');
  });

  it('un precio en cero se bloquea', () => {
    expect(gate([{ type: 'set_price', productId: 'pan-flauta', value: 0 }]).outcome).toBe('bloqueado');
  });

  it('un producto inexistente se bloquea con la razón', () => {
    const r = gate([{ type: 'set_price', productId: 'empanada', value: 50 }]);
    expect(r.outcome).toBe('bloqueado');
    expect(r.changes).toEqual([]);
    expect(r.reasons[0]).toMatch(/empanada/);
  });

  it('una operación con forma inválida se bloquea', () => {
    expect(gate([{ type: 'borrar_todo' } as unknown as Op]).outcome).toBe('bloqueado');
  });

  it('el contenido nuevo se valida contra el JSON Schema', () => {
    const r = gate([{ type: 'set_banner', enabled: true, text: 'Liquidación', discountPercent: 95 }]);
    expect(r.outcome).toBe('bloqueado');
    expect(r.reasons[0]).toMatch(/esquema/);
  });

  it('todo o nada: una parte bloqueada bloquea todo el pedido', () => {
    const r = gate([
      { type: 'set_price', productId: 'pan-flauta', value: 95 },
      { type: 'set_text', path: '/hero/title', value: '<script>alert(1)</script>' },
    ]);
    expect(r.outcome).toBe('bloqueado');
  });

  it('todo o nada: una parte que pide agencia lleva todo a la agencia', () => {
    const rules = defaultRules();
    rules.policies.toggle_section = 'agencia';
    const r = gate(
      [
        { type: 'set_price', productId: 'pan-flauta', value: 95 },
        { type: 'toggle_section', section: 'about', visible: false },
      ],
      { rules },
    );
    expect(r.outcome).toBe('agencia');
  });

  it('no muta el contenido de entrada', () => {
    const content = bakeryContent();
    const snapshot = structuredClone(content);
    runGate({ config, content, schema, ops: [{ type: 'set_price', productId: 'cafe', value: 95 }], rules: defaultRules() });
    expect(content).toEqual(snapshot);
  });
});

describe('inventoryPointers', () => {
  it('incluye solo lo editable', () => {
    const p = inventoryPointers(config, bakeryContent());
    expect(p.has('/hero/title')).toBe(true);
    expect(p.has('/products/0/price')).toBe(true);
    expect(p.has('/products/0/available')).toBe(true);
    expect(p.has('/products/0/name')).toBe(false);
    expect(p.has('/contact/whatsapp')).toBe(false);
    expect(p.has('/theme/text')).toBe(true);
    expect(p.has('/theme/title')).toBe(true);
    expect(p.has('/headings/products/title')).toBe(true);
    expect(p.has('/brand/name')).toBe(false);
    expect(p.has('/banner/text')).toBe(true);
    expect(p.has('/hours/6/open')).toBe(true);
    expect(p.has('/sections/about')).toBe(true);
  });
});

describe('checkText', () => {
  it('texto normal no tiene razones', () => {
    expect(checkText('Pan de masa madre, todos los días')).toEqual([]);
  });
});

describe('gate con add_product', () => {
  it('un producto nuevo pasa solo por las reglas por defecto', () => {
    expect(gate([{ type: 'add_product', name: 'Brushing', category: 'servicios', price: 2500 }]).outcome).toBe('auto');
  });
  it('un nombre con HTML se bloquea', () => {
    expect(gate([{ type: 'add_product', name: '<img src=x onerror=alert(1)>', category: 'servicios', price: 10 }]).outcome).toBe('bloqueado');
  });
});
