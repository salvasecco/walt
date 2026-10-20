import { describe, expect, it } from "vitest";
import { categoryVariants, isDecided, isPendingAgency, normalizeCategory, resolvedWithoutAgency } from "../src/lib/taxonomy";

describe("normalizeCategory", () => {
  it("lee los valores viejos con el nombre nuevo", () => {
    expect(normalizeCategory("permitido")).toBe("simple");
    expect(normalizeCategory("riesgoso")).toBe("delicado");
    expect(normalizeCategory("fuera_de_alcance")).toBe("nuevo");
  });

  it("deja igual los nuevos y los internos", () => {
    for (const c of ["simple", "delicado", "nuevo", "consulta", "bloqueado", "charla", "derivado"]) expect(normalizeCategory(c)).toBe(c);
  });

  it("null para vacío o desconocido", () => {
    expect(normalizeCategory(null)).toBeNull();
    expect(normalizeCategory("")).toBeNull();
    expect(normalizeCategory("otra")).toBeNull();
  });
});

describe("categoryVariants", () => {
  it("busca el valor nuevo y el viejo equivalente", () => {
    expect(categoryVariants("simple")).toEqual(["simple", "permitido"]);
    expect(categoryVariants("delicado")).toEqual(["delicado", "riesgoso"]);
    expect(categoryVariants("nuevo")).toEqual(["nuevo", "fuera_de_alcance"]);
    expect(categoryVariants("consulta")).toEqual(["consulta"]);
  });
});

describe("isPendingAgency", () => {
  it("solo lo delicado que espera a la agencia", () => {
    expect(isPendingAgency({ status: "esperando_agencia", category: "delicado" })).toBe(true);
    expect(isPendingAgency({ status: "agente_listo", category: "riesgoso" })).toBe(true);
    expect(isPendingAgency({ status: "agente_listo", category: "simple" })).toBe(false);
    expect(isPendingAgency({ status: "esperando_agencia", category: "permitido" })).toBe(false);
    expect(isPendingAgency({ status: "esperando_cliente", category: "delicado" })).toBe(false);
  });
});

describe("resolvedWithoutAgency e isDecided", () => {
  it("simple, consulta, charla y bloqueado se resuelven sin la agencia", () => {
    expect(["permitido", "simple", "consulta", "charla", "bloqueado"].every(resolvedWithoutAgency)).toBe(true);
    expect(["delicado", "riesgoso", "nuevo", "derivado", null].some(resolvedWithoutAgency)).toBe(false);
  });

  it("decididos: las categorías que la agencia puede corregir", () => {
    expect(["simple", "riesgoso", "nuevo", "consulta", "bloqueado"].every(isDecided)).toBe(true);
    expect(["charla", "derivado", null].some(isDecided)).toBe(false);
  });
});
