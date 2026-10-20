// Métricas de calidad por agencia (brief §2), calculadas solo con sus datos. Funciones puras, con pruebas.
// Cada métrica trae numerador y denominador; sin datos, el valor es null (se muestra «—», nunca un número inventado).
import { CATEGORIES, isDecided, normalizeCategory, type Category } from "./taxonomy";

export type QRequest = {
  id: string;
  project_id: string;
  category: string | null;
  status: string;
  parent_request_id: string | null;
  cost_usd: number | null;
  created_at: string;
};
export type QLabel = { request_id: string; from_category: string | null; to_category: string; created_at: string };
export type QApproval = { request_id: string; actor: "cliente" | "agencia"; decision: "aprobado" | "rechazado"; at: string };

export type Ratio = { value: number | null; num: number; den: number };
export type Transition = { from: Category; to: Category; count: number };

export type Quality = {
  requests: number;
  /** 1 − reetiquetados / decididos. */
  precision: Ratio;
  /** El error caro: simples que la agencia marcó como delicados. */
  simpleToDelicate: number;
  transitions: Transition[];
  /** Pedidos nuevos (sin pedido anterior) cuya primera decisión del cliente fue «Dale». */
  firstTry: Ratio;
  /** «No era eso» sobre las respuestas del cliente a una vista previa. */
  notThat: Ratio;
  /** Desde que llega el pedido hasta el evento publicado: mediana y p90, en ms. */
  publish: { median: number | null; p90: number | null; count: number };
  /** Costo de IA por pedido, en USD. */
  cost: { perRequest: number | null; total: number };
  /** Lo que tuvo que mirar una persona de la agencia: delicado o derivado. */
  escalations: Ratio;
  agencyRejections: number;
};

const ratio = (num: number, den: number): Ratio => ({ value: den ? num / den : null, num, den });

/** Percentil por el método del rango más cercano (p entre 0 y 1). */
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i]!;
}

export function computeQuality(input: {
  requests: QRequest[];
  labels: QLabel[];
  approvals: QApproval[];
  /** Momento del evento `publicado` (ok) de cada pedido. */
  publishedAt: Map<string, string>;
}): Quality {
  const { requests, labels, approvals, publishedAt } = input;
  const ids = new Set(requests.map((r) => r.id));

  // Última etiqueta de cada pedido: la que vale.
  const latest = new Map<string, QLabel>();
  for (const l of labels) {
    if (!ids.has(l.request_id)) continue;
    const prev = latest.get(l.request_id);
    if (!prev || l.created_at >= prev.created_at) latest.set(l.request_id, l);
  }

  const decided = requests.filter((r) => isDecided(r.category));
  const transitions = new Map<string, Transition>();
  let relabeled = 0;
  let simpleToDelicate = 0;
  for (const r of decided) {
    const l = latest.get(r.id);
    const from = normalizeCategory(r.category)!;
    const to = normalizeCategory(l?.to_category);
    if (!l || !to || to === from) continue;
    relabeled++;
    if (from === "simple" && to === "delicado") simpleToDelicate++;
    const key = `${from}>${to}`;
    const t = transitions.get(key) ?? { from, to, count: 0 };
    t.count++;
    transitions.set(key, t);
  }

  // Respuestas del cliente a la vista previa, en orden.
  const byRequest = new Map<string, QApproval[]>();
  for (const a of approvals) {
    if (!ids.has(a.request_id) || a.actor !== "cliente") continue;
    byRequest.set(a.request_id, [...(byRequest.get(a.request_id) ?? []), a]);
  }
  let firstTryDen = 0;
  let firstTryNum = 0;
  let clientAnswers = 0;
  let notThat = 0;
  for (const r of requests) {
    const answers = (byRequest.get(r.id) ?? []).sort((a, b) => a.at.localeCompare(b.at));
    clientAnswers += answers.length;
    notThat += answers.filter((a) => a.decision === "rechazado").length;
    if (r.parent_request_id || !answers.length) continue;
    firstTryDen++;
    if (answers[0]!.decision === "aprobado") firstTryNum++;
  }

  const times = requests
    .flatMap((r) => {
      const at = publishedAt.get(r.id);
      const ms = at ? Date.parse(at) - Date.parse(r.created_at) : NaN;
      return Number.isFinite(ms) && ms >= 0 ? [ms] : [];
    })
    .sort((a, b) => a - b);

  const total = requests.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const categorized = requests.filter((r) => normalizeCategory(r.category));
  const escalated = categorized.filter((r) => {
    const c = normalizeCategory(r.category);
    return c === "delicado" || c === "derivado";
  });
  const order = (c: Category) => CATEGORIES.indexOf(c);

  return {
    requests: requests.length,
    precision: { value: decided.length ? 1 - relabeled / decided.length : null, num: relabeled, den: decided.length },
    simpleToDelicate,
    transitions: [...transitions.values()].sort((a, b) => b.count - a.count || order(a.from) - order(b.from)),
    firstTry: ratio(firstTryNum, firstTryDen),
    notThat: ratio(notThat, clientAnswers),
    publish: { median: percentile(times, 0.5), p90: percentile(times, 0.9), count: times.length },
    cost: { perRequest: requests.length ? total / requests.length : null, total },
    escalations: ratio(escalated.length, categorized.length),
    agencyRejections: approvals.filter((a) => ids.has(a.request_id) && a.actor === "agencia" && a.decision === "rechazado").length,
  };
}
