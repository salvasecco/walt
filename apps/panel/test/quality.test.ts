import { describe, expect, it } from "vitest";
import { computeQuality, percentile, type QApproval, type QLabel, type QRequest } from "../src/lib/quality";

const T0 = Date.parse("2026-10-10T12:00:00Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

let n = 0;
function req(category: string | null, over: Partial<QRequest> = {}): QRequest {
  n++;
  return { id: `r${n}`, project_id: "p1", category, status: "publicado", parent_request_id: null, cost_usd: 0.01, created_at: at(0), ...over };
}
const label = (r: QRequest, to: string, s = 100): QLabel => ({ request_id: r.id, from_category: r.category, to_category: to, created_at: at(s) });
const client = (r: QRequest, decision: QApproval["decision"], s = 10): QApproval => ({ request_id: r.id, actor: "cliente", decision, at: at(s) });

const run = (requests: QRequest[], labels: QLabel[] = [], approvals: QApproval[] = [], published: [QRequest, number][] = []) =>
  computeQuality({ requests, labels, approvals, publishedAt: new Map(published.map(([r, s]) => [r.id, at(s)])) });

describe("precisión de la clasificación", () => {
  it("1 − reetiquetados / decididos, y el error caro aparte", () => {
    const a = req("simple");
    const b = req("permitido"); // viejo: cuenta como simple
    const c = req("delicado");
    const d = req("consulta");
    const chat = req("charla"); // no cuenta como decidido
    const q = run([a, b, c, d, chat], [label(a, "delicado"), label(c, "simple")]);
    expect(q.precision).toEqual({ value: 0.5, num: 2, den: 4 });
    expect(q.simpleToDelicate).toBe(1);
    expect(q.transitions).toEqual([
      { from: "simple", to: "delicado", count: 1 },
      { from: "delicado", to: "simple", count: 1 },
    ]);
  });

  it("vale la última etiqueta: si la agencia la volvió a la original, no es error", () => {
    const a = req("simple");
    const q = run([a], [label(a, "delicado", 100), label(a, "simple", 200)]);
    expect(q.precision.value).toBe(1);
    expect(q.simpleToDelicate).toBe(0);
  });

  it("sin pedidos decididos, null (nunca un número inventado)", () => {
    expect(run([req("charla")]).precision.value).toBeNull();
    expect(run([]).cost.perRequest).toBeNull();
  });
});

describe("primer intento y «No era eso»", () => {
  it("cuenta la primera respuesta del cliente en pedidos nuevos; los reintentos no entran al primer intento", () => {
    const ok = req("simple");
    const no = req("simple", { status: "descartado" });
    const retry = req("simple", { parent_request_id: no.id });
    const waiting = req("simple", { status: "esperando_cliente" });
    const q = run([ok, no, retry, waiting], [], [client(ok, "aprobado"), client(no, "rechazado"), client(retry, "aprobado")]);
    expect(q.firstTry).toEqual({ value: 0.5, num: 1, den: 2 });
    expect(q.notThat).toEqual({ value: 1 / 3, num: 1, den: 3 });
  });

  it("las decisiones de la agencia no cuentan como respuesta del cliente", () => {
    const r = req("delicado", { status: "rechazado" });
    const q = run([r], [], [{ request_id: r.id, actor: "agencia", decision: "rechazado", at: at(5) }]);
    expect(q.firstTry.den).toBe(0);
    expect(q.agencyRejections).toBe(1);
  });
});

describe("tiempo hasta publicar, costo y escalamientos", () => {
  it("mediana y p90 del tiempo a publicado", () => {
    const rs = [10, 20, 30, 40, 100].map(() => req("simple"));
    const q = run(rs, [], [], rs.map((r, i) => [r, [10, 20, 30, 40, 100][i]!] as [QRequest, number]));
    expect(q.publish).toEqual({ median: 30_000, p90: 100_000, count: 5 });
  });

  it("costo por pedido sobre todos los pedidos del período", () => {
    const q = run([req("simple", { cost_usd: 0.02 }), req("consulta", { cost_usd: 0.01 }), req(null, { cost_usd: null })]);
    expect(q.cost.total).toBeCloseTo(0.03);
    expect(q.cost.perRequest).toBeCloseTo(0.01);
  });

  it("escalamientos: delicado o derivado sobre los que tienen categoría", () => {
    const q = run([req("delicado"), req("riesgoso"), req("derivado"), req("simple"), req(null)]);
    expect(q.escalations).toEqual({ value: 0.75, num: 3, den: 4 });
  });

  it("percentile", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([1], 0.9)).toBe(1);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
  });
});
