import { ALWAYS_PROTECTED, matchesAny } from './guard.js';

/**
 * Review of the agent's diff before anything is committed (SPEC §11.3). Only added
 * lines count: removing an `eval(` is fine, adding one is not.
 */

export interface DiffFile {
  path: string;
  /** Git mode of the new file, e.g. `100644`, `100755` or `120000` (symlink). */
  mode?: string;
}

export interface ReviewInput {
  diff: string;
  files: DiffFile[];
  protectedGlobs: string[];
  /** Secret values (8+ chars) that must never appear. */
  secrets?: string[];
  /** Max number of changed files. Default 30. */
  maxFiles?: number;
}

const FORBIDDEN: { re: RegExp; reason: string }[] = [
  { re: /process\s*\.\s*env|process\s*\[\s*['"`]env['"`]\s*\]/, reason: 'usa process.env' },
  { re: /child_process/, reason: 'usa child_process' },
  { re: /\beval\s*\(/, reason: 'usa eval(' },
  { re: /new\s+Function\s*\(/, reason: 'usa new Function(' },
  { re: /<\s*script\b/i, reason: 'agrega un <script' },
];

/** Lines added by the diff, without the leading `+`. */
export function addedLines(diff: string): string[] {
  return diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
}

/** Returns Spanish reasons to reject the diff; empty means it passes. */
export function reviewDiff(input: ReviewInput): string[] {
  const reasons = new Set<string>();
  const maxFiles = input.maxFiles ?? 30;
  if (input.files.length === 0) reasons.add('El agente no cambió ningún archivo');
  if (input.files.length > maxFiles) reasons.add(`Cambia ${input.files.length} archivos, más que el máximo de ${maxFiles}`);
  for (const f of input.files) {
    const hit = matchesAny(f.path, [...ALWAYS_PROTECTED, ...input.protectedGlobs]);
    if (hit) reasons.add(`Toca un archivo protegido: ${f.path}`);
    if (f.mode === '120000') reasons.add(`Crea un enlace simbólico: ${f.path}`);
    if (f.path.split('/').includes('..')) reasons.add(`Ruta inválida: ${f.path}`);
  }
  if (/^Binary files .* differ$/m.test(input.diff) || /^GIT binary patch$/m.test(input.diff)) {
    reasons.add('Agrega o cambia un archivo binario');
  }
  const added = addedLines(input.diff);
  for (const line of added) {
    for (const f of FORBIDDEN) if (f.re.test(line)) reasons.add(`El diff ${f.reason}`);
  }
  const secrets = (input.secrets ?? []).filter((s) => s.length >= 8);
  if (secrets.length > 0 && added.some((l) => secrets.some((s) => l.includes(s)))) {
    reasons.add('El diff contiene el valor de un secreto');
  }
  return [...reasons];
}
