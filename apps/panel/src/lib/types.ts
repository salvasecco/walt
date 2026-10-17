// Tipos de la base (SPEC sección 5) y de operaciones (sección 7).
// Locales mientras @dale/core no exista en main; reemplazar por los de @dale/core cuando esté.

export type RequestStatus =
  | "recibido"
  | "interpretando"
  | "respondido"
  | "cotizando"
  | "cotizado"
  | "esperando_cliente"
  | "esperando_agencia"
  | "agente_trabajando"
  | "agente_listo"
  | "publicando"
  | "publicado"
  | "revertido"
  | "rechazado"
  | "bloqueado"
  | "derivado"
  | "descartado"
  | "charla";

export type Category =
  | "permitido"
  | "riesgoso"
  | "fuera_de_alcance"
  | "consulta"
  | "bloqueado"
  | "charla"
  | "derivado";

export type CommandType =
  | "aprobar"
  | "rechazar"
  | "publicar"
  | "revertir"
  | "enviar_presupuesto"
  | "proponer"
  | "reintentar_commit";

export type Policy = "auto" | "agencia" | "bloqueado";

export type OpType =
  | "set_text"
  | "set_price"
  | "adjust_prices"
  | "set_availability"
  | "set_color"
  | "set_banner"
  | "set_hours"
  | "toggle_section";

export type Day = "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";

export type Op =
  | { type: "set_text"; path: string; value: string }
  | { type: "set_price"; productId: string; value: number }
  | {
      type: "adjust_prices";
      filter: { all?: true; category?: string; productIds?: string[] };
      percent?: number;
      amount?: number;
      rounding: "none" | "integer" | "nearest_5" | "nearest_10";
    }
  | { type: "set_availability"; productId: string; available: boolean }
  | { type: "set_color"; token: string; value: string }
  | {
      type: "set_banner";
      enabled: boolean;
      text?: string;
      discountPercent?: number | null;
      startsAt?: string | null;
      endsAt?: string | null;
    }
  | { type: "set_hours"; day: Day; open: string | null; close: string | null }
  | { type: "toggle_section"; section: string; visible: boolean };

export type Change = { pointer: string; before: unknown; after: unknown };

export type Interpretation = {
  kind: "cambio" | "consulta" | "funcion_nueva" | "charla" | "aprobacion" | "revertir";
  summary: string;
  confidence: number;
  ops: Op[];
  needsCode: boolean;
  codeInstruction?: string;
  unexpressedParts: string[];
  options?: { label: string; ops: Op[] }[];
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
  created_at: string;
};

export type Rules = {
  id: string;
  project_id: string;
  version: number;
  policies: Record<OpType, Policy>;
  limits: {
    maxPriceChangePct: number;
    monthlyQuota: number;
    minConfidence: number;
    maxOpsPerRequest: number;
  };
  created_by: string | null;
  created_at: string;
};

export type DaleRequest = {
  id: string;
  short_id: string;
  project_id: string;
  contact_id: string | null;
  raw_text: string;
  status: RequestStatus;
  category: Category | null;
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
  created_at: string;
  updated_at: string | null;
};

export type EventStatus = "inicio" | "ok" | "falla";

export type DaleEvent = {
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

export const OP_TYPES: OpType[] = [
  "set_text",
  "set_price",
  "adjust_prices",
  "set_availability",
  "set_color",
  "set_hours",
  "set_banner",
  "toggle_section",
];

export const CATEGORIES: Category[] = [
  "permitido",
  "riesgoso",
  "fuera_de_alcance",
  "consulta",
  "bloqueado",
  "charla",
  "derivado",
];

export const STATUSES: RequestStatus[] = [
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
];

export const SEED_FACTORY_ID = "22222222-2222-4222-8222-222222222222";
export const SEED_PROJECT_ID = "11111111-1111-4111-8111-111111111111";
