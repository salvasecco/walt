import { describe, expect, it } from 'vitest';
import {
  ALWAYS_DELICATE_GLOBS,
  createFakePaymentLinks,
  DEFAULT_RULES,
  delicatePathReason,
  delicatePaths,
  depositAmount,
  emptyExampleSource,
  exampleSourceOf,
  globToRegExp,
  matchGlob,
  parseRulesConfig,
  priceWarnPct,
  RULE_TEMPLATE_IDS,
  RULE_TEMPLATES,
  ruleTemplate,
  rulesConfig,
  RulesConfigSchema,
  rulesFromRow,
  RulesSchema,
} from '../src/index.js';

describe('globs', () => {
  it.each([
    ['supabase/migrations/0004_x.sql', '**/migrations/**', true],
    ['migrations/x.sql', '**/migrations/**', true],
    ['db/x.sql', '**/*.sql', true],
    ['.env', '.env*', true],
    ['.env.local', '.env*', true],
    ['apps/web/.env.production', '**/.env*', true],
    ['package.json', '**/package.json', true],
    ['apps/web/package.json', '**/package.json', true],
    ['.github/workflows/ci.yml', '**/.github/**', true],
    ['app/api/reservas/route.ts', 'app/api/**', true],
    ['src/app/api/x.ts', 'app/api/**', false],
    ['middleware.ts', '**/middleware.*', true],
    ['src/middleware.ts', '**/middleware.*', true],
    ['components/Footer.tsx', '**/auth/**', false],
    ['app/(auth)/login/page.tsx', '**/auth/**', false],
    ['lib/auth/session.ts', '**/auth/**', true],
    ['App/API/x.ts', 'app/api/**', true],
    ['./app/page.tsx', 'app/*.tsx', true],
    ['app/a/page.tsx', 'app/*.tsx', false],
    ['a.ts', '*.{ts,tsx}', true],
    ['a.js', '*.{ts,tsx}', false],
    ['v1.txt', 'v[0-9].txt', true],
  ])('%s ~ %s → %s', (path, glob, expected) => {
    expect(matchGlob(path, glob)).toBe(expected);
  });

  it('escapa los caracteres de regex', () => {
    expect(globToRegExp('a+b(c).ts').test('a+b(c).ts')).toBe(true);
    expect(matchGlob('axb.ts', 'a.b.ts')).toBe(false);
  });
});

describe('zonas delicadas del diff', () => {
  const cfg = ruleTemplate('nextjs-supabase').config;

  it('un cambio de frontend no toca nada delicado', () => {
    expect(delicatePaths(['components/Footer.tsx', 'app/page.tsx', 'public/torta.jpg'], cfg)).toEqual([]);
  });

  it('migraciones, .env, manifiestos, CI y auth son delicados siempre (base)', () => {
    const found = delicatePaths(
      ['supabase/migrations/0004_reservas.sql', '.env.local', 'package.json', '.github/workflows/ci.yml', 'lib/auth/session.ts', 'middleware.ts'],
      { delicateGlobs: [], protectedGlobs: [], simpleGlobs: ['**'] },
    );
    expect(found.map((f) => f.zone)).toEqual(['base', 'base', 'base', 'base', 'base', 'base']);
    expect(delicatePathReason(found[0]!)).toBe('Toca supabase/migrations/0004_reservas.sql: la base de datos');
    expect(delicatePathReason(found[1]!)).toMatch(/secretos/);
    expect(delicatePathReason(found[2]!)).toMatch(/dependencias/);
    expect(delicatePathReason(found[3]!)).toMatch(/CI/);
    expect(delicatePathReason(found[4]!)).toMatch(/login/);
  });

  it('las rutas de API son delicadas en la plantilla de Next.js, salvo la excepción simple de la agencia', () => {
    expect(delicatePaths(['app/api/reservas/route.ts'], cfg)).toEqual([{ path: 'app/api/reservas/route.ts', glob: 'app/api/**', zone: 'agencia' }]);
    const withException = { ...cfg, simpleGlobs: ['app/api/contacto/**'] };
    expect(delicatePaths(['app/api/contacto/route.ts'], withException)).toEqual([]);
    expect(delicatePaths(['app/api/reservas/route.ts'], withException)).toHaveLength(1);
  });

  it('lo protegido por la agencia gana', () => {
    const found = delicatePaths(['components/Precios.tsx'], { ...cfg, protectedGlobs: ['components/Precios.tsx'] });
    expect(found).toEqual([{ path: 'components/Precios.tsx', glob: 'components/Precios.tsx', zone: 'protegido' }]);
    expect(delicatePathReason(found[0]!)).toMatch(/protegido/);
  });
});

