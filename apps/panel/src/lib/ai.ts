import "server-only";
import { dataMode } from "./env";
import { buildSample } from "./sample";
import { getScope, inScope, isMissingRelation } from "./session";
import { supabaseAdmin } from "./supabase/server";
import { SEED_FACTORY_ID, type Project, type StoredCategory } from "./types";

/**
 * Modos de IA (brief §4, tablas de la 0004). `platform` es no tener fila en `ai_settings`: Walt pone la
 * clave, como hasta ahora. Un proyecto sin fila usa el de la agencia.
 */
export const AI_MODES = ["platform", "byok", "credits", "claude_code"] as const;
export type AiMode = (typeof AI_MODES)[number];

export const AI_MODE_LABEL: Record<AiMode, string> = {
  platform: "Clave de Walt",
  byok: "Tu clave de Anthropic",
  credits: "Créditos prepagos",
  claude_code: "Claude Code de la agencia",
};

/** Una fila de `ai_settings` para mostrar: nunca el id del secreto, solo si hay clave y sus últimos 4 caracteres. */
export type AiSettingView = {
  mode: Exclude<AiMode, "platform">;
  hasKey: boolean;
  keyHint: string | null;
  keyValidatedAt: string | null;
  monthlyCapUsd: number | null;
  requestCapUsd: number | null;
  alertPct: number;
  updatedAt: string | null;
};

export type WalletView = { balanceUsd: number; markupPct: number; lowBalanceUsd: number; autoRecharge: boolean; autoRechargeUsd: number | null };

export type LedgerRow = {
  id: string;
  created_at: string;
  kind: "ai" | "agent" | "recharge" | "adjustment";
  mode: string;
  model: string | null;
  cost_usd: number;
  price_usd: number;
  wallet_delta_usd: number;
  balance_after_usd: number | null;
  request_id: string | null;
};

export type CostRequest = { id: string; short_id: string; project_id: string; raw_text: string; category: StoredCategory | null; cost_usd: number | null; model: string | null; created_at: string };

export type ProjectAi = {
  project: Project;
  setting: AiSettingView | null;
  /** El modo que usa de verdad: el del proyecto o, si no tiene, el de la agencia. */
  effective: AiMode;
  month: { requests: number; cost: number; perRequest: number | null };
};

export type AiView = {
  /** Están las tablas de la 0004 (ai_settings, wallets, usage_ledger). */
  ready: boolean;
  factoryId: string | null;
  agency: AiSettingView | null;
  projects: ProjectAi[];
  wallet: WalletView | null;
  movements: LedgerRow[];
  month: { requests: number; cost: number; perRequest: number | null; since: string };
  recent: CostRequest[];
};

/** Primer día del mes en Montevideo (UTC−3), en ISO. */
export function monthStart(now = Date.now()): string {
  const local = new Date(now - 3 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3)).toISOString();
}

type SettingRow = {
  factory_id: string;
  project_id: string | null;
  mode: Exclude<AiMode, "platform">;
  secret_id: string | null;
  key_hint: string | null;
  key_validated_at: string | null;
  monthly_cap_usd: number | string | null;
  request_cap_usd: number | string | null;
  alert_pct: number;
  updated_at: string | null;
};

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));

export function toView(r: SettingRow): AiSettingView {
  return {
    mode: r.mode,
    hasKey: !!r.secret_id,
    keyHint: r.key_hint,
    keyValidatedAt: r.key_validated_at,
    monthlyCapUsd: num(r.monthly_cap_usd),
    requestCapUsd: num(r.request_cap_usd),
    alertPct: r.alert_pct ?? 80,
    updatedAt: r.updated_at,
  };
}

const modelOf = (usage: unknown): string | null => {
  const list = Array.isArray(usage) ? usage : usage ? [usage] : [];
  const m = (list.at(-1) as { model?: unknown } | undefined)?.model;
  return typeof m === "string" ? m : null;
};

function monthStats(requests: { cost_usd: number | null }[]) {
  const cost = requests.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  return { requests: requests.length, cost, perRequest: requests.length ? cost / requests.length : null };
}

/** La agencia de la pantalla: la activa; con el acceso de la instancia, la de los proyectos (o la del seed). */
export function factoryOf(scope: { factoryId: string | null; projects: Project[] }): string | null {
  return scope.factoryId ?? scope.projects[0]?.factory_id ?? (dataMode() === "ejemplo" ? SEED_FACTORY_ID : null);
}

