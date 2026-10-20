// Sugerencias de reglas a partir de los reetiquetados de la agencia (brief §2): «Marcaste 3 pedidos que tocaban
// app/api/** como delicados. ¿Lo agrego a las reglas?». Funciones puras, con pruebas.
import { delicatePaths, matchGlob, normalizePath, type Policy, type RulesConfig } from "@walt/core/browser";
import { normalizeCategory } from "./taxonomy";

/** Cuántos pedidos reetiquetados hacen falta para proponer una regla. */
export const SUGGESTION_THRESHOLD = 3;

export type LabelLite = { request_id: string; from_category: string | null; to_category: string; created_at: string };

export type RequestLite = {
  id: string;
  short_id: string;
  project_id: string;
  raw_text: string;
  lane: "contenido" | "codigo" | null;
  category: string | null;
  /** Tipos de operación de contenido del pedido. */
  opTypes: string[];
  /** Archivos que tocó el agente (evento agente_pr), si fue por código. */
  files: string[];
};

export type ProjectRules = { config: RulesConfig; policies: Record<string, Policy> };

/** Lo que cambia en las reglas al aceptar la sugerencia. */
export type RulesPatch = {
  addDelicateGlobs?: string[];
  removeSimpleGlobs?: string[];
  addSimpleGlobs?: string[];
  policies?: Record<string, Policy>;
};

export type RuleSuggestion = {
  /** Estable: sirve para aplicarla desde el servidor sin confiar en lo que mande el navegador. */
  id: string;
  projectId: string;
  kind: "glob_delicado" | "glob_simple" | "politica";
  /** «Marcaste 3 pedidos que tocaban app/api/** como delicados. ¿Lo agrego a las reglas?» */
  text: string;
  /** El glob o el tipo de operación. */
  target: string;
  count: number;
  requests: { shortId: string; text: string }[];
  patch: RulesPatch;
};

type Candidate = { glob: string; depth: number; positives: Set<string>; negatives: Set<string> };

/** `app/api/contacto/route.ts` → `app/**`, `app/api/**`, `app/api/contacto/**`. Los archivos de la raíz no dan carpeta. */
export function dirGlobs(path: string): { glob: string; depth: number }[] {
  const parts = normalizePath(path).split("/").filter(Boolean);
  const out: { glob: string; depth: number }[] = [];
  for (let i = 1; i < parts.length; i++) out.push({ glob: `${parts.slice(0, i).join("/")}/**`, depth: i });
  return out;
}

/** La última etiqueta de cada pedido. */
export function latestByRequest<T extends LabelLite>(labels: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const l of labels) {
    const prev = out.get(l.request_id);
    if (!prev || l.created_at >= prev.created_at) out.set(l.request_id, l);
  }
  return out;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Elige, entre las carpetas de los archivos, la más específica que junta al menos `threshold` pedidos
 * a favor y ninguno en contra. Así «app/api/**» gana a «app/**» (que también tocaría lo simple).
 */
function bestGlobs(candidates: Map<string, Candidate>, threshold: number): Candidate[] {
  const ok = [...candidates.values()].filter((c) => c.positives.size >= threshold && c.negatives.size === 0);
  // Si dos candidatos juntan los mismos pedidos, queda el más profundo.
  const chosen: Candidate[] = [];
  for (const c of ok.sort((a, b) => b.depth - a.depth || b.positives.size - a.positives.size)) {
    const covered = chosen.some((x) => [...c.positives].every((id) => x.positives.has(id)) && x.glob.startsWith(c.glob.slice(0, -2)));
    if (!covered) chosen.push(c);
  }
  return chosen;
}

