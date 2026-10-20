import { describe, expect, it } from "vitest";
import { atLeast, can, isRole, memberChangeError } from "../src/lib/roles";

describe("can", () => {
  it("member opera, admin configura y maneja el equipo, owner cambia roles", () => {
    expect(can("member", "operar")).toBe(true);
    expect(can("member", "configurar")).toBe(false);
    expect(can("admin", "configurar")).toBe(true);
    expect(can("admin", "equipo")).toBe(true);
    expect(can("admin", "roles")).toBe(false);
    expect(can("owner", "roles")).toBe(true);
  });

  it("atLeast e isRole", () => {
    expect(atLeast("owner", "admin")).toBe(true);
    expect(atLeast("member", "admin")).toBe(false);
    expect(isRole("admin")).toBe(true);
    expect(isRole("superadmin")).toBe(false);
  });
});

describe("memberChangeError", () => {
  it("un admin saca miembros pero no admins ni dueños", () => {
    expect(memberChangeError("admin", "member", null, 1, false)).toBeNull();
    expect(memberChangeError("admin", "admin", null, 1, false)).toMatch(/dueño/);
    expect(memberChangeError("member", "member", null, 1, false)).toMatch(/admin/);
  });

  it("siempre queda al menos un dueño", () => {
    expect(memberChangeError("owner", "owner", null, 1, true)).toMatch(/al menos un dueño/);
    expect(memberChangeError("owner", "owner", "admin", 1, true)).toMatch(/único dueño/);
    expect(memberChangeError("owner", "owner", "admin", 2, true)).toBeNull();
  });

  it("solo el dueño cambia roles", () => {
    expect(memberChangeError("admin", "member", "admin", 1, false)).toMatch(/Solo el dueño/);
    expect(memberChangeError("owner", "member", "admin", 1, false)).toBeNull();
  });
});
