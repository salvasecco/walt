import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assistantName,
  buildInventory,
  copy,
  costUsd,
  interpretationJsonSchema,
  parseInterpretation,
  InterpretationSchema,
  inviteToken,
  loadEnv,
  missingCredentials,
  redact,
  shortId,
} from '../src/index.js';
import { bakeryConfig, bakeryContent } from '../src/fixtures.js';

describe('buildInventory', () => {
  it('arma lo que ve la IA', () => {
    const inv = buildInventory(bakeryConfig(), bakeryContent());
    expect(inv.currency).toBe('UYU');
    expect(inv.texts.find((t) => t.path === '/hero/title')).toEqual({
      path: '/hero/title',
      label: 'Título principal',
      value: 'El pan de siempre, recién salido',
    });
    expect(inv.colors.map((c) => c.token)).toEqual(['primary', 'accent', 'background', 'text', 'title', 'button', 'buttonText']);
    expect(inv.texts.find((t) => t.path === '/headings/products/title')?.value).toBe('Nuestros productos');
    expect(inv.products).toHaveLength(9);
    expect(inv.products[0]).toEqual({ id: 'pan-flauta', name: 'Pan flauta', category: 'panes', price: 80, available: true });
    expect(inv.categories).toEqual(['panes', 'facturas', 'tortas', 'dulces', 'bebidas']);
    expect(inv.banner?.enabled).toBe(false);
    expect(inv.hours?.find((h) => h.day === 'dom')).toEqual({ day: 'dom', open: '08:00', close: '13:00' });
    expect(inv.sections).toEqual([
      { section: 'about', visible: true },
      { section: 'hours', visible: true },
      { section: 'contact', visible: true },
    ]);
  });
});

describe('Interpretation', () => {
  it('JSON Schema cerrado para salida estructurada', () => {
    expect(interpretationJsonSchema.type).toBe('object');
    expect(interpretationJsonSchema.additionalProperties).toBe(false);
    expect(JSON.stringify(interpretationJsonSchema)).not.toMatch(/"(minimum|maximum|\$schema)"/);
    expect(interpretationJsonSchema.required).toEqual(
      expect.arrayContaining(['kind', 'summary', 'confidence', 'ops', 'needsCode', 'unexpressedParts']),
    );
  });
  it('la forma plana del cable vuelve a la unión de ops', () => {
    const nulls = Object.fromEntries(
      ['path', 'productId', 'value', 'filter', 'percent', 'amount', 'rounding', 'available', 'token', 'enabled', 'text',
        'discountPercent', 'startsAt', 'endsAt', 'day', 'open', 'close', 'section', 'visible'].map((k) => [k, null]),
    );
    const wire = {
      kind: 'cambio', summary: 'x', confidence: 0.9, needsCode: false, codeInstruction: null, unexpressedParts: [], options: null,
      ops: [
        { ...nulls, type: 'set_price', productId: 'pan-flauta', value: 95 },
        { ...nulls, type: 'set_hours', day: 'dom', open: null, close: null },
        { ...nulls, type: 'adjust_prices', filter: { all: true, category: null, productIds: null }, percent: 10, rounding: 'nearest_5' },
        { ...nulls, type: 'set_banner', enabled: true, text: 'Black Friday', discountPercent: 25, endsAt: '2026-10-18T23:59:00-03:00' },
      ],
    };
    expect(parseInterpretation(wire).ops).toEqual([
      { type: 'set_price', productId: 'pan-flauta', value: 95 },
      { type: 'set_hours', day: 'dom', open: null, close: null },
      { type: 'adjust_prices', filter: { all: true }, percent: 10, rounding: 'nearest_5' },
      { type: 'set_banner', enabled: true, text: 'Black Friday', discountPercent: 25, startsAt: null, endsAt: '2026-10-18T23:59:00-03:00' },
    ]);
  });
  it('valida con zod', () => {
    expect(() =>
      InterpretationSchema.parse({ kind: 'cambio', summary: 'x', confidence: 2, ops: [], needsCode: false, unexpressedParts: [] }),
    ).toThrow();
  });
});

describe('pricing', () => {
  it('costUsd', () => {
    expect(costUsd({ model: 'claude-sonnet-5-5', inputTokens: 1_000_000, outputTokens: 100_000 })).toBe(3);
    expect(costUsd({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 100_000 })).toBeCloseTo(0.08);
    expect(costUsd({ model: 'anthropic.claude-sonnet-5-5', inputTokens: 1_000_000, outputTokens: 0 })).toBe(2);
    expect(costUsd([{ model: 'fake', inputTokens: 5, outputTokens: 5 }])).toBe(0);
    // Unknown model: priced like Opus so it is never under-reported.
    expect(costUsd({ model: 'modelo-raro', inputTokens: 1_000_000, outputTokens: 0 })).toBe(4);
  });
});

