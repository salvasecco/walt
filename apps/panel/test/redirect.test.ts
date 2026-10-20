import { describe, expect, it } from "vitest";
import { isPublicPath, isSupabaseAuthCookie, landingRedirect, safeRedirect } from "../src/lib/redirect";

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

  it("la landing y lo que necesita para compartirse se ven sin sesión", () => {
    for (const p of ["/", "/legal/terminos", "/legal/privacidad", "/api/eventos", "/robots.txt", "/sitemap.xml", "/opengraph-image", "/opengraph-image-1a2b3c"]) {
      expect(isPublicPath(p)).toBe(true);
    }
    for (const p of ["/en-vivo", "/atencion", "/api/otra", "/legal"]) expect(isPublicPath(p)).toBe(false);
  });
});

describe("landingRedirect", () => {
  const q = (s = "") => new URLSearchParams(s);
  it("sin sesión, la landing; con sesión, Atención", () => {
    expect(landingRedirect("/", q(), false)).toBeNull();
    expect(landingRedirect("/", q(), true)).toBe("/atencion");
  });
  it("con sesión se puede ver la landing pidiéndola, y no toca otras rutas", () => {
    expect(landingRedirect("/", q("landing"), true)).toBeNull();
    expect(landingRedirect("/reglas", q(), true)).toBeNull();
  });
});
