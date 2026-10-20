"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { dataMode, env } from "@/lib/env";
import { insertRulesVersion, toEditable } from "@/lib/rules";
import { AccessError, requireProject, requireRequest, requireViewer } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { CommandType } from "@/lib/types";
import { SEED_FACTORY_ID } from "@/lib/types";

export type ActionResult<T = undefined> =
  | { ok: true; demo?: boolean; message?: string; data?: T }
  | { ok: false; error: string };

const DEMO_MSG = "Datos de ejemplo: no se guardó nada. Conectá Supabase para que llegue al worker.";
const SAMPLE_MSG = "Es un pedido de ejemplo: no se manda al worker.";


// ── Comandos (SPEC §9): el worker los lee cada segundo ────────────────────

export async function sendCommand(
  type: CommandType,
  requestId: string | null,
  payload: Record<string, unknown> = {},
): Promise<ActionResult> {
  try {
    // El pedido tiene que ser de la agencia de quien aprieta el botón.
    const target = requestId ? (await requireRequest(requestId)).request : (await requireViewer(), null);
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: DEMO_MSG };
    // Pedidos de ejemplo (migración 0003): nunca llegan al worker.
    if (target?.is_sample) return { ok: true, demo: true, message: SAMPLE_MSG };
    const { error } = await supabaseAdmin()
      .from("commands")
      .insert({ type, request_id: requestId, payload: { via: "panel", actor: "agencia", ...payload }, status: "pendiente" });
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true, message: "Enviado al worker." };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

// ── Proyectos ─────────────────────────────────────────────────────────────

export type RepoCheck = {
  owner: string;
  repo: string;
  branch: string;
  reachable: boolean;
  private?: boolean;
  defaultBranch?: string;
  hasConfig: boolean;
  mode: "contenido" | "codigo";
  configSummary?: string;
  authenticated: boolean;
  notes: string[];
};

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}$/;

export async function testRepoConnection(input: { owner: string; repo: string; branch: string }): Promise<ActionResult<RepoCheck>> {
  try {
    await requireViewer("configurar");
    const owner = input.owner.trim();
    const repo = input.repo.trim().replace(/\.git$/, "");
    const branch = input.branch.trim() || "main";
    if (!REPO_RE.test(owner) || !REPO_RE.test(repo) || !/^[A-Za-z0-9_./-]{1,200}$/.test(branch))
      return { ok: false, error: "Revisá owner, repo y rama: solo letras, números, guiones y puntos." };
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "walt-panel",
    };
    const authenticated = !!env.githubToken;
    if (authenticated) headers.Authorization = `Bearer ${env.githubToken}`;
    const notes: string[] = [];
    if (!authenticated) notes.push("Sin GITHUB_TOKEN: la prueba solo ve repos públicos y el worker no va a poder escribir.");

    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) {
      const why = r.status === 404 ? "No existe o el token no tiene acceso." : r.status === 401 ? "El token no es válido." : r.status === 403 ? "GitHub limitó las consultas o el token no tiene permiso." : `GitHub respondió ${r.status}.`;
      return { ok: true, data: { owner, repo, branch, reachable: false, hasConfig: false, mode: "codigo", authenticated, notes: [why, ...notes] } };
    }
    const meta = (await r.json()) as { private: boolean; default_branch: string; permissions?: { push?: boolean } };
    if (authenticated && meta.permissions && !meta.permissions.push) notes.push("El token puede leer pero no escribir en este repo.");

    const c = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/walt.config.json?ref=${encodeURIComponent(branch)}`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    let hasConfig = false;
    let configSummary: string | undefined;
    if (c.ok) {
      const file = (await c.json()) as { content?: string; encoding?: string };
      try {
        const cfg = JSON.parse(Buffer.from(file.content ?? "", "base64").toString("utf8")) as {
          version?: number;
          content?: string;
          texts?: Record<string, string>;
          colors?: Record<string, string>;
          products?: unknown;
        };
        hasConfig = cfg.version === 1 && typeof cfg.content === "string";
        configSummary = hasConfig
          ? `Contenido en ${cfg.content}: ${Object.keys(cfg.texts ?? {}).length} textos, ${Object.keys(cfg.colors ?? {}).length} colores${cfg.products ? ", productos" : ""}.`
          : "walt.config.json existe pero no tiene version 1 y content.";
        if (!hasConfig) notes.push(configSummary);
      } catch {
        notes.push("walt.config.json no es JSON válido.");
      }
    } else if (c.status !== 404) {
      notes.push(`No se pudo leer walt.config.json (GitHub ${c.status}).`);
    }
    return {
      ok: true,
      data: {
        owner,
        repo,
        branch,
        reachable: true,
        private: meta.private,
        defaultBranch: meta.default_branch,
        hasConfig,
        mode: hasConfig ? "contenido" : "codigo",
        configSummary,
        authenticated,
        notes,
      },
    };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function connectProject(input: {
  name: string;
  clientName: string;
  owner: string;
  repo: string;
  branch: string;
  siteUrl: string;
  mode: "contenido" | "codigo";
}): Promise<ActionResult<{ id: string }>> {
  try {
    const viewer = await requireViewer("configurar");
    if (!input.name.trim() || !REPO_RE.test(input.owner) || !REPO_RE.test(input.repo)) return { ok: false, error: "Completá nombre, owner y repo." };
    if (input.siteUrl && !/^https:\/\//.test(input.siteUrl)) return { ok: false, error: "La URL del sitio tiene que empezar con https://" };
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: DEMO_MSG, data: { id: "demo" } };
    const db = supabaseAdmin();
    // El proyecto va a la agencia activa; con el acceso de la instancia (sin agencias por usuario), a la primera.
    let factoryId = viewer.factory?.id ?? null;
    if (!factoryId) {
      const { data: first } = await db.from("factories").select("id").order("created_at").limit(1).maybeSingle();
      factoryId = first?.id ?? SEED_FACTORY_ID;
    }
    const { data, error } = await db
      .from("projects")
      .insert({
        factory_id: factoryId,
        name: input.name.trim(),
        client_name: input.clientName.trim() || input.name.trim(),
        repo_owner: input.owner,
        repo_name: input.repo,
        default_branch: input.branch || "main",
        mode: input.mode,
        site_url: input.siteUrl || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Reglas v1: las de por defecto del R1 (plantilla genérica; la agencia elige la de su stack en Reglas).
    await insertRulesVersion(data.id, toEditable(null), viewer.email ?? "panel");
    revalidatePath("/proyectos");
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export type InviteQR = { role: "cliente" | "agencia"; link: string; svg: string; expiresAt: string; maxUses: number };

export async function createInvites(projectId: string): Promise<ActionResult<InviteQR[]>> {
  try {
    await requireProject(projectId, "configurar");
    const bot = env.botUsername || "tu_bot";
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const roles = ["cliente", "agencia"] as const;
    const invites = roles.map((role) => ({ role, token: randomBytes(12).toString("base64url"), max_uses: 5, expires_at: expiresAt }));
    const demo = dataMode() === "ejemplo";
    if (!demo) {
      const { error } = await supabaseAdmin()
        .from("invites")
        .insert(invites.map((i) => ({ ...i, project_id: projectId })));
      if (error) throw new Error(error.message);
    }
    const data = await Promise.all(
      invites.map(async (i) => {
        const link = `https://t.me/${bot}?start=${i.token}`;
        const svg = await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#05060A", light: "#FFFFFF" } });
        return { role: i.role, link, svg, expiresAt, maxUses: i.max_uses };
      }),
    );
    const notes = [demo ? DEMO_MSG : null, env.botUsername ? null : "Falta TELEGRAM_BOT_USERNAME: el link usa un bot de ejemplo."].filter(Boolean);
    return { ok: true, demo, message: notes.join(" ") || undefined, data };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

