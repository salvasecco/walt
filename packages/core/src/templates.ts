import type { RulesConfig } from './rules.ts';

/**
 * Stack templates to start a project's rules from (Reglas screen in the panel): delicate globs,
 * things that are always "algo nuevo" and an example policy in natural language. The agency edits
 * them freely; `ALWAYS_DELICATE_GLOBS` applies on top and cannot be turned off.
 */

export const RULE_TEMPLATE_IDS = ['nextjs-supabase', 'wordpress', 'shopify', 'tiendanube', 'generic'] as const;
export type RuleTemplateId = (typeof RULE_TEMPLATE_IDS)[number];

export function isRuleTemplateId(value: unknown): value is RuleTemplateId {
  return typeof value === 'string' && (RULE_TEMPLATE_IDS as readonly string[]).includes(value);
}

/**
 * The floor of the double classification: a diff that touches any of these is `delicado`, whatever the
 * template, the agency's globs or its simple globs say. Database, secrets, dependency manifests, CI,
 * infrastructure, auth and request interception (brief §1: "migraciones, .env, package.json y otros
 * manifiestos, archivos de auth").
 */
export const ALWAYS_DELICATE_GLOBS: readonly string[] = [
  // Database: schema, migrations, seeds, raw SQL.
  '**/migrations/**',
  '**/migration/**',
  '**/*.sql',
  '**/schema.prisma',
  '**/prisma/**',
  '**/drizzle/**',
  '**/seeds/**',
  '**/seed.*',
  // Secrets and environment.
  '.env*',
  '**/.env*',
  '**/*.pem',
  '**/*.key',
  '**/secrets/**',
  '**/credentials*',
  // Dependency manifests and lockfiles.
  '**/package.json',
  '**/package-lock.json',
  '**/npm-shrinkwrap.json',
  '**/pnpm-lock.yaml',
  '**/pnpm-workspace.yaml',
  '**/yarn.lock',
  '**/.yarnrc*',
  '**/bun.lock',
  '**/bun.lockb',
  '**/.npmrc',
  '**/composer.json',
  '**/composer.lock',
  '**/Gemfile',
  '**/Gemfile.lock',
  '**/requirements*.txt',
  '**/pyproject.toml',
  '**/poetry.lock',
  '**/Pipfile*',
  '**/go.mod',
  '**/go.sum',
  '**/Cargo.toml',
  '**/Cargo.lock',
  // CI.
  '**/.github/**',
  '**/.gitlab-ci.yml',
  '**/.circleci/**',
  '**/bitbucket-pipelines.yml',
  '**/azure-pipelines.yml',
  '**/Jenkinsfile',
  // Infrastructure and hosting.
  '**/Dockerfile*',
  '**/docker-compose*',
  '**/*.tf',
  '**/*.tfvars',
  '**/terraform/**',
  '**/k8s/**',
  '**/helm/**',
  '**/vercel.json',
  '**/netlify.toml',
  '**/fly.toml',
  '**/render.yaml',
  '**/railway.json',
  '**/Procfile',
  '**/wrangler.toml',
  '**/serverless.yml',
  // Auth, permissions and request interception.
  '**/auth/**',
  '**/auth.*',
  '**/*.auth.*',
  '**/middleware.*',
  '**/proxy.*',
  '**/permissions/**',
  '**/rbac/**',
  '**/firestore.rules',
  '**/storage.rules',
];

export interface RuleTemplate {
  id: RuleTemplateId;
  /** Shown in the panel. */
  label: string;
  description: string;
  /** Example policy in natural language; the agency rewrites it. */
  policy_text: string;
  config: RulesConfig;
}

/** Things that are "algo nuevo" in any stack (brief §1). */
const COMMON_NEW = [
  'integrar una pasarela de pagos o un medio de pago nuevo (Mercado Pago, Stripe, Pix)',
  'un agente o un workflow automático nuevo desde cero',
  'conectar un sistema de terceros que pide credenciales o contrato (facturación electrónica, ERP, logística, CRM)',
  'cuentas de usuario o un área privada para clientes',
  'una app móvil o un módulo grande nuevo',
];

const COMMON_POLICY_NEW =
  'Es algo nuevo (va con presupuesto): integrar pagos, un agente o automatización nueva, conectar sistemas que piden credenciales o contrato, cuentas de usuario y módulos grandes.';

const config = (id: RuleTemplateId, delicateGlobs: string[], alwaysNew: string[] = COMMON_NEW): RulesConfig => ({
  delicateGlobs,
  protectedGlobs: [],
  simpleGlobs: [],
  alwaysNew,
  template: id,
});

