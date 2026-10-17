import { describe, expect, it } from "vitest";
import { clientHealth, countsAsChange, lastMonths, monthKey, usageByMonth } from "../src/lib/client-health";

const NOW = Date.parse("2026-10-17T15:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const base = { quota: 20, usedThisMonth: 5, needsSince: [] as string[], lastRequestAt: ago(2), now: NOW };

describe("clientHealth", () => {
  it("verde sin pendientes, con cupo y actividad reciente", () => {
    expect(clientHealth(base)).toEqual({ level: "verde", reasons: [] });
  });

  it("ámbar si hay algo en Te necesita de menos de 24 h", () => {
    expect(clientHealth({ ...base, needsSince: [ago(3)] }).level).toBe("ambar");
  });

  it("rojo si algo en Te necesita tiene más de 24 h", () => {
    const h = clientHealth({ ...base, needsSince: [ago(3), ago(25)] });
    expect(h.level).toBe("rojo");
    expect(h.reasons[0]).toMatch(/24 h/);
  });

  it("ámbar desde el 80% del cupo; rojo al pasarse", () => {
    expect(clientHealth({ ...base, usedThisMonth: 15 }).level).toBe("verde");
    expect(clientHealth({ ...base, usedThisMonth: 16 }).level).toBe("ambar");
    expect(clientHealth({ ...base, usedThisMonth: 20 }).level).toBe("ambar");
    expect(clientHealth({ ...base, usedThisMonth: 21 }).level).toBe("rojo");
  });

  it("sin cupo cargado no mira el consumo", () => {
    expect(clientHealth({ ...base, quota: null, usedThisMonth: 99 }).level).toBe("verde");
  });

  it("ámbar si no pidió nada en 30 días o nunca pidió", () => {
    expect(clientHealth({ ...base, lastRequestAt: ago(24 * 31) }).level).toBe("ambar");
    expect(clientHealth({ ...base, lastRequestAt: null }).reasons).toContain("No pidió nada en 30 días");
  });
});

describe("consumo", () => {
  it("monthKey usa la hora de Montevideo", () => {
    expect(monthKey("2026-11-01T02:00:00Z")).toBe("2026-10");
    expect(monthKey("2026-11-01T03:00:00Z")).toBe("2026-11");
  });

  it("lastMonths cruza el año", () => {
    expect(lastMonths(Date.parse("2026-02-10T12:00:00Z"), 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("cuenta como cambio lo publicado o revertido con carril", () => {
    expect(countsAsChange({ status: "publicado", lane: "contenido" })).toBe(true);
    expect(countsAsChange({ status: "revertido", lane: "codigo" })).toBe(true);
    expect(countsAsChange({ status: "publicado", lane: null })).toBe(false);
    expect(countsAsChange({ status: "esperando_cliente", lane: "contenido" })).toBe(false);
  });

  it("usageByMonth suma cambios, costo y pedidos por mes", () => {
    const rows = usageByMonth(
      [
        { status: "publicado", lane: "contenido", cost_usd: 0.01, created_at: "2026-10-03T12:00:00Z" },
        { status: "derivado", lane: null, cost_usd: 0.02, created_at: "2026-10-05T12:00:00Z" },
        { status: "publicado", lane: "contenido", cost_usd: 0.03, created_at: "2026-09-20T12:00:00Z" },
        { status: "publicado", lane: "contenido", cost_usd: 1, created_at: "2025-01-01T12:00:00Z" },
      ],
      ["2026-09", "2026-10"],
    );
    expect(rows).toEqual([
      { month: "2026-09", changes: 1, cost: 0.03, requests: 1 },
      { month: "2026-10", changes: 1, cost: 0.03, requests: 2 },
    ]);
  });
});
