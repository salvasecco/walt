/**
 * Shared domain types: statuses, categories, commands and table rows (SPEC §5).
 */

export const REQUEST_STATUSES = [
  'recibido',
  'interpretando',
  'respondido',
  'cotizando',
  'cotizado',
  'esperando_cliente',
  'esperando_agencia',
  'agente_trabajando',
  'agente_listo',
  'publicando',
  'publicado',
  'revertido',
  'rechazado',
  'bloqueado',
  'derivado',
  'descartado',
  'charla',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * Request taxonomy (R1, docs/R1-CONTRATO.md). The lane (contenido | codigo) does not define the category.
 * - consulta: a question about the software or the business; Walt answers.
 * - simple: visible or UI change that touches no delicate zone; preview, the client's "Dale" and it is
 *   published, without the agency. By content (typed ops) or by code (PR).
 * - delicado: touches the database, auth or permissions, backend or API, existing payments, secrets,
 *   infrastructure or CI, dependencies, or deletes data; the agency approves the diff first.
 * - nuevo: a new agentic workflow, a payment gateway, integrations that need credentials or contracts,
 *   big modules; a quote with scope, deadline, price and a deposit link.
 * - bloqueado: injection, malicious or out of policy; nothing is applied.
 * - charla, derivado: internal (chat without a request; a technical failure without an automatic answer).
 */
export const CATEGORIES = ['consulta', 'simple', 'delicado', 'nuevo', 'bloqueado', 'charla', 'derivado'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Pre-R1 names. Rows keep them until the data migration runs (Salva applies it by hand). */
export const LEGACY_CATEGORIES = ['permitido', 'riesgoso', 'fuera_de_alcance'] as const;
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];
/** What `requests.category` may hold when read: the new names, or an old one until the migration. */
export type StoredCategory = Category | LegacyCategory;

/** Same mapping as the data migration: permitido→simple, riesgoso→delicado, fuera_de_alcance→nuevo. */
export const LEGACY_CATEGORY_MAP: Record<LegacyCategory, Category> = {
  permitido: 'simple',
  riesgoso: 'delicado',
  fuera_de_alcance: 'nuevo',
};

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/** Reads a category from storage: new names pass, old ones are mapped, anything else is null. */
export function normalizeCategory(value: unknown): Category | null {
  if (isCategory(value)) return value;
  if (typeof value === 'string' && value in LEGACY_CATEGORY_MAP) return LEGACY_CATEGORY_MAP[value as LegacyCategory];
  return null;
}

export const LANES = ['contenido', 'codigo'] as const;
export type Lane = (typeof LANES)[number];

export const COMMAND_TYPES = [
  'aprobar',
  'rechazar',
  'publicar',
  'revertir',
  'enviar_presupuesto',
  'proponer',
  'reintentar_commit',
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export const COMMAND_STATUSES = ['pendiente', 'hecho', 'error'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export const EVENT_STEPS = [
  'recibido',
  'interpretado',
  'decidido',
  'gate',
  'borrador',
  'captura',
  'enviado',
  'aprobado_cliente',
  'aprobado_agencia',
  'publicando',
  'publicado',
  'commit',
  'revertido',
  'derivado',
  'agente_inicio',
  'agente_pr',
  'agente_preview',
  'en_la_web',
  'presupuesto',
  'respondido',
  /** Double classification: the agent's diff checked against the delicate globs (may raise to delicado). */
  'revision_diff',
  /** Deposit payment link sent after the client accepts a quote. */
  'link_pago',
] as const;
export type EventStep = (typeof EVENT_STEPS)[number];

export const EVENT_STATUSES = ['inicio', 'ok', 'falla'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const ROLES = ['cliente', 'agencia'] as const;
export type Role = (typeof ROLES)[number];

export const PROJECT_MODES = ['contenido', 'codigo'] as const;
export type ProjectMode = (typeof PROJECT_MODES)[number];

export const VERSION_STATUSES = ['borrador', 'viva', 'reemplazada', 'descartada'] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const APPROVAL_DECISIONS = ['aprobado', 'rechazado'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const VIAS = ['telegram', 'panel'] as const;
export type Via = (typeof VIAS)[number];

export const QUOTE_STATUSES = ['borrador', 'enviado', 'aceptado', 'rechazado'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ['entrada', 'salida'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

/** Fixed ids used by the seed so sessions can coordinate without waiting (SPEC §5). */
export const SEED_IDS = {
  agency: '22222222-2222-4222-8222-222222222222',
  project: '11111111-1111-4111-8111-111111111111',
} as const;

type Uuid = string;
type Timestamp = string;

export interface FactoryRow {
  id: Uuid;
  name: string;
  assistant_name: string;
  created_at: Timestamp;
}

export interface ProjectRow {
  id: Uuid;
  factory_id: Uuid;
  name: string;
  client_name: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  mode: ProjectMode;
  config_path: string;
  site_url: string | null;
  /** Migration 0003; optional because rows read before it was applied don't have it. */
  client_id?: Uuid | null;
  /** Migration 0003: sample data shown in the panel, never sent to a real chat. */
  is_sample?: boolean;
  created_at: Timestamp;
}

/** A client of the agency (migration 0003): owns projects and has a monthly plan. */
export interface ClientRow {
  id: Uuid;
  factory_id: Uuid;
  name: string;
  contact_name: string | null;
  plan_name: string;
  monthly_quota: number;
  monthly_fee_usd: number;
  notes: string;
  is_sample: boolean;
  created_at: Timestamp;
}

export interface ContactRow {
  id: Uuid;
  project_id: Uuid;
  display_name: string;
  role: Role;
  telegram_chat_id: number;
  created_at: Timestamp;
}

export interface InviteRow {
  token: string;
  project_id: Uuid;
  role: Role;
  max_uses: number;
  uses: number;
  expires_at: Timestamp;
  created_at: Timestamp;
}

export interface RulesRow {
  id: Uuid;
  project_id: Uuid;
  version: number;
  policies: Record<string, 'auto' | 'agencia' | 'bloqueado'>;
  limits: Record<string, number>;
  /** R1 (migration of the infra session): the agency's policy in natural language, for the decision prompt. */
  policy_text?: string;
  /** R1: `RulesConfig` as jsonb (globs, alwaysNew, template, priceWarnPct). Parse it with `parseRulesConfig`. */
  config?: unknown;
  created_by: string;
  created_at: Timestamp;
}

/** R1: the agency relabels a request ("¿Estuvo bien clasificado?"). The most valuable signal. */
export interface RequestLabelRow {
  id: Uuid;
  request_id: Uuid;
  factory_id: Uuid;
  /** What Walt had decided (may be an old name until the data migration). */
  from_category: StoredCategory | null;
  to_category: Category;
  reason: string | null;
  actor_user_id: Uuid | null;
  created_at: Timestamp;
}

export interface RequestRow {
  id: Uuid;
  short_id: string;
  project_id: Uuid;
  contact_id: Uuid | null;
  raw_text: string;
  status: RequestStatus;
  /** Read it with `normalizeCategory`: old rows may carry a pre-R1 name until the data migration. */
  category: StoredCategory | null;
  lane: Lane | null;
  confidence: number | null;
  interpretation: unknown;
  ops: unknown;
  changes: unknown;
  gate: unknown;
  rules_version: number | null;
  draft_version_id: Uuid | null;
  live_version_id: Uuid | null;
  parent_request_id: Uuid | null;
  pr_url: string | null;
  pr_number: number | null;
  preview_url: string | null;
  quote_id: Uuid | null;
  error: string | null;
  cost_usd: number;
  usage: unknown;
  /** Migration 0003: sample data shown in the panel. */
  is_sample?: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface EventRow {
  id: number;
  request_id: Uuid;
  step: EventStep;
  status: EventStatus;
  detail: unknown;
  duration_ms: number | null;
  at: Timestamp;
}

export interface MessageRow {
  id: Uuid;
  request_id: Uuid | null;
  contact_id: Uuid;
  direction: MessageDirection;
  text: string | null;
  media: unknown;
  at: Timestamp;
}

export interface ContentVersionRow {
  id: Uuid;
  project_id: Uuid;
  request_id: Uuid | null;
  parent_id: Uuid | null;
  status: VersionStatus;
  content: unknown;
  git_commit_sha: string | null;
  git_error: string | null;
  published_at: Timestamp | null;
  created_at: Timestamp;
}

export interface ApprovalRow {
  id: Uuid;
  request_id: Uuid;
  actor: Role;
  decision: ApprovalDecision;
  via: Via;
  at: Timestamp;
}

export interface QuoteRow {
  id: Uuid;
  request_id: Uuid;
  title: string;
  description: string;
  amount_usd: number;
  eta_days: number;
  status: QuoteStatus;
  created_at: Timestamp;
}

export interface CommandRow {
  id: Uuid;
  type: CommandType;
  request_id: Uuid | null;
  payload: unknown;
  status: CommandStatus;
  error: string | null;
  done_at: Timestamp | null;
  created_at: Timestamp;
}

/** A turn of conversation history passed to the interpreter. */
export interface Turn {
  role: 'cliente' | 'asistente';
  text: string;
  at?: string;
}

export interface QuoteSummary {
  title: string;
  description: string;
  amountUsd: number;
  etaDays: number;
  status?: QuoteStatus;
}

export interface QuoteDraft {
  title: string;
  description: string;
  amountUsd: number;
  etaDays: number;
}
