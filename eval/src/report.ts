import type { CaseResult } from './run.js';

export interface Summary {
  cases: number;
  categoryAccuracy: number;
  categoryOk: number;
  laneOk: number;
  opsCases: number;
  opsExact: number;
  opsAccuracy: number | null;
  wentToAgency: number;
  derivado: number;
  falsePermitidos: number;
  prohibitedApplied: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  costUsd: number;
  byCategory: Record<string, { expected: number; ok: number }>;
}

export interface ReportMeta {
  date: string;
  provider: string;
  model: string;
  rulesVersion: number;
  now: string;
  commit?: string;
  note?: string;
}

export interface Report {
  meta: ReportMeta;
  suites: { name: string; label: string; source: 'sintetico' | 'real'; summary: Summary | null; results: CaseResult[] }[];
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

export function summarize(results: CaseResult[]): Summary | null {
  if (results.length === 0) return null;
  const opsCases = results.filter((r) => r.opsOk !== undefined);
  const byCategory: Summary['byCategory'] = {};
  for (const r of results) {
    const key = Array.isArray(r.expected.category) ? r.expected.category.join('|') : r.expected.category;
    byCategory[key] ??= { expected: 0, ok: 0 };
    byCategory[key].expected++;
    if (r.categoryOk) byCategory[key].ok++;
  }
  const categoryOk = results.filter((r) => r.categoryOk).length;
  const opsExact = opsCases.filter((r) => r.opsOk).length;
  const ms = results.map((r) => r.ms);
  return {
    cases: results.length,
    categoryOk,
    categoryAccuracy: pct(categoryOk, results.length),
    laneOk: results.filter((r) => r.laneOk).length,
    opsCases: opsCases.length,
    opsExact,
    opsAccuracy: opsCases.length ? pct(opsExact, opsCases.length) : null,
    wentToAgency: results.filter((r) => r.wentToAgency).length,
    derivado: results.filter((r) => r.decision.category === 'derivado').length,
    falsePermitidos: results.filter((r) => r.falsePermitido).length,
    prohibitedApplied: results.filter((r) => r.prohibitedApplied.length > 0).length,
    errors: results.filter((r) => r.error).length,
    p50Ms: percentile(ms, 50),
    p95Ms: percentile(ms, 95),
    costUsd: Math.round(results.reduce((s, r) => s + r.costUsd, 0) * 1e6) / 1e6,
    byCategory,
  };
}

/** Why a case failed, in Spanish, for the table of failures. */
export function failureReasons(r: CaseResult): string[] {
  const out: string[] = [];
  const exp = Array.isArray(r.expected.category) ? r.expected.category.join(' o ') : r.expected.category;
  if (r.error) out.push(`falla: ${r.error}`);
  if (!r.categoryOk) {
    const why = r.decision.reasons.length ? ` (${r.decision.reasons.join('; ')})` : '';
    const kind = r.interpretation ? ` La IA lo leyó como \`${r.interpretation.kind}\`, confianza ${r.interpretation.confidence}: "${r.interpretation.summary}".` : '';
    out.push(`esperaba ${exp}, salió ${r.decision.category}${why}.${kind}`);
  }
  if (!r.laneOk) out.push(`carril esperado ${r.expected.lane}, salió ${r.decision.lane}`);
  if (r.opsOk === false) {
    out.push(`operaciones distintas: esperaba ${JSON.stringify(r.expected.ops)}, salió ${JSON.stringify(r.interpretation?.ops ?? [])}`);
  }
  if (r.falsePermitido) out.push('falso permitido');
  for (const p of r.prohibitedApplied) out.push(`PROHIBIDO APLICADO: ${p}`);
  return out;
}

export function failed(r: CaseResult): boolean {
  return failureReasons(r).length > 0;
}

const cell = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');

function summaryTable(s: Summary): string {
  const rows: [string, string][] = [
    ['Casos', String(s.cases)],
    ['Acierto de categoría', `${s.categoryAccuracy}% (${s.categoryOk}/${s.cases})`],
    ['Acierto exacto de operaciones, normalizadas', s.opsAccuracy === null ? '—' : `${s.opsAccuracy}% (${s.opsExact}/${s.opsCases} casos con operaciones esperadas)`],
    ['Carril correcto en los riesgosos', `${s.laneOk}/${s.cases}`],
    ['Fueron a la agencia (riesgoso)', String(s.wentToAgency)],
    ['Derivados', String(s.derivado)],
    ['Falsos permitidos', String(s.falsePermitidos)],
    ['**Cambios prohibidos aplicados** (tiene que dar 0)', `**${s.prohibitedApplied}**`],
    ['Errores o timeouts', String(s.errors)],
    ['Tiempo p50 / p95', `${s.p50Ms} ms / ${s.p95Ms} ms`],
    ['Costo total', `USD ${s.costUsd.toFixed(4)}`],
  ];
  return ['| Métrica | Valor |', '|---|---|', ...rows.map(([a, b]) => `| ${a} | ${b} |`)].join('\n');
}

function categoryTable(s: Summary): string {
  return [
    '| Categoría esperada | Casos | Acertados |',
    '|---|---|---|',
    ...Object.entries(s.byCategory)
      .sort()
      .map(([k, v]) => `| ${k} | ${v.expected} | ${v.ok} |`),
  ].join('\n');
}

export function renderMarkdown(report: Report): string {
  const m = report.meta;
  const lines: string[] = [
    '# Evaluación de Walt',
    '',
    `- Fecha: ${m.date}`,
    `- Proveedor: **${m.provider}**, modelo \`${m.model}\``,
    `- Reglas: versión ${m.rulesVersion} (las de por defecto del SPEC §8), contenido de la Panadería Mabel`,
    `- "Ahora" fijo para fechas relativas: ${m.now}`,
    ...(m.commit ? [`- Commit: \`${m.commit}\``] : []),
    ...(m.note ? ['', `> ${m.note}`] : []),
    '',
    'Corre interpretar → gate → decidir sobre el contenido de la panadería, sin Telegram ni GitHub (SPEC §15). Lo sintético y lo real van por separado: los casos sintéticos nunca se presentan como reales.',
    '',
  ];
  for (const suite of report.suites) {
    lines.push(`## ${suite.label}`, '');
    if (!suite.summary) {
      lines.push(suite.source === 'real' ? 'Todavía no hay casos reales. El equipo los carga en `eval/cases/reales.jsonl`, anonimizados.' : 'Sin casos.', '');
      continue;
    }
    lines.push(summaryTable(suite.summary), '', categoryTable(suite.summary), '');
    const fails = suite.results.filter(failed);
    lines.push(`### Casos que fallaron (${fails.length})`, '');
    if (fails.length === 0) {
      lines.push('Ninguno.', '');
    } else {
      lines.push('| Caso | Pedido | Esperado | Obtenido | Por qué |', '|---|---|---|---|---|');
      for (const r of fails) {
        const exp = Array.isArray(r.expected.category) ? r.expected.category.join(' o ') : r.expected.category;
        const got = `${r.decision.category}${r.decision.lane ? ` / ${r.decision.lane}` : ''}`;
        lines.push(`| ${r.id} | ${cell(r.text)} | ${exp} | ${got} | ${cell(failureReasons(r).join(' · '))} |`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}
