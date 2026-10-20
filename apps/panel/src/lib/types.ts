// Tipos del panel. Los enums, operaciones y cambios vienen de @walt/core (SPEC §5 y §7);
// las filas se refinan acá con los jsonb tipados que el panel muestra.
// Solo se importan TIPOS de @walt/core: su código usa imports con extensión .js que Turbopack no resuelve
// a .ts, así que las constantes se repiten acá y `satisfies` las ata a los tipos de core.
import type { Change, CommandType, Op, OpType, Policy, RequestStatus, RulesConfig } from "@walt/core/browser";
import type { Category, StoredCategory } from "./taxonomy";

export type { Category, Change, CommandType, Op, OpType, Policy, RequestStatus, StoredCategory };

export type EventStatus = "inicio" | "ok" | "falla";
export type Day = "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";

export type Interpretation = {
  /** R1: simple, delicado, nuevo, consulta, bloqueado, charla, aprobacion o revertir; antes: cambio y funcion_nueva. */
  kind: string;
  summary: string;
  confidence: number;
  ops: Op[];
  needsCode: boolean;
  codeInstruction?: string;
  unexpressedParts: string[];
  options?: { label: string; ops: Op[] }[];
  /** R1: por qué es de ese tipo, para la agencia. */
  why?: string;
  /** R1: la pregunta al cliente cuando no se pudo armar nada concreto. */
  question?: string;
};

export type GateResult = {
  outcome: "auto" | "agencia" | "bloqueado";
  reasons: string[];
};

export type Factory = { id: string; name: string; assistant_name: string; created_at: string };

export type Project = {
  id: string;
  factory_id: string;
  name: string;
  client_name: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  mode: "contenido" | "codigo";
  config_path: string;
  site_url: string | null;
  /** Migración 0003: opcionales porque antes de aplicarla no vienen. */
  client_id?: string | null;
  is_sample?: boolean;
  created_at: string;
};

/** Cliente de la agencia (migración 0003). */
export type Client = {
  id: string;
  factory_id: string;
  name: string;
  contact_name: string | null;
  plan_name: string;
  monthly_quota: number;
  monthly_fee_usd: number;
  notes: string;
  is_sample: boolean;
  created_at: string;
};

export type Contact = {
  id: string;
  project_id: string;
  display_name: string;
  role: "cliente" | "agencia";
  created_at: string;
};

export type RulesLimits = {
  maxPriceChangePct: number;
  monthlyQuota: number;
  minConfidence: number;
  maxOpsPerRequest: number;
};

export type Rules = {
  id: string;
  project_id: string;
  version: number;
  policies: Record<OpType, Policy>;
  limits: RulesLimits;
  /** Migración 0004: la política en lenguaje natural. Falta en filas de antes. */
  policy_text?: string;
  /** Migración 0004: `RulesConfig` de @walt/core. Falta (o es `{}`) en filas de antes. */
  config?: Partial<RulesConfig>;
  created_by: string | null;
  created_at: string;
};

/** Lo que se edita en la pantalla Reglas: una versión completa, con config ya completada con su plantilla. */
export type EditableRules = {
  policies: Record<OpType, Policy>;
  limits: RulesLimits;
  policy_text: string;
  config: RulesConfig;
};

export type WaltRequest = {
  id: string;
  short_id: string;
  project_id: string;
  contact_id: string | null;
  raw_text: string;
  status: RequestStatus;
  /** Valor guardado: puede ser viejo (permitido, riesgoso, fuera_de_alcance) hasta la migración. Mostrar con `normalizeCategory`. */
  category: StoredCategory | null;
  lane: "contenido" | "codigo" | null;
  confidence: number | null;
  interpretation: Interpretation | null;
  ops: Op[] | null;
  changes: Change[] | null;
  gate: GateResult | null;
  rules_version: number | null;
  draft_version_id: string | null;
  live_version_id: string | null;
  parent_request_id: string | null;
  pr_url: string | null;
  pr_number: number | null;
  preview_url: string | null;
  quote_id: string | null;
  error: string | null;
  cost_usd: number | null;
  usage: Record<string, unknown> | null;
  is_sample?: boolean;
  created_at: string;
  updated_at: string | null;
};

export type WaltEvent = {
  id: number;
  request_id: string;
  step: string;
  status: EventStatus;
  detail: Record<string, unknown> | null;
  duration_ms: number | null;
  at: string;
};

export type Message = {
  id: string;
  request_id: string | null;
  contact_id: string | null;
  direction: "entrada" | "salida";
  text: string | null;
  media: Record<string, unknown> | null;
  at: string;
};

export type ContentVersion = {
  id: string;
  project_id: string;
  request_id: string | null;
  parent_id: string | null;
  status: "borrador" | "viva" | "reemplazada" | "descartada";
  content: SiteContent | null;
  git_commit_sha: string | null;
  git_error: string | null;
  published_at: string | null;
  created_at: string;
};

export type Approval = {
  id: string;
  request_id: string;
  actor: "cliente" | "agencia";
  decision: "aprobado" | "rechazado";
  via: "telegram" | "panel";
  at: string;
};

export type Quote = {
  id: string;
  request_id: string | null;
  title: string;
  description: string | null;
  amount_usd: number | null;
  eta_days: number | null;
  status: "borrador" | "enviado" | "aceptado" | "rechazado";
  created_at: string;
};

/** Reetiquetado de la agencia (migración 0004, tabla request_labels; docs/R1-CONTRATO.md). */
export type RequestLabel = {
  id: string;
  request_id: string;
  factory_id: string;
  from_category: string | null;
  to_category: string;
  reason: string | null;
  actor_user_id: string | null;
  created_at: string;
};

export type Command = {
  id: string;
  type: CommandType;
  request_id: string | null;
  payload: Record<string, unknown> | null;
  status: "pendiente" | "hecho" | "error";
  error: string | null;
  done_at: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
};

/** Contenido del sitio de la panadería (sección 14). Laxo: otros sitios pueden traer más campos. */
export type SiteContent = {
  brand?: { name?: string; tagline?: string };
  theme?: Record<string, string>;
  hero?: { title?: string; subtitle?: string; cta?: string };
  banner?: {
    enabled: boolean;
    text?: string;
    discountPercent?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
  };
  products?: Product[];
  hours?: { day: Day; open: string | null; close: string | null }[];
  about?: { title?: string; text?: string };
  sections?: Record<string, boolean>;
  [key: string]: unknown;
};

export const OP_TYPES = [
  "set_text",
  "set_price",
  "adjust_prices",
  "set_availability",
  "set_color",
  "set_hours",
  "set_banner",
  "toggle_section",
  "add_product",
] as const satisfies readonly OpType[];

export { CATEGORIES } from "./taxonomy";

export const STATUSES = [
  "recibido",
  "interpretando",
  "respondido",
  "cotizando",
  "cotizado",
  "esperando_cliente",
  "esperando_agencia",
  "agente_trabajando",
  "agente_listo",
  "publicando",
  "publicado",
  "revertido",
  "rechazado",
  "bloqueado",
  "derivado",
  "descartado",
  "charla",
] as const satisfies readonly RequestStatus[];

// Ids fijos del seed (SPEC §5).
export const SEED_FACTORY_ID = "22222222-2222-4222-8222-222222222222";
export const SEED_PROJECT_ID = "11111111-1111-4111-8111-111111111111";