describe('ids', () => {
  it('shortId de 6 caracteres sin ambiguos', () => {
    const ids = new Set(Array.from({ length: 500 }, () => shortId()));
    expect(ids.size).toBeGreaterThan(490);
    for (const id of ids) expect(id).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
  });
  it('inviteToken sirve para /start', () => {
    expect(inviteToken()).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });
});

describe('copy', () => {
  it('textos con voseo y marca blanca', () => {
    const a = assistantName('Estudio Faro');
    expect(a).toBe('el asistente de Estudio Faro');
    expect(copy.bienvenida(a)).toMatch(/^¡Hola! Soy el asistente de Estudio Faro\./);
    expect(copy.bienvenida(a)).not.toMatch(/Dale|Claude/);
    expect(copy.presupuesto('Estudio Faro', 'Reservas online', 450, 7)).toBe('Presupuesto de Estudio Faro: Reservas online. USD 450, 7 días.');
    expect(copy.derivado()).toBe('No pude hacerlo solo, se lo pasé a tu equipo. Te escriben en breve.');
  });
});

describe('env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dale-env-'));
  const home = join(dir, 'home.env');
  writeFileSync(
    home,
    ['TELEGRAM_MODE=polling', 'LLM_PROVIDER=anthropic', 'ANTHROPIC_API_KEY=', 'GITHUB_TOKEN=ghp_1234567890abcdef', 'PANEL_PASSWORD=corta', 'DEMO_AGENCY_NAME=Estudio Faro'].join('\n'),
  );
  const local = mkdtempSync(join(tmpdir(), 'dale-local-'));
  writeFileSync(join(local, '.env'), 'DEMO_AGENCY_NAME=Agencia Local\nSCREENSHOTS=on\n');

  it('lee ~/.dale/.env, después .env local, después overrides; vacío es no definido', () => {
    const env = loadEnv({ homeFile: home, cwd: local, overrides: { SCREENSHOTS: 'off', ANTHROPIC_API_KEY: '' } });
    expect(env.DEMO_AGENCY_NAME).toBe('Agencia Local');
    expect(env.SCREENSHOTS).toBe('off');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.MODEL_INTERPRET).toBe('claude-sonnet-5-5');
    expect(env.DEMO_REPO).toBe('salvasecco/dale-demo');
  });

  it('expone los secretos de 8+ caracteres', () => {
    const env = loadEnv({ homeFile: home, cwd: dir, overrides: {} });
    expect(env.secrets).toEqual(['ghp_1234567890abcdef']);
    expect(redact('token ghp_1234567890abcdef ok', env.secrets)).toBe('token [secreto] ok');
  });

  it('modos falsos: sin credenciales baja a fake si se pide', () => {
    const env = loadEnv({ homeFile: home, cwd: dir, overrides: {} });
    expect(missingCredentials(env).map((m) => m.mode).sort()).toEqual(['LLM_PROVIDER', 'TELEGRAM_MODE']);
    const fake = loadEnv({ homeFile: home, cwd: dir, overrides: {}, fallbackToFake: true });
    expect(fake.LLM_PROVIDER).toBe('fake');
    expect(fake.TELEGRAM_MODE).toBe('console');
    expect(fake.downgraded.sort()).toEqual(['LLM_PROVIDER', 'TELEGRAM_MODE']);
  });

  it('por defecto todo en modo falso', () => {
    const env = loadEnv({ homeFile: join(dir, 'no-existe'), cwd: dir, overrides: {} });
    expect(env).toMatchObject({ LLM_PROVIDER: 'fake', GITHUB_MODE: 'fake', TELEGRAM_MODE: 'console', SCREENSHOTS: 'off' });
  });

  it('un valor inválido falla sin mostrar valores', () => {
    expect(() => loadEnv({ homeFile: home, cwd: dir, overrides: { LLM_PROVIDER: 'openai-secreto' } })).toThrow(/LLM_PROVIDER/);
    try {
      loadEnv({ homeFile: home, cwd: dir, overrides: { LLM_PROVIDER: 'openai-secreto' } });
    } catch (e) {
      expect(String(e)).not.toMatch(/openai-secreto|ghp_/);
    }
  });
});
