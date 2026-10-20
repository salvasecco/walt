import { describe, expect, it } from "vitest";
import { isPublicPath, isSupabaseAuthCookie, safeRedirect } from "../src/lib/redirect";

describe("safeRedirect", () => {
  it("deja pasar rutas del panel", () => {
    expect(safeRedirect("/reglas?proyecto=1")).toBe("/reglas?proyecto=1");
    expect(safeRedirect("/historial/A7K2#x")).toBe("/historial/A7K2#x");
  });

  it("rechaza otros orígenes y rutas raras", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, undefined]) expect(safeRedirect(bad)).toBe("/atencion");
    expect(safeRedirect("//evil.com", "/")).toBe("/");
  });
});

describe("isSupabaseAuthCookie", () => {
  it("reconoce la cookie de sesión, también partida", () => {
    expect(isSupabaseAuthCookie("sb-abcd1234-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abcd1234-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abcd1234-auth-token-code-verifier")).toBe(false);
    expect(isSupabaseAuthCookie("walt_panel")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it("entrar, registro y auth se ven sin sesión", () => {
    expect(isPublicPath("/entrar")).toBe(true);
    expect(isPublicPath("/registro")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
    expect(isPublicPath("/reglas")).toBe(false);
    expect(isPublicPath("/registro/agencia")).toBe(false);
  });
});
