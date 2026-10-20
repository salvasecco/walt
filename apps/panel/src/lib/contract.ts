import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseConfig, type WaltConfig } from "@walt/core";
import bakeryContent from "@walt/core/fixtures/site.json";
import bakerySchema from "@walt/core/fixtures/site.schema.json";
import bakeryConfig from "@walt/core/fixtures/walt.config.json";
import { dataMode, env } from "./env";
import { SEED_PROJECT_ID, type Project } from "./types";

/** El contrato de contenido del sitio (SPEC §6): qué se puede tocar y el JSON Schema del contenido. */
export type Contract = { config: WaltConfig; schema: object };

export type ContractSource = "repo" | "ejemplo" | "ninguno";

const cache = new Map<string, { at: number; contract: Contract }>();
const TTL_MS = 60_000;

const fixture = (): Contract => ({ config: parseConfig(bakeryConfig), schema: bakerySchema as object });

async function readJson(project: Project, path: string): Promise<unknown> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(project.repo_owner)}/${encodeURIComponent(project.repo_name)}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(project.default_branch)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "walt-panel",
        ...(env.githubToken ? { Authorization: `Bearer ${env.githubToken}` } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(`GitHub respondió ${res.status} al leer ${path}`);
  const file = (await res.json()) as { content?: string };
  return JSON.parse(Buffer.from(file.content ?? "", "base64").toString("utf8"));
}

/**
 * Contrato del proyecto, como lo lee el worker (walt.config.json y su schema en la rama principal), con
 * caché de 60 s. Con datos de ejemplo, o si el repo no se puede leer, el proyecto del seed usa el de la panadería.
 */
export async function loadContract(project: Project): Promise<{ contract: Contract | null; source: ContractSource; note?: string }> {
  if (project.mode !== "contenido") return { contract: null, source: "ninguno" };
  const seed = project.id === SEED_PROJECT_ID;
  if (dataMode() === "ejemplo") return { contract: fixture(), source: "ejemplo" };
  const key = `${project.repo_owner}/${project.repo_name}@${project.default_branch}:${project.config_path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { contract: hit.contract, source: "repo" };
  try {
    const config = parseConfig(await readJson(project, project.config_path));
    const schema = (await readJson(project, config.schema)) as object;
    const contract = { config, schema };
    cache.set(key, { at: Date.now(), contract });
    return { contract, source: "repo" };
  } catch (e) {
    const why = e instanceof Error ? e.message : "error";
    if (seed) return { contract: fixture(), source: "ejemplo", note: `No pude leer el contrato del repo (${why}): uso el de la panadería.` };
    return { contract: null, source: "ninguno", note: `No pude leer ${project.config_path} del repo (${why}).` };
  }
}

/** Contenido de la versión viva del proyecto (con datos de ejemplo, el de la panadería). `db`: el cliente de quien mira. */
export async function liveContent(db: SupabaseClient, project: Project): Promise<unknown | null> {
  if (dataMode() === "ejemplo") return structuredClone(bakeryContent);
  const { data, error } = await db
    .from("content_versions")
    .select("content")
    .eq("project_id", project.id)
    .eq("status", "viva")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.content ?? null;
}

export { SEED_PROJECT_ID };