// ── Presupuestos ──────────────────────────────────────────────────────────

export async function saveQuote(
  quoteId: string,
  fields: { title: string; description: string; amount_usd: number; eta_days: number },
  send: boolean,
): Promise<ActionResult> {
  try {
    await requireViewer();
    if (!fields.title.trim()) return { ok: false, error: "El presupuesto necesita un título." };
    if (!(fields.amount_usd > 0) || !(fields.eta_days > 0)) return { ok: false, error: "Monto y días tienen que ser mayores a cero." };
    if (dataMode() === "ejemplo") return { ok: true, demo: true, message: DEMO_MSG };
    const db = supabaseAdmin();
    const { data: owner } = await db.from("quotes").select("request_id").eq("id", quoteId).maybeSingle();
    if (!owner?.request_id) return { ok: false, error: "No encontré el presupuesto." };
    // El presupuesto tiene que ser de un pedido de la agencia de quien lo edita.
    const { request } = await requireRequest(owner.request_id);
    if (send && request.is_sample) return { ok: true, demo: true, message: SAMPLE_MSG };
    const { data: q, error } = await db
      .from("quotes")
      .update({
        title: fields.title.trim(),
        description: fields.description.trim(),
        amount_usd: Math.round(fields.amount_usd * 100) / 100,
        eta_days: Math.round(fields.eta_days),
      })
      .eq("id", quoteId)
      .select("request_id")
      .single();
    if (error) throw new Error(error.message);
    if (send) {
      const { error: e2 } = await db
        .from("commands")
        .insert({ type: "enviar_presupuesto", request_id: q.request_id, payload: { quote_id: quoteId, via: "panel", actor: "agencia" }, status: "pendiente" });
      if (e2) throw new Error(e2.message);
    }
    revalidatePath("/presupuestos");
    return { ok: true, message: send ? "Presupuesto enviado al worker para mandarlo al cliente." : "Guardado." };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

function errorText(e: unknown) {
  if (e instanceof AccessError) return e.message;
  return e instanceof Error ? e.message : "Error inesperado";
}
