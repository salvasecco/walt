import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAi } from "@walt/ai";
import {
  buildInventory,
  costUsd,
  decide,
  delicatePathReason,
  delicatePaths,
  loadEnv,
  normalizeCategory as coreNormalize,
  parseInterpretation,
  redact,
  rulesConfig,
  runGate,
  type Category,
  type GateResult,
  type Inventory,
  type LabeledExample,
  type Op,
  type Rules,
} from "@walt/core";
import { loadContract, liveContent } from "./contract";
import { dataMode } from "./env";
import { describeChange, describeOp } from "./labels";
import { isMissingFunction } from "./session";
import type { Project, SiteContent } from "./types";

const EMPTY_INVENTORY: Inventory = { currency: "", texts: [], colors: [], products: [], categories: [], banner: null, hours: null, sections: null };

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
  return ((data ?? []) as { raw_text: string; from_category: string | null; to_category: string; reason: string | null }[]).flatMap((r) => {
    const category = coreNormalize(r.to_category);
    return category ? [{ text: r.raw_text, category, previous: coreNormalize(r.from_category), reason: r.reason }] : [];
  });
}

/**
 * Corre la interpretación real de @walt/ai y `decide` de @walt/core con las reglas en edición, igual que el
 * worker (contrato del sitio, versión viva, gate), sin guardar nada ni mandar mensajes. Si se pasan rutas,
 * aplica también la mitad determinística de la doble clasificación (`delicatePaths`).
 */
export async function simulate(input: { db: SupabaseClient; project: Project; agencyName: string; text: string; rules: Rules; paths: string[] }): Promise<SimulationResult> {
  const { project, text, rules, paths } = input;
  const started = Date.now();
  const env = aiEnv();
  const notes: string[] = [];
  const [{ contract, source, note }, content, examples] = await Promise.all([
    loadContract(project),
    project.mode === "contenido" ? liveContent(input.db, project) : Promise.resolve(null),
    similarExamples(input.db, project.factory_id, text).catch(() => [] as LabeledExample[]),
  ]);
  if (note) notes.push(note);
  if (project.mode === "contenido" && !content) notes.push("El proyecto no tiene versión viva: interpreto sin el inventario del sitio.");
  const inventory = contract && content ? buildInventory(contract.config, content) : EMPTY_INVENTORY;
  const config = rulesConfig(rules);

  const ai = createAi(env);
  // policyText, alwaysNew y examples son parte de la interpretación R1 (sesión de taxonomía): se pasan siempre.
  const request = {
    inventory,
    history: [],
    text,
    agencyName: input.agencyName,
    clientName: project.client_name,
    now: montevideoNow(),
    policyText: rules.policy_text ?? "",
    alwaysNew: config.alwaysNew,
    examples,
  };
  let raw: Awaited<ReturnType<typeof ai.interpret>>;
  try {
    raw = await ai.interpret(request);
  } catch (e) {
    throw new Error(`La IA no respondió: ${redact(e instanceof Error ? e.message : String(e), env.secrets).slice(0, 240)}`);
  }
  const interpretation = parseInterpretation(raw.interpretation);

  let gate: GateResult | null = null;
  const change = interpretation.kind === "simple" || interpretation.kind === "delicado";
  if (change && interpretation.ops.length > 0 && contract && content) {
    gate = runGate({ config: contract.config, content, schema: contract.schema, ops: interpretation.ops, rules, secrets: env.secrets });
  }
  const decision = decide(interpretation, gate, rules, { rawText: text, projectMode: project.mode, hasOpenRequest: false });

  // Doble clasificación: si el cambio tocara una zona delicada, sube a delicado. Nunca baja solo.
  const found = paths.length ? delicatePaths(paths, config) : [];
  const raisedByPaths = found.length > 0 && decision.category === "simple";
  const category: Category = raisedByPaths ? "delicado" : decision.category;
  const reasons = [...decision.reasons, ...(raisedByPaths ? found.map(delicatePathReason) : [])];

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
    gate: gate ? { outcome: gate.outcome, reasons: gate.reasons } : null,
    paths: found.map((p) => ({ ...p, reason: delicatePathReason(p) })),
    raisedByPaths,
    provider: ai.name,
    model: raw.usage.model,
    costUsd: costUsd(raw.usage),
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