/** Todo lo de la pantalla IA y costos para la agencia de quien mira. */
export async function getAiView(): Promise<AiView> {
  const scope = await getScope();
  const factoryId = factoryOf(scope);
  const since = monthStart();
  const projects = scope.projects.filter((p) => !factoryId || p.factory_id === factoryId);
  const ids = new Set(projects.map((p) => p.id));

  if (dataMode() === "ejemplo") {
    const s = buildSample();
    const reqs = s.requests.filter((r) => ids.has(r.project_id) && r.created_at >= since);
    const at = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    const agency: AiSettingView = { mode: "byok", hasKey: true, keyHint: "Q7xP", keyValidatedAt: at(3), monthlyCapUsd: 50, requestCapUsd: 1, alertPct: 80, updatedAt: at(3) };
    const ferreteria = projects.find((p) => p.is_sample && p.name.startsWith("Ferretería"));
    const overrides = new Map<string, AiSettingView>(ferreteria ? [[ferreteria.id, { ...agency, mode: "credits", hasKey: false, keyHint: null, keyValidatedAt: null, monthlyCapUsd: 20, requestCapUsd: null }]] : []);
    return {
      ready: true,
      factoryId,
      agency,
      projects: projects.map((project) => {
        const setting = overrides.get(project.id) ?? null;
        return { project, setting, effective: setting?.mode ?? agency.mode, month: monthStats(reqs.filter((r) => r.project_id === project.id)) };
      }),
      wallet: { balanceUsd: 18.42, markupPct: 30, lowBalanceUsd: 5, autoRecharge: false, autoRechargeUsd: null },
      movements: [
        { id: "m1", created_at: at(0.2), kind: "ai", mode: "credits", model: "claude-sonnet-5-5", cost_usd: 0.0131, price_usd: 0.017, wallet_delta_usd: -0.017, balance_after_usd: 18.42, request_id: null },
        { id: "m2", created_at: at(1), kind: "agent", mode: "credits", model: "claude-sonnet-5-5", cost_usd: 0.4, price_usd: 0.52, wallet_delta_usd: -0.52, balance_after_usd: 18.437, request_id: null },
        { id: "m3", created_at: at(6), kind: "recharge", mode: "credits", model: null, cost_usd: 0, price_usd: 0, wallet_delta_usd: 20, balance_after_usd: 18.957, request_id: null },
      ],
      month: { ...monthStats(reqs), since },
      recent: reqs
        .filter((r) => Number(r.cost_usd ?? 0) > 0)
        .slice(0, 12)
        .map((r) => ({ id: r.id, short_id: r.short_id, project_id: r.project_id, raw_text: r.raw_text, category: r.category, cost_usd: r.cost_usd, model: modelOf(r.usage) ?? "claude-sonnet-5-5", created_at: r.created_at })),
    };
  }

  const db = supabaseAdmin();
  const projectIds = [...ids];
  const reqsP = projectIds.length
    ? inScope(db.from("requests").select("id, short_id, project_id, raw_text, category, cost_usd, usage, created_at").gte("created_at", since).in("project_id", projectIds), scope)
        .order("created_at", { ascending: false })
        .limit(5000)
        .then((r) => {
          if (r.error) throw new Error(r.error.message);
          return r.data as (Omit<CostRequest, "model"> & { usage: unknown })[];
        })
    : Promise.resolve([]);
  const [settingsRes, walletRes, ledgerRes, reqs] = await Promise.all([
    factoryId ? db.from("ai_settings").select("*").eq("factory_id", factoryId) : Promise.resolve({ data: [], error: null }),
    factoryId ? db.from("wallets").select("*").eq("factory_id", factoryId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    factoryId ? db.from("usage_ledger").select("*").eq("factory_id", factoryId).order("created_at", { ascending: false }).limit(15) : Promise.resolve({ data: [], error: null }),
    reqsP,
  ]);
  const ready = !isMissingRelation(settingsRes.error);
  if (settingsRes.error && ready) throw new Error(settingsRes.error.message);
  const rows = ready ? ((settingsRes.data ?? []) as SettingRow[]) : [];
  const agencyRow = rows.find((r) => r.project_id === null) ?? null;
  const agency = agencyRow ? toView(agencyRow) : null;
  const byProject = new Map(rows.filter((r) => r.project_id).map((r) => [r.project_id!, toView(r)]));
  const w = !walletRes.error && walletRes.data ? (walletRes.data as Record<string, number | string | boolean | null>) : null;
  return {
    ready,
    factoryId,
    agency,
    projects: projects.map((project) => {
      const setting = byProject.get(project.id) ?? null;
      return { project, setting, effective: setting?.mode ?? agency?.mode ?? "platform", month: monthStats(reqs.filter((r) => r.project_id === project.id)) };
    }),
    wallet: w
      ? {
          balanceUsd: Number(w.balance_usd ?? 0),
          markupPct: Number(w.markup_pct ?? 0),
          lowBalanceUsd: Number(w.low_balance_usd ?? 0),
          autoRecharge: !!w.auto_recharge,
          autoRechargeUsd: num(w.auto_recharge_usd as number | null),
        }
      : null,
    movements: !ledgerRes.error ? ((ledgerRes.data ?? []) as LedgerRow[]).map((m) => ({ ...m, cost_usd: Number(m.cost_usd), price_usd: Number(m.price_usd), wallet_delta_usd: Number(m.wallet_delta_usd), balance_after_usd: num(m.balance_after_usd) })) : [],
    month: { ...monthStats(reqs), since },
    recent: reqs
      .filter((r) => Number(r.cost_usd ?? 0) > 0)
      .slice(0, 12)
      .map(({ usage, ...r }) => ({ ...r, model: modelOf(usage) })),
  };
}