describe('reglas: RulesConfig y plantillas', () => {
  it('las reglas por defecto pasan el cartel y las secciones a auto y traen la config genérica', () => {
    expect(DEFAULT_RULES.policies.set_banner).toBe('auto');
    expect(DEFAULT_RULES.policies.toggle_section).toBe('auto');
    expect(RulesSchema.parse(DEFAULT_RULES)).toEqual(DEFAULT_RULES);
    expect(DEFAULT_RULES.config?.template).toBe('generic');
    expect(DEFAULT_RULES.policy_text).toBe('');
  });

  it('cada plantilla valida, trae globs delicados de backend y una política de ejemplo', () => {
    expect(RULE_TEMPLATE_IDS).toEqual(['nextjs-supabase', 'wordpress', 'shopify', 'tiendanube', 'generic']);
    for (const id of RULE_TEMPLATE_IDS) {
      const t = RULE_TEMPLATES[id];
      expect(RulesConfigSchema.parse(t.config)).toEqual(t.config);
      expect(t.config.template).toBe(id);
      expect(t.config.delicateGlobs.length).toBeGreaterThan(3);
      expect(t.config.alwaysNew.length).toBeGreaterThan(0);
      expect(t.policy_text).toMatch(/simple/);
      expect(t.policy_text).toMatch(/delicado/);
      expect(t.policy_text).toMatch(/algo nuevo/);
    }
    expect(RULE_TEMPLATES['nextjs-supabase'].config.delicateGlobs).toEqual(expect.arrayContaining(['supabase/**', 'app/api/**', 'pages/api/**']));
    expect(ALWAYS_DELICATE_GLOBS).toEqual(expect.arrayContaining(['**/migrations/**', '.env*', '**/package.json', '**/.github/**', '**/auth/**', '**/middleware.*']));
  });

  it('ruleTemplate devuelve una copia y cae en genérica con un id desconocido', () => {
    const a = ruleTemplate('wordpress');
    a.config.delicateGlobs.push('x');
    expect(RULE_TEMPLATES.wordpress.config.delicateGlobs).not.toContain('x');
    expect(ruleTemplate('otro').id).toBe('generic');
  });

  it('parseRulesConfig nunca tira: {} es la genérica y toma cada campo válido', () => {
    expect(parseRulesConfig({})).toEqual(RULE_TEMPLATES.generic.config);
    expect(parseRulesConfig(null)).toEqual(RULE_TEMPLATES.generic.config);
    expect(parseRulesConfig('basura')).toEqual(RULE_TEMPLATES.generic.config);
    const c = parseRulesConfig({ template: 'nextjs-supabase', simpleGlobs: ['app/api/contacto/**'], priceWarnPct: 50, delicateGlobs: 'no es lista' });
    expect(c.template).toBe('nextjs-supabase');
    expect(c.simpleGlobs).toEqual(['app/api/contacto/**']);
    expect(c.priceWarnPct).toBe(50);
    expect(c.delicateGlobs).toEqual(RULE_TEMPLATES['nextjs-supabase'].config.delicateGlobs);
    // A template this version doesn't know keeps its name and starts from the generic globs.
    const unknown = parseRulesConfig({ template: 'magento' });
    expect(unknown.template).toBe('magento');
    expect(unknown.delicateGlobs).toEqual(RULE_TEMPLATES.generic.config.delicateGlobs);
  });

  it('rulesFromRow completa lo que falta en filas de antes de R1', () => {
    const r = rulesFromRow({ policies: { set_price: 'auto' }, limits: { maxPriceChangePct: 20, monthlyQuota: 5, minConfidence: 0.5, maxOpsPerRequest: 10 } });
    expect(r.policies).toEqual({ set_price: 'auto' });
    expect(r.limits.maxPriceChangePct).toBe(20);
    expect(r.policy_text).toBe('');
    expect(r.config?.template).toBe('generic');
    const bad = rulesFromRow({ policies: 'x', limits: null, policy_text: 'Lo de pagos es delicado', config: { template: 'shopify' } });
    expect(bad.policies).toEqual(DEFAULT_RULES.policies);
    expect(bad.policy_text).toBe('Lo de pagos es delicado');
    expect(bad.config?.template).toBe('shopify');
  });

  it('el umbral de advertencia de precio: priceWarnPct, o el límite viejo', () => {
    expect(priceWarnPct(DEFAULT_RULES)).toBe(30);
    expect(priceWarnPct({ ...DEFAULT_RULES, config: { ...DEFAULT_RULES.config!, priceWarnPct: 15 } })).toBe(15);
    expect(rulesConfig({}).template).toBe('generic');
  });
});

