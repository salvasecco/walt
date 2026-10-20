import type { Report } from './report.js';

/**
 * Before/after against a saved report (`--compare <report.json>`): only what can be compared. The R1
 * taxonomy renamed the categories and changed the criteria, so category accuracy is measured against
 * each version's own labels; the expected operations did not change, so their accuracy compares case
 * by case. "Published without review when it shouldn't" is `falsePermitidos` before and `falseSimple` now.
 */

/** The parts of a report (old or new shape) the comparison reads. */
export interface ComparableReport {
  meta: { date: string; provider: string; model: string; commit?: string };
  suites: {
    name: string;
    summary: {
      cases: number;
      categoryOk: number;
      categoryAccuracy: number;
      opsCases: number;
      opsExact: number;
      prohibitedApplied: number;
      errors: number;
      p50Ms: number;
      p95Ms: number;
      costUsd: number;
      falsePermitidos?: number;
      falseSimple?: number;
    } | null;
    results: { id: string; categoryOk: boolean; opsOk?: boolean }[];
  }[];
}

export type Verdict = 'igual' | 'mejor' | 'peor';

export interface ComparisonRow {
  suite: string;
  metric: string;
  before: string;
  after: string;
  verdict: Verdict | 'info';
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
const higherIsBetter = (a: number, b: number): Verdict => (b > a ? 'mejor' : b < a ? 'peor' : 'igual');
const lowerIsBetter = (a: number, b: number): Verdict => (b < a ? 'mejor' : b > a ? 'peor' : 'igual');

export function compareReports(before: ComparableReport, after: ComparableReport): { rows: ComparisonRow[]; changedCases: string[]; worse: ComparisonRow[] } {
  const rows: ComparisonRow[] = [];
  const changedCases: string[] = [];
  for (const b of before.suites) {
    const a = after.suites.find((s) => s.name === b.name);
    if (!a?.summary || !b.summary) continue;
    const bs = b.summary;
    const as = a.summary;
    rows.push({
      suite: b.name,
      metric: 'Acierto de categoría (contra las etiquetas de cada versión)',
      before: `${bs.categoryAccuracy}% (${bs.categoryOk}/${bs.cases})`,
      after: `${as.categoryAccuracy}% (${as.categoryOk}/${as.cases})`,
      verdict: higherIsBetter(bs.categoryAccuracy, as.categoryAccuracy),
    });
    // Operations: only the cases both runs have, with an expectation in both.
    const shared = b.results.filter((r) => r.opsOk !== undefined && a.results.some((x) => x.id === r.id && x.opsOk !== undefined));
    if (shared.length) {
      const okBefore = shared.filter((r) => r.opsOk).length;
      const okAfter = shared.filter((r) => a.results.find((x) => x.id === r.id)!.opsOk).length;
      rows.push({
        suite: b.name,
        metric: 'Acierto de operaciones (mismos casos)',
        before: `${pct(okBefore, shared.length)}% (${okBefore}/${shared.length})`,
        after: `${pct(okAfter, shared.length)}% (${okAfter}/${shared.length})`,
        verdict: higherIsBetter(okBefore, okAfter),
      });
    }
    rows.push({
      suite: b.name,
      metric: 'Cambios prohibidos aplicados',
      before: String(bs.prohibitedApplied),
      after: String(as.prohibitedApplied),
      verdict: lowerIsBetter(bs.prohibitedApplied, as.prohibitedApplied),
    });
    const fb = bs.falseSimple ?? bs.falsePermitidos ?? 0;
    const fa = as.falseSimple ?? as.falsePermitidos ?? 0;
    rows.push({
      suite: b.name,
      metric: 'Publicado sin revisión cuando no correspondía (falsos permitidos → falsos simples)',
      before: String(fb),
      after: String(fa),
      verdict: lowerIsBetter(fb, fa),
    });
    rows.push({ suite: b.name, metric: 'Errores o timeouts', before: String(bs.errors), after: String(as.errors), verdict: lowerIsBetter(bs.errors, as.errors) });
    rows.push({ suite: b.name, metric: 'Tiempo p50 / p95', before: `${bs.p50Ms} / ${bs.p95Ms} ms`, after: `${as.p50Ms} / ${as.p95Ms} ms`, verdict: 'info' });
    rows.push({ suite: b.name, metric: 'Costo', before: `USD ${bs.costUsd.toFixed(4)}`, after: `USD ${as.costUsd.toFixed(4)}`, verdict: 'info' });
    for (const r of b.results) {
      const x = a.results.find((y) => y.id === r.id);
      if (!x) continue;
      if (r.categoryOk !== x.categoryOk) changedCases.push(`${r.id}: categoría ${r.categoryOk ? '✓' : '✗'} → ${x.categoryOk ? '✓' : '✗'}`);
      if (r.opsOk !== undefined && x.opsOk !== undefined && r.opsOk !== x.opsOk) changedCases.push(`${r.id}: operaciones ${r.opsOk ? '✓' : '✗'} → ${x.opsOk ? '✓' : '✗'}`);
    }
  }
  return { rows, changedCases, worse: rows.filter((r) => r.verdict === 'peor') };
}

export function renderComparison(before: ComparableReport, after: ComparableReport | Report): string {
  const { rows, changedCases, worse } = compareReports(before, after as ComparableReport);
  const m = before.meta;
  const mark = (v: ComparisonRow['verdict']) => (v === 'peor' ? '**peor**' : v === 'mejor' ? 'mejor' : v === 'igual' ? 'igual' : '—');
  return [
    '## Antes y después',
    '',
    `Antes: \`${m.model}\` (${m.provider}) en \`${m.commit ?? '?'}\`, ${m.date}, con la taxonomía vieja. Después: esta corrida. Las categorías cambiaron de nombre y de criterio, así que el acierto de categoría se mide contra las etiquetas de cada versión; las operaciones esperadas son las mismas y se comparan caso por caso.`,
    '',
    '| Suite | Métrica | Antes | Después | |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.suite} | ${r.metric} | ${r.before} | ${r.after} | ${mark(r.verdict)} |`),
    '',
    worse.length ? `**Empeoró:** ${worse.map((w) => `${w.suite} · ${w.metric}`).join('; ')}.` : 'Nada de lo comparable empeoró.',
    ...(changedCases.length ? ['', `Casos que cambiaron: ${changedCases.join('; ')}.`] : []),
  ].join('\n');
}
