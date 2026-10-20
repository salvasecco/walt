/**
 * Evaluation runner (SPEC §15, R1): `pnpm eval [--provider fake|anthropic|bedrock] [--model <id>] [--only s01,s02]
 * [--out <dir>] [--compare <report.json>|none]`. Runs interpret → gate → decide over the bakery fixture and
 * writes `report.md` and `report.json`. With a real provider it compares against the saved baseline.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAi } from '@walt/ai';
import { DEFAULT_RULES, loadEnv } from '@walt/core';
import { bakeryConfig, bakeryContent, bakerySchema } from '@walt/core/fixtures';
import { loadCases, type EvalCase } from './cases.js';
import { compareReports, renderComparison, type ComparableReport } from './compare.js';
import { failed, renderMarkdown, summarize, type Report } from './report.js';
import { runSuite, type EvalContext } from './run.js';

export * from './cases.js';
export * from './compare.js';
export * from './normalize.js';
export * from './run.js';
export * from './report.js';

export const EVAL_DIR = fileURLToPath(new URL('..', import.meta.url));
/** Wednesday 2026-10-14 noon in Montevideo: "hasta el domingo" is 2026-10-18. */
export const EVAL_NOW = '2026-10-14T12:00:00-03:00';

export const SUITES = [
  { name: 'sinteticos', file: 'sinteticos.jsonl', label: 'Sintéticos (30 casos del SPEC §15, reetiquetados con la taxonomía R1)', source: 'sintetico' as const },
  { name: 'inyecciones', file: 'inyecciones.jsonl', label: 'Inyecciones extra (sintéticas)', source: 'sintetico' as const },
  { name: 'taxonomia', file: 'taxonomia.jsonl', label: 'Taxonomía R1: delicados, algo nuevo y simples por código (sintéticos, español)', source: 'sintetico' as const },
  { name: 'portugues', file: 'portugues.jsonl', label: 'Português: os mesmos tipos em português (sintéticos)', source: 'sintetico' as const },
  { name: 'reales', file: 'reales.jsonl', label: 'Reales (anonimizados)', source: 'real' as const },
];

/** Report of the real model on main before R1 (commit 2dca34e, prompt v6, Sonnet 5.5). */
export const BASELINE_REPORT = 'baseline/r0-main-2dca34e.json';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const provider = arg('provider') as 'fake' | 'anthropic' | 'bedrock' | undefined;
  const modelArg = arg('model');
  const only = arg('only')?.split(',');
  const outDir = arg('out') ?? EVAL_DIR;
  const compareArg = arg('compare');
  const env = loadEnv({
    fallbackToFake: !provider,
    overrides: { ...process.env, ...(provider ? { LLM_PROVIDER: provider } : {}), ...(modelArg ? { MODEL_INTERPRET: modelArg } : {}) },
  });
  let ai;
  try {
    ai = createAi(env);
  } catch (err) {
    console.error(`[eval] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  if (env.downgraded.includes('LLM_PROVIDER')) console.warn('[eval] sin credenciales del modelo: corro con el proveedor falso');
  const model = ai.name === 'fake' ? 'fake (intérprete por reglas)' : env.MODEL_INTERPRET;

  const ctx: EvalContext = {
    ai,
    config: bakeryConfig(),
    content: bakeryContent(),
    schema: bakerySchema(),
    rules: DEFAULT_RULES,
    rulesVersion: 1,
    now: EVAL_NOW,
    secrets: env.secrets,
    agencyName: env.DEMO_AGENCY_NAME,
    clientName: 'Panadería Mabel',
  };

  let commit: string | undefined;
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: EVAL_DIR, encoding: 'utf8' }).trim();
  } catch {
    commit = undefined;
  }
  const report: Report = {
    meta: {
      date: new Date().toISOString(),
      provider: ai.name,
      model,
      rulesVersion: ctx.rulesVersion,
      now: EVAL_NOW,
      ...(commit ? { commit } : {}),
      ...(ai.name === 'fake'
        ? { note: 'Corrida con el proveedor FALSO (expresiones regulares, solo para probar el corredor). No mide la calidad del modelo real: la demo corre con el modelo real.' }
        : {}),
    },
    suites: [],
  };

  for (const s of SUITES) {
    let cases: EvalCase[] = loadCases(join(EVAL_DIR, 'cases', s.file));
    if (only) cases = cases.filter((c) => only.includes(c.id));
    const bad = cases.filter((c) => c.source !== s.source);
    if (bad.length > 0) throw new Error(`${s.file}: ${bad.map((c) => c.id).join(', ')} no son "${s.source}"`);
    console.log(`[eval] ${s.label}: ${cases.length} casos`);
    const results = await runSuite(cases, s.name, ctx, (r) => {
      console.log(`  ${failed(r) ? '✗' : '✓'} ${r.id} ${r.decision.category.padEnd(16)} ${String(r.ms).padStart(6)} ms  ${r.text.slice(0, 60)}`);
    });
    report.suites.push({ name: s.name, label: s.label, source: s.source, summary: summarize(results), results });
  }

  // Before/after against the baseline, only with a real model (the baseline is the real model on main).
  const comparePath = compareArg === 'none' ? undefined : (compareArg ?? (ai.name === 'fake' || only ? undefined : join(EVAL_DIR, BASELINE_REPORT)));
  let comparison: string | undefined;
  let worse: string[] = [];
  if (comparePath && existsSync(comparePath)) {
    const before = JSON.parse(readFileSync(comparePath, 'utf8')) as ComparableReport;
    comparison = renderComparison(before, report);
    worse = compareReports(before, report as unknown as ComparableReport).worse.map((w) => `${w.suite} · ${w.metric}`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, 'report.md'), `${renderMarkdown(report, comparison)}\n`);
  for (const s of report.suites) {
    if (!s.summary) continue;
    const x = s.summary;
    console.log(
      `[eval] ${s.name}: categoría ${x.categoryAccuracy}%, ops ${x.opsAccuracy ?? '—'}%, error caro ${x.expensiveErrors}, falsos simples ${x.falseSimple}, agencia ${x.wentToAgency}, prohibidos aplicados ${x.prohibitedApplied}, p50 ${x.p50Ms} ms, USD ${x.costUsd.toFixed(4)}`,
    );
  }
  if (worse.length) console.warn(`[eval] empeoró respecto de la línea de base: ${worse.join('; ')}`);
  console.log(`[eval] reporte en ${join(outDir, 'report.md')} y report.json`);
  const prohibited = report.suites.reduce((n, s) => n + (s.summary?.prohibitedApplied ?? 0), 0);
  if (prohibited > 0) {
    console.error(`[eval] ${prohibited} casos aplicarían algo prohibido`);
    process.exit(3);
  }
  const expensive = report.suites.reduce((n, s) => n + (s.summary?.expensiveErrors ?? 0), 0);
  if (expensive > 0) {
    console.error(`[eval] ${expensive} casos delicados salieron simples (error caro)`);
    process.exit(4);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[eval] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
