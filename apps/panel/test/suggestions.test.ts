import { ruleTemplate } from "@walt/core";
import { describe, expect, it } from "vitest";
import { applyPatch, dirGlobs, suggestRules, type LabelLite, type ProjectRules, type RequestLite } from "../src/lib/suggestions";

const P = "p1";
const generic = ruleTemplate("generic").config;
/** La plantilla genérica sin **\/api/**: la API cuenta como simple hasta que la agencia diga otra cosa. */
const rules = (over: Partial<ProjectRules["config"]> = {}, policies: ProjectRules["policies"] = {}): ProjectRules => ({
  config: { ...generic, delicateGlobs: generic.delicateGlobs.filter((g) => g !== "**/api/**"), ...over },
  policies: { set_banner: "auto", toggle_section: "agencia", ...policies },
});

let n = 0;
function code(files: string[], category = "simple", project = P): RequestLite {
  n++;
  return { id: `r${n}`, short_id: `S${n}`, project_id: project, raw_text: `pedido ${n}`, lane: "codigo", category, opTypes: [], files };
}
function content(opTypes: string[], category = "simple"): RequestLite {
  n++;
  return { id: `r${n}`, short_id: `S${n}`, project_id: P, raw_text: `pedido ${n}`, lane: "contenido", category, opTypes, files: [] };
}
const label = (r: RequestLite, to: string, from = r.category, at = "2026-10-10T12:00:00Z"): LabelLite => ({ request_id: r.id, from_category: from, to_category: to, created_at: at });

describe("dirGlobs", () => {
  it("una carpeta por nivel, sin la raíz", () => {
    expect(dirGlobs("app/api/contacto/route.ts").map((g) => g.glob)).toEqual(["app/**", "app/api/**", "app/api/contacto/**"]);
    expect(dirGlobs("./README.md")).toEqual([]);
  });
});

describe("suggestRules: zonas delicadas", () => {
  it("3 pedidos de app/api reetiquetados como delicados proponen app/api/** (el ejemplo del brief)", () => {
    const a = code(["app/api/contacto/route.ts", "components/ContactForm.tsx"]);
    const b = code(["app/api/stock/route.ts"]);
    const c = code(["app/api/reservas/notify/route.ts", "lib/whatsapp.ts"]);
    const map = code(["components/Site.tsx"]); // simple de verdad: no cuenta a favor
    const out = suggestRules({ projectId: P, rules: rules(), labels: [a, b, c].map((r) => label(r, "delicado")), requests: [a, b, c, map] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "glob_delicado", target: "app/api/**", count: 3, patch: { addDelicateGlobs: ["app/api/**"] } });
    expect(out[0].text).toBe("Marcaste 3 pedidos que tocaban app/api/** como delicados. ¿Lo agrego a las zonas delicadas?");
  });

  it("con 2 no alcanza", () => {
    const a = code(["app/api/a/route.ts"]);
    const b = code(["app/api/b/route.ts"]);
    expect(suggestRules({ projectId: P, rules: rules(), labels: [label(a, "delicado"), label(b, "delicado")], requests: [a, b] })).toEqual([]);
  });

  it("un pedido simple que tocó la misma carpeta y la agencia no corrigió cuenta en contra", () => {
    const xs = [code(["app/api/a/route.ts"]), code(["app/api/b/route.ts"]), code(["app/api/c/route.ts"])];
    const ok = code(["app/api/d/route.ts"]);
    const out = suggestRules({ projectId: P, rules: rules(), labels: xs.map((r) => label(r, "delicado")), requests: [...xs, ok] });
    expect(out.find((s) => s.target === "app/api/**")).toBeUndefined();
  });

  it("no propone lo que ya está cubierto ni archivos que ya son delicados", () => {
    const xs = [code(["supabase/migrations/1.sql"]), code(["supabase/migrations/2.sql"]), code(["supabase/migrations/3.sql"])];
    expect(suggestRules({ projectId: P, rules: rules(), labels: xs.map((r) => label(r, "delicado")), requests: xs })).toEqual([]);
    const ys = [code(["app/api/a.ts"]), code(["app/api/b.ts"]), code(["app/api/c.ts"])];
    expect(suggestRules({ projectId: P, rules: rules({ delicateGlobs: ["app/api/**"] }), labels: ys.map((r) => label(r, "delicado")), requests: ys })).toEqual([]);
  });

  it("si una excepción simple le ganaría al glob nuevo, la saca en la misma versión", () => {
    const xs = [code(["app/api/contacto/a.ts"]), code(["app/api/contacto/b.ts"]), code(["app/api/contacto/c.ts"])];
    const out = suggestRules({ projectId: P, rules: rules({ simpleGlobs: ["app/api/contacto/**"] }), labels: xs.map((r) => label(r, "delicado")), requests: xs });
    expect(out[0].patch).toEqual({ addDelicateGlobs: ["app/api/contacto/**"], removeSimpleGlobs: ["app/api/contacto/**"] });
  });

  it("solo cuenta la última etiqueta de cada pedido y solo los pedidos del proyecto", () => {
    const xs = [code(["app/api/a.ts"]), code(["app/api/b.ts"]), code(["app/api/c.ts"])];
    const other = code(["app/api/z.ts"], "simple", "p2");
    const labels = [...xs.map((r) => label(r, "delicado")), label(xs[0], "simple", "delicado", "2026-10-11T12:00:00Z"), label(other, "delicado")];
    expect(suggestRules({ projectId: P, rules: rules(), labels, requests: [...xs, other] })).toEqual([]);
  });
});