/**
 * Sugerencias para un proyecto:
 * - glob delicado: pedidos de código reetiquetados a delicado cuyos archivos hoy no son delicados → la carpeta común.
 * - glob simple: pedidos reetiquetados a simple cuyos archivos son delicados solo por las zonas de la agencia
 *   (nunca por el piso de siempre ni por los protegidos) → excepción simple.
 * - política: pedidos de contenido reetiquetados → ese tipo de cambio pasa a «lo aprueba la agencia» o a simple.
 * En contra cuentan los pedidos del mismo período que quedaron con la otra categoría.
 */
export function suggestRules(input: {
  projectId: string;
  rules: ProjectRules;
  labels: LabelLite[];
  /** Pedidos del proyecto en el período: los reetiquetados y los demás (para la evidencia en contra). */
  requests: RequestLite[];
  opLabel?: (opType: string) => string;
  threshold?: number;
}): RuleSuggestion[] {
  const { projectId, rules } = input;
  const threshold = input.threshold ?? SUGGESTION_THRESHOLD;
  const opLabel = input.opLabel ?? ((t: string) => t);
  const requests = input.requests.filter((r) => r.project_id === projectId);
  const byId = new Map(requests.map((r) => [r.id, r]));
  const latest = latestByRequest(input.labels.filter((l) => byId.has(l.request_id)));
  /** La categoría que vale: la de la agencia si la reetiquetó, si no la de Walt. */
  const finalOf = (r: RequestLite) => normalizeCategory(latest.get(r.id)?.to_category ?? r.category);
  const relabeledTo = (r: RequestLite, to: string) => {
    const l = latest.get(r.id);
    return !!l && normalizeCategory(l.to_category) === to && normalizeCategory(l.from_category) !== to;
  };
  const out: RuleSuggestion[] = [];
  const sample = (ids: Set<string>) =>
    [...ids]
      .map((id) => byId.get(id)!)
      .slice(0, 5)
      .map((r) => ({ shortId: r.short_id, text: r.raw_text }));

  // ── Zonas delicadas ──
  const delicate = new Map<string, Candidate>();
  for (const r of requests) {
    if (!r.files.length) continue;
    const up = relabeledTo(r, "delicado");
    const isSimple = finalOf(r) === "simple";
    if (!up && !isSimple) continue;
    // Solo los archivos que hoy no son delicados: los demás ya están cubiertos por las reglas.
    const covered = new Set(delicatePaths(r.files, rules.config).map((p) => p.path));
    for (const f of r.files) {
      if (covered.has(normalizePath(f))) continue;
      for (const { glob, depth } of dirGlobs(f)) {
        const c = delicate.get(glob) ?? { glob, depth, positives: new Set<string>(), negatives: new Set<string>() };
        (up ? c.positives : c.negatives).add(r.id);
        delicate.set(glob, c);
      }
    }
  }
  for (const c of bestGlobs(delicate, threshold)) {
    if (rules.config.delicateGlobs.includes(c.glob)) continue;
    // Si una excepción simple le gana al glob nuevo en esos archivos, se saca en la misma versión.
    const files = [...c.positives].flatMap((id) => byId.get(id)!.files).filter((f) => matchGlob(f, c.glob));
    const after = { ...rules.config, delicateGlobs: [...rules.config.delicateGlobs, c.glob] };
    const stillSimple = files.filter((f) => delicatePaths([f], after).length === 0);
    const removeSimple = rules.config.simpleGlobs.filter((g) => stillSimple.some((f) => matchGlob(f, g)));
    const n = c.positives.size;
    out.push({
      id: `${projectId}:glob_delicado:${c.glob}`,
      projectId,
      kind: "glob_delicado",
      target: c.glob,
      count: n,
      text: `Marcaste ${n} ${plural(n, "pedido", "pedidos")} que tocaban ${c.glob} como ${plural(n, "delicado", "delicados")}. ¿Lo agrego a las zonas delicadas?${removeSimple.length ? ` (y saco ${removeSimple.join(", ")} de las simples)` : ""}`,
      requests: sample(c.positives),
      patch: { addDelicateGlobs: [c.glob], ...(removeSimple.length ? { removeSimpleGlobs: removeSimple } : {}) },
    });
  }

  // ── Excepciones simples ──
  const simple = new Map<string, Candidate>();
  for (const r of requests) {
    if (!r.files.length) continue;
    const down = relabeledTo(r, "simple");
    const isDelicate = finalOf(r) === "delicado";
    if (!down && !isDelicate) continue;
    // Solo lo delicado por las zonas de la agencia: el piso y los protegidos no tienen excepción.
    for (const p of delicatePaths(r.files, rules.config)) {
      if (p.zone !== "agencia") continue;
      for (const { glob, depth } of dirGlobs(p.path)) {
        const c = simple.get(glob) ?? { glob, depth, positives: new Set<string>(), negatives: new Set<string>() };
        (down ? c.positives : c.negatives).add(r.id);
        simple.set(glob, c);
      }
    }
  }
  for (const c of bestGlobs(simple, threshold)) {
    if (rules.config.simpleGlobs.includes(c.glob)) continue;
    const n = c.positives.size;
    out.push({
      id: `${projectId}:glob_simple:${c.glob}`,
      projectId,
      kind: "glob_simple",
      target: c.glob,
      count: n,
      text: `Marcaste ${n} ${plural(n, "pedido", "pedidos")} que tocaban ${c.glob} como ${plural(n, "simple", "simples")}. ¿Lo agrego como excepción simple?`,
      requests: sample(c.positives),
      patch: { addSimpleGlobs: [c.glob] },
    });
  }

  // ── Políticas por tipo de cambio de contenido ──
  const policy = new Map<string, { up: Set<string>; down: Set<string> }>();
  for (const r of requests) {
    if (!r.opTypes.length || r.files.length) continue;
    const up = relabeledTo(r, "delicado");
    const down = relabeledTo(r, "simple");
    if (!up && !down) continue;
    for (const t of new Set(r.opTypes)) {
      const e = policy.get(t) ?? { up: new Set<string>(), down: new Set<string>() };
      (up ? e.up : e.down).add(r.id);
      policy.set(t, e);
    }
  }
  for (const [t, e] of policy) {
    const current = rules.policies[t] ?? "agencia";
    if (e.up.size >= threshold && e.down.size === 0 && current === "auto") {
      out.push({
        id: `${projectId}:politica:${t}:agencia`,
        projectId,
        kind: "politica",
        target: t,
        count: e.up.size,
        text: `Marcaste ${e.up.size} pedidos de «${opLabel(t)}» como delicados. ¿Paso ese tipo de cambio a que lo apruebe la agencia?`,
        requests: sample(e.up),
        patch: { policies: { [t]: "agencia" } },
      });
    }
    if (e.down.size >= threshold && e.up.size === 0 && current === "agencia") {
      out.push({
        id: `${projectId}:politica:${t}:auto`,
        projectId,
        kind: "politica",
        target: t,
        count: e.down.size,
        text: `Marcaste ${e.down.size} pedidos de «${opLabel(t)}» como simples. ¿Paso ese tipo de cambio a simple, sin la agencia?`,
        requests: sample(e.down),
        patch: { policies: { [t]: "auto" } },
      });
    }
  }
  return out.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/** Aplica la sugerencia a las reglas (para crear la versión nueva). No repite globs. */
export function applyPatch<T extends ProjectRules>(rules: T, patch: RulesPatch): T {
  const uniq = (xs: string[]) => [...new Set(xs)];
  const remove = new Set(patch.removeSimpleGlobs ?? []);
  return {
    ...rules,
    policies: { ...rules.policies, ...(patch.policies ?? {}) },
    config: {
      ...rules.config,
      delicateGlobs: uniq([...rules.config.delicateGlobs, ...(patch.addDelicateGlobs ?? [])]),
      simpleGlobs: uniq([...rules.config.simpleGlobs.filter((g) => !remove.has(g)), ...(patch.addSimpleGlobs ?? [])]),
    },
  };
}
