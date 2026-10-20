import { describe, expect, it } from "vitest";
import {
  DEFAULT_INPUTS,
  choosePlan,
  computeRoi,
  decodeInputs,
  encodeInputs,
  roiBucket,
  roundHours,
  roundMoney,
} from "../src/lib/landing/roi";

describe("computeRoi", () => {
  it("con los valores por defecto la cuenta es la que muestra la página", () => {
    const r = computeRoi(DEFAULT_INPUTS);
    expect(r.requestsPerMonth).toBe(50);
    expect(r.simpleRequests).toBe(30);
    expect(r.hoursSaved).toBe(10);
    expect(r.moneySaved).toBe(250);
    expect(r.extraGross).toBe(150);
    expect(r.commission).toBe(7.5);
    expect(r.extraNet).toBe(142.5);
    expect(r.choice.plan.id).toBe("agencia");
    expect(r.choice.monthlyCost).toBe(99);
    expect(r.net).toBeCloseTo(293.5);
    expect(r.roi).toBeCloseTo(293.5 / 99);
    expect(r.paybackDays).toBe(8);
    expect(r.maintenanceRevenue).toBe(600);
  });

  it("si no hay beneficio, el retorno es negativo y no se paga", () => {
    const r = computeRoi({ ...DEFAULT_INPUTS, clients: 1, requestsPerClient: 1, simplePct: 0, extraPct: 0 });
    expect(r.net).toBe(-29);
    expect(r.roi).toBeLessThan(0);
    expect(r.paybackDays).toBeNull();
    expect(roiBucket(r.roi)).toBe("negativo");
  });

  it("valores fuera de rango se acotan", () => {
    const r = computeRoi({ ...DEFAULT_INPUTS, clients: 10_000, simplePct: 250 });
    expect(r.requestsPerMonth).toBe(100 * 5);
    expect(r.simpleRequests).toBe(500);
  });
});

describe("choosePlan", () => {
  it("elige el más barato por cantidad de proyectos, con los extra", () => {
    expect(choosePlan(3)).toMatchObject({ monthlyCost: 29, extraProjects: 0, plan: { id: "freelancer" } });
    expect(choosePlan(4)).toMatchObject({ monthlyCost: 39, plan: { id: "freelancer" } });
    expect(choosePlan(11)).toMatchObject({ monthlyCost: 107, plan: { id: "agencia" } });
    expect(choosePlan(30)).toMatchObject({ monthlyCost: 249, plan: { id: "estudio" } });
  });

  it("a igual costo gana el que incluye más", () => {
    // Freelancer con 7 proyectos extra (29 + 70) cuesta lo mismo que Agencia (99).
    expect(choosePlan(10)).toMatchObject({ monthlyCost: 99, extraProjects: 0, plan: { id: "agencia" } });
  });

  it("con el pago anual usa el precio anual por mes", () => {
    expect(choosePlan(10, "anual")).toMatchObject({ monthlyCost: 82, plan: { id: "agencia" } });
  });
});

describe("redondeo", () => {
  it("plata a 5, o a 10 por encima de 1.000, sin cambiar el signo", () => {
    expect(roundMoney(873)).toBe(875);
    expect(roundMoney(1061)).toBe(1060);
    expect(roundMoney(-12)).toBe(-10);
    expect(roundMoney(-2)).toBe(0);
    expect(roundHours(9.6)).toBe(10);
  });

  it("tramos del retorno para medir sin guardar valores", () => {
    expect(roiBucket(0.5)).toBe("hasta-1x");
    expect(roiBucket(2)).toBe("1x-3x");
    expect(roiBucket(5)).toBe("3x-10x");
    expect(roiBucket(12)).toBe("mas-10x");
  });
});

describe("link compartido", () => {
  it("solo guarda lo que cambió y vuelve igual", () => {
    const changed = { ...DEFAULT_INPUTS, clients: 25, hourlyCost: 40 };
    const qs = encodeInputs(changed, { moneda: "UYU" });
    expect(qs).toBe("c=25&h=40&moneda=UYU");
    expect(decodeInputs(new URLSearchParams(qs))).toEqual(changed);
    expect(encodeInputs(DEFAULT_INPUTS)).toBe("");
  });

  it("valores inválidos o fuera de rango no rompen nada", () => {
    const r = decodeInputs(new URLSearchParams("c=500&s=abc&h=&m=-3"));
    expect(r.clients).toBe(100);
    expect(r.simplePct).toBe(DEFAULT_INPUTS.simplePct);
    expect(r.hourlyCost).toBe(DEFAULT_INPUTS.hourlyCost);
    expect(r.minutesPerRequest).toBe(5);
  });
});
