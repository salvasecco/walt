import { delicatePathReason, delicatePaths, parseRulesConfig, type DelicatePath, type RulesConfig } from '@walt/core';
import { DEFAULT_PROTECTED_GLOBS } from './code-change.js';
import { addedLines, reviewDiff } from './review.js';

/**
 * Second half of the double classification (brief §1): after the agent builds the diff, code checks
 * the real change. The paths it touches go against the delicate globs (the floor, the template and
 * the agency's, minus its simple exceptions) and the protected ones; the added lines go against what
 * `reviewDiff` rejects and a few signals of backend, database or login. Anything found raises the
 * request to `delicado`. It never lowers one.
 */

export interface DiffClassification {
  category: 'simple' | 'delicado';
  /** Spanish, for the agency, the panel and the `revision_diff` event. Empty when simple. */
  reasons: string[];
  /** The delicate paths found, with the glob that matched each one. */
  paths: DelicatePath[];
}

/** Lines that mean backend, database, login or unsafe HTML, wherever the file lives. */
const DELICATE_LINES: { re: RegExp; reason: string }[] = [
  { re: /^\s*['"]use server['"]/, reason: 'agrega código que corre en el servidor ("use server")' },
  {
    re: /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/,
    reason: 'agrega un endpoint de API',
  },
  {
    re: /\b(create|alter|drop|truncate)\s+(table|policy|function|index|schema|trigger|view)\b|\bdelete\s+from\b|\binsert\s+into\b|\bgrant\s+\w+\s+on\b/i,
    reason: 'agrega SQL que cambia la base de datos',
  },
  { re: /\bservice_role\b|SERVICE_ROLE_KEY/, reason: 'usa la clave de servicio de la base de datos' },
  { re: /\bauth\s*\.\s*(admin|sign\w*|getSession|getUser|updateUser|setSession|exchangeCode\w*)\b|\b(signIn|signOut|signUp)\s*\(/, reason: 'toca el login o la sesión' },
  { re: /\bdangerouslySetInnerHTML\b|\.innerHTML\s*=/, reason: 'inserta HTML sin escapar' },
  { re: /\bdocument\s*\.\s*cookie\b|\bcookies\s*\(\s*\)\s*\.\s*(set|delete)\s*\(/, reason: 'maneja cookies' },
];

/** Patterns that can span lines (a query builder chain), checked on all the added lines together. */
const DELICATE_TEXT: { re: RegExp; reason: string }[] = [
  { re: /\.from\(\s*['"`][^'"`]+['"`]\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/, reason: 'escribe o borra datos en la base' },
  { re: /\bprisma\s*\.\s*\w+\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/, reason: 'escribe o borra datos en la base' },
];

export interface ClassifyDiffInput {
  /** Unified diff, as `runCodeChange` returns it. */
  diff: string;
  /** Paths the diff touches (`changedFiles`). */
  files: string[];
  /** The project's rules config; missing fields get the generic template (`parseRulesConfig`). */
  config?: Partial<RulesConfig>;
  /** Secret values that must never appear. */
  secrets?: string[];
}

export function classifyDiff(input: ClassifyDiffInput): DiffClassification {
  const config = parseRulesConfig(input.config ?? {});
  const reasons: string[] = [];
  const paths = delicatePaths(input.files, config);
  for (const p of paths) reasons.push(delicatePathReason(p));

  // What the review rejects is delicate at least (defense in depth: runCodeChange already rejects it).
  const review = reviewDiff({
    diff: input.diff,
    files: input.files.map((path) => ({ path })),
    protectedGlobs: protectedGlobsFor(config),
    secrets: input.secrets,
  }).filter((r) => r !== 'El agente no cambió ningún archivo');
  reasons.push(...review);

  const added = addedLines(input.diff);
  for (const line of added) {
    for (const s of DELICATE_LINES) if (s.re.test(line)) reasons.push(`El diff ${s.reason}`);
  }
  const text = added.join('\n');
  for (const s of DELICATE_TEXT) if (s.re.test(text)) reasons.push(`El diff ${s.reason}`);
  const unique = [...new Set(reasons)];
  return { category: unique.length ? 'delicado' : 'simple', reasons: unique, paths };
}

/** What the agent may never touch: its own protected list plus the agency's. */
export function protectedGlobsFor(config?: Partial<Pick<RulesConfig, 'protectedGlobs'>>): string[] {
  return [...new Set([...DEFAULT_PROTECTED_GLOBS, ...(config?.protectedGlobs ?? [])])];
}

/**
 * The line added to the brief of a simple request: keep it in the interface. If it can't be done that
 * way the agent still does the minimum, and the diff check sends it to the agency.
 */
export const SIMPLE_CHANGE_HINT =
  'Es un cambio simple: resolvelo en la interfaz (páginas, componentes, estilos, textos), sin tocar la base de datos, la API, el login, las dependencias ni la configuración. Para que un formulario mande datos, preferí un link de WhatsApp o de mail.';