export const RULE_TEMPLATES: Record<RuleTemplateId, RuleTemplate> = {
  'nextjs-supabase': {
    id: 'nextjs-supabase',
    label: 'Next.js con Supabase',
    description: 'App Router o Pages, con Supabase para datos y login.',
    policy_text: [
      'Es simple todo lo visible: textos, precios, horarios, imágenes, colores, secciones, avisos, páginas nuevas y componentes de la interfaz, y los formularios que solo muestran datos o los mandan por mail o WhatsApp.',
      'Es delicado lo que toca Supabase (tablas, migraciones, políticas RLS, funciones o datos), el login y los permisos, las rutas de app/api o pages/api, las server actions que escriben datos, las variables de entorno, las dependencias y la configuración de Next.',
      COMMON_POLICY_NEW,
    ].join('\n'),
    config: config('nextjs-supabase', [
      'supabase/**',
      '**/supabase/**',
      'app/api/**',
      'src/app/api/**',
      'pages/api/**',
      'src/pages/api/**',
      '**/actions/**',
      '**/actions.ts',
      '**/*.server.*',
      '**/server/**',
      'next.config.*',
      'instrumentation.*',
      '**/webhooks/**',
      '**/payments/**',
      '**/checkout/**',
    ]),
  },
  wordpress: {
    id: 'wordpress',
    label: 'WordPress',
    description: 'Tema y plugins de WordPress, con o sin WooCommerce.',
    policy_text: [
      'Es simple cambiar textos, imágenes, menús, colores y estilos del tema, bloques y páginas, y formularios de contacto que solo mandan un mail.',
      'Es delicado tocar plugins, functions.php, wp-config.php, .htaccess, usuarios y roles, la base de datos, el checkout de WooCommerce o cualquier cosa que ejecute PHP del lado del servidor.',
      COMMON_POLICY_NEW,
    ].join('\n'),
    config: config('wordpress', [
      'wp-config.php',
      '**/wp-config*.php',
      '**/.htaccess',
      'wp-content/plugins/**',
      'wp-content/mu-plugins/**',
      '**/functions.php',
      'wp-admin/**',
      'wp-includes/**',
      '**/xmlrpc.php',
      '**/woocommerce/**',
      '**/checkout/**',
    ]),
  },
  shopify: {
    id: 'shopify',
    label: 'Shopify',
    description: 'Tema de Shopify (Liquid) y, si hay, extensiones de una app.',
    policy_text: [
      'Es simple cambiar textos, imágenes, colores, secciones, bloques y plantillas del tema, y los avisos de la tienda.',
      'Es delicado tocar el checkout, la configuración del tema, las extensiones o funciones de la app, los scripts de terceros y todo lo que cambie precios, descuentos o impuestos de forma automática.',
      COMMON_POLICY_NEW,
    ].join('\n'),
    config: config('shopify', [
      'config/**',
      '**/checkout*',
      'extensions/**',
      'functions/**',
      'web/**',
      '**/shopify.app.toml',
      '**/shopify.extension.toml',
      '**/*.toml',
    ]),
  },
  tiendanube: {
    id: 'tiendanube',
    label: 'Tiendanube / Nuvemshop',
    description: 'Tema de Tiendanube (Twig): layouts, templates, snipplets y static.',
    policy_text: [
      'Es simple cambiar textos, imágenes, colores, banners, secciones y plantillas del tema.',
      'Es delicado tocar la configuración del tema, los scripts propios o de terceros, el checkout y todo lo que cambie precios, envíos o medios de pago.',
      COMMON_POLICY_NEW,
    ].join('\n'),
    config: config('tiendanube', ['config/**', '**/checkout*', '**/*payment*', '**/*pago*', '**/*shipping*', '**/*envio*', 'static/js/**']),
  },
  generic: {
    id: 'generic',
    label: 'Genérica',
    description: 'Cualquier stack: backend, API, base de datos y pagos son delicados.',
    policy_text: [
      'Es simple todo lo visible o de interfaz que no toca zonas delicadas: textos, precios, horarios, imágenes, colores, secciones, avisos, páginas o formularios que solo muestran o mandan datos y componentes de la interfaz.',
      'Es delicado lo que toca la base de datos (esquema, migraciones o datos), el login y los permisos, el backend o la API, los pagos que ya existen, los secretos o variables de entorno, la infraestructura o el CI, las dependencias, o lo que borra datos.',
      COMMON_POLICY_NEW,
    ].join('\n'),
    config: config('generic', [
      '**/api/**',
      '**/server/**',
      '**/backend/**',
      '**/functions/**',
      '**/db/**',
      '**/database/**',
      '**/webhooks/**',
      '**/payments/**',
      '**/checkout/**',
      '**/cron/**',
      '**/jobs/**',
      '**/*.server.*',
    ]),
  },
};

export function ruleTemplate(id: RuleTemplateId | string): RuleTemplate {
  return structuredClone(RULE_TEMPLATES[isRuleTemplateId(id) ? id : 'generic']);
}
