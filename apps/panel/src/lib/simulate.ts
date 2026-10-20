import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAi, simulateRequest } from "@walt/ai";
import {
  costUsd,
  delicatePathReason,
  delicatePaths,
  exampleFromLabelRow,
  loadEnv,
  redact,
  rulesConfig,
  type Category,
  type LabeledExample,
  type LabeledRequestRow,
  type Op,
  type Rules,
} from "@walt/core";
import { loadContract, liveContent } from "./contract";
import { dataMode } from "./env";
import { describeChange, describeOp } from "./labels";
import { isMissingFunction } from "./session";
import type { Project, SiteContent } from "./types";

/** Lo que el simulador muestra: cómo se clasificaría el pedido y por qué. Nada se guarda ni se manda. */
export type SimulationResult = {
  category: Category;
  lane: "contenido" | "codigo" | null;
  reasons: string[];
  warnings: string[];
  /** Walt le preguntaría al cliente en vez de armar algo. */
  clarify: boolean;
  question: string | null;
  kind: string;
  summary: string;
  why: string | null;
  confidence: number;
  ops: string[];
  changes: { label: string; before: string; after: string }[];
  needsCode: boolean;
  codeInstruction: string | null;
  /** Dos lecturas concretas que el cliente vería como opciones (en vez de una sola vista previa). */
  options: { label: string; ops: string[]; warnings: string[] }[];
  gate: { outcome: string; reasons: string[] } | null;
  /** Archivos que probó la agencia: cuáles son delicados según las reglas en edición. */
  paths: { path: string; glob: string; zone: string; reason: string }[];
  /** La categoría subió a delicado por las rutas (la mitad determinística de la doble clasificación). */
  raisedByPaths: boolean;
  provider: string;
  model: string;
  costUsd: number;
  ms: number;
  examples: number;
  contract: "repo" | "ejemplo" | "ninguno";
  notes: string[];
};

/** Ahora en Montevideo con su offset (UTC−3, sin horario de verano desde 2015), como lo pasa el worker. */
function montevideoNow(now = Date.now()): string {
  return new Date(now - 3 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

/** El proveedor del worker. En Vercel el panel puede no tener LLM_PROVIDER: con ANTHROPIC_API_KEY usa el modelo real. */
function aiEnv() {
  const env = loadEnv({ fallbackToFake: true });
  const provider = process.env.LLM_PROVIDER ? env.LLM_PROVIDER : env.ANTHROPIC_API_KEY ? "anthropic" : "fake";
  return { ...env, LLM_PROVIDER: provider as typeof env.LLM_PROVIDER };
}

/**
 * Reetiquetados de la misma agencia, del más parecido al menos (RPC de la 0004, security invoker: con la sesión
 * de quien mira, la RLS solo le deja ver los de su agencia). Sin la 0004, ninguno.
 */
async function similarExamples(db: SupabaseClient, factoryId: string, text: string): Promise<LabeledExample[]> {
  if (dataMode() !== "supabase") return [];
  const { data, error } = await db.rpc("similar_labeled_requests", { p_factory: factoryId, p_text: text, p_k: 8 });
  if (error) {
    if (isMissingFunction(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as LabeledRequestRow[]).flatMap((r) => {
    const example = exampleFromLabelRow(r);
    return example ? [example] : [];
  });
}

/**
 * Corre `simulateRequest` de @walt/ai (interpretación real, gate, opciones y `decide`, los mismos pasos que el
 * worker) con las reglas en edición, el contrato del sitio, la versión viva y los reetiquetados parecidos de la
 * agencia, sin guardar nada ni mandar mensajes. Con rutas, suma la mitad determinística de la doble
 * clasificación (lo que diría la revisión del diff de un cambio de código).
 */
export async function simulate(input: {
  db: SupabaseClient;
  project: Project;
  agencyName: string;
  text: string;
  rules: Rules;
  paths: string[];
  /** Token de GitHub que puede usar quien simula (`githubTokenFor`). */
  githubToken: string;
}): Promise<SimulationResult> {
  const { project, text, rules, paths } = input;
  const started = Date.now();
  const env = aiEnv();
  const notes: string[] = [];
  const [{ contract, source, note }, content, examples] = await Promise.all([
    loadContract(project, input.githubToken),
    project.mode === "contenido" ? liveContent(input.db, project) : Promise.resolve(null),
    similarExamples(input.db, project.factory_id, text).catch(() => [] as LabeledExample[]),
  ]);
  if (note) notes.push(note);
  if (project.mode === "contenido" && !content) notes.push("El proyecto no tiene versión viva: interpreto sin el inventario del sitio.");

  const ai = createAi(env);
  let sim: Awaited<ReturnType<typeof simulateRequest>>;
  try {
    sim = await simulateRequest({
      ai,
      text,
      rules,
      content: contract && content ? { config: contract.config, content, schema: contract.schema } : undefined,
      agencyName: input.agencyName,
      clientName: project.client_name,
      now: montevideoNow(),
      examples,
      secrets: env.secrets,
      paths,
    });
  } catch (e) {
    throw new Error(`La IA no respondió: ${redact(e instanceof Error ? e.message : String(e), env.secrets).slice(0, 240)}`);
  }
  const { interpretation, gate, decision } = sim;

  // Doble clasificación: si el diff tocara una zona delicada, el pedido sube a delicado. Nunca baja solo.
  const raisedByPaths = sim.diff?.category === "delicado" && decision.category === "simple";
  const category: Category = raisedByPaths ? "delicado" : decision.category;
  const reasons = [...decision.reasons, ...(raisedByPaths ? sim.diff!.reasons : [])];
  const found = paths.length ? delicatePaths(paths, rulesConfig(rules)) : [];

  const before = (content ?? null) as SiteContent | null;
  return {
    category,
    lane: decision.lane,
    reasons,
    warnings: decision.warnings,
    clarify: !!decision.clarify,
    question: interpretation.question?.trim() || null,
    kind: interpretation.kind,
    summary: interpretation.summary,
    why: interpretation.why?.trim() || null,
    confidence: interpretation.confidence,
    ops: interpretation.ops.map((op: Op) => describeOp(op, before)),
    changes: (gate?.changes ?? []).slice(0, 30).map((c) => describeChange(c, before)),
    needsCode: interpretation.needsCode,
    codeInstruction: interpretation.codeInstruction?.trim() || null,
    options: (sim.options ?? []).map((o) => ({ label: o.label, ops: o.ops.map((op) => describeOp(op, before)), warnings: o.warnings })),
    gate: gate ? { outcome: gate.outcome, reasons: gate.reasons } : null,
    paths: found.map((p) => ({ ...p, reason: delicatePathReason(p) })),
    raisedByPaths,
    provider: ai.name,
    model: sim.usage.model,
    costUsd: costUsd(sim.usage),
    ms: Date.now() - started,
    examples: examples.length,
    contract: source,
    notes: [...notes, ...(ai.name === "fake" ? ["IA de prueba: falta ANTHROPIC_API_KEY en este entorno."] : [])],
  };
}

/** Solo la mitad determinística: qué rutas serían delicadas, protegidas o simples con estas reglas. */
export function classifyPaths(paths: string[], rules: Pick<Rules, "config">) {
  const config = rulesConfig(rules);
  const found = delicatePaths(paths, config);
  const byPath = new Map(found.map((p) => [p.path, p]));
  return paths.map((path) => {
    const hit = byPath.get(path.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, ""));
    return hit ? { path, zone: hit.zone as string, glob: hit.glob, reason: delicatePathReason(hit) } : { path, zone: "simple", glob: null, reason: "No toca zonas delicadas: puede ser simple" };
  });
}