describe("suggestRules: excepciones simples", () => {
  it("3 pedidos delicados por una zona de la agencia, reetiquetados a simple, proponen la excepción", () => {
    const cfg = { delicateGlobs: ["app/api/**"] };
    const xs = [code(["app/api/contacto/a.ts"], "delicado"), code(["app/api/contacto/b.ts"], "delicado"), code(["app/api/contacto/c.ts"], "delicado")];
    const out = suggestRules({ projectId: P, rules: rules(cfg), labels: xs.map((r) => label(r, "simple")), requests: xs });
    expect(out[0]).toMatchObject({ kind: "glob_simple", target: "app/api/contacto/**", patch: { addSimpleGlobs: ["app/api/contacto/**"] } });
  });

  it("nunca contra el piso de siempre (base de datos, secretos, dependencias)", () => {
    const xs = [code(["supabase/migrations/1.sql"], "delicado"), code(["supabase/migrations/2.sql"], "delicado"), code(["supabase/migrations/3.sql"], "delicado")];
    expect(suggestRules({ projectId: P, rules: rules(), labels: xs.map((r) => label(r, "simple")), requests: xs })).toEqual([]);
  });
});

describe("suggestRules: políticas de contenido", () => {
  it("3 carteles reetiquetados a delicado proponen que los apruebe la agencia", () => {
    const xs = [content(["set_banner"]), content(["set_banner"]), content(["set_banner", "set_text"])];
    const out = suggestRules({ projectId: P, rules: rules(), labels: xs.map((r) => label(r, "delicado")), requests: xs, opLabel: () => "Cartel de promoción" });
    expect(out.map((s) => s.id)).toEqual([`${P}:politica:set_banner:agencia`]);
    expect(out[0].text).toContain("«Cartel de promoción»");
  });

  it("y al revés: secciones que iban a la agencia, marcadas simples, pasan a simple", () => {
    const xs = [content(["toggle_section"], "riesgoso"), content(["toggle_section"], "delicado"), content(["toggle_section"], "delicado")];
    const out = suggestRules({ projectId: P, rules: rules(), labels: xs.map((r) => label(r, "simple")), requests: xs });
    expect(out[0]).toMatchObject({ kind: "politica", target: "toggle_section", patch: { policies: { toggle_section: "auto" } } });
  });
});

describe("applyPatch", () => {
  it("agrega globs sin repetir, saca excepciones y cambia políticas", () => {
    const r = rules({ delicateGlobs: ["a/**"], simpleGlobs: ["b/**", "c/**"] });
    const out = applyPatch(r, { addDelicateGlobs: ["a/**", "d/**"], removeSimpleGlobs: ["b/**"], addSimpleGlobs: ["e/**"], policies: { set_banner: "agencia" } });
    expect(out.config.delicateGlobs).toEqual(["a/**", "d/**"]);
    expect(out.config.simpleGlobs).toEqual(["c/**", "e/**"]);
    expect(out.policies.set_banner).toBe("agencia");
  });
});