describe('pagos: link de la seña en modo prueba', () => {
  it('seña del 50% por defecto, entera', () => {
    expect(depositAmount(450)).toBe(225);
    expect(depositAmount(455)).toBe(228);
    expect(depositAmount(300, 30)).toBe(90);
    expect(depositAmount(0)).toBe(0);
    expect(depositAmount(1, 10)).toBe(1);
  });

  it('el proveedor falso arma un link con el monto que no cobra nada', async () => {
    const pay = createFakePaymentLinks();
    expect(pay.mode).toBe('prueba');
    const link = await pay.createDepositLink({ quoteId: 'q-1', shortId: 'ABC234', title: 'Cobros online', amountUsd: 225 });
    expect(link).toMatchObject({ amountUsd: 225, provider: 'prueba', mode: 'prueba' });
    const u = new URL(link.url);
    expect(u.hostname).toBe('pagos.walt.example');
    expect(u.searchParams.get('monto')).toBe('225');
    expect(u.searchParams.get('modo')).toBe('prueba');
    expect(u.searchParams.get('pedido')).toBe('ABC234');
  });
});

describe('ejemplos reetiquetados', () => {
  it('la fuente vacía no devuelve nada; la store se usa cuando implementa la interfaz', async () => {
    expect(await emptyExampleSource.similarExamples({ factoryId: 'f', text: 'x', limit: 5 })).toEqual([]);
    expect(exampleSourceOf({})).toBe(emptyExampleSource);
    expect(exampleSourceOf(null)).toBe(emptyExampleSource);
    const store = { similarExamples: async () => [{ text: 'agregá un login', category: 'delicado' as const }] };
    expect(exampleSourceOf(store)).toBe(store);
  });

  it('una store con las filas de similar_labeled_requests (0004) también sirve, con las categorías normalizadas', async () => {
    const calls: unknown[][] = [];
    const store = {
      similarLabeledRequests: async (...args: unknown[]) => {
        calls.push(args);
        return [
          { raw_text: 'agregá un login', from_category: 'permitido', to_category: 'delicado', reason: 'toca auth' },
          { raw_text: '', from_category: null, to_category: 'simple', reason: null },
          { raw_text: 'algo raro', from_category: null, to_category: 'otra_cosa', reason: null },
        ];
      },
    };
    const examples = await exampleSourceOf(store).similarExamples({ factoryId: 'f1', text: 'quiero login', limit: 3 });
    expect(calls).toEqual([['f1', 'quiero login', 3]]);
    expect(examples).toEqual([{ text: 'agregá un login', category: 'delicado', previous: 'simple', reason: 'toca auth' }]);
  });
});
