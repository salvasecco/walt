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

export const CATEGORIES = [
  'permitido',
  'riesgoso',
  'fuera_de_alcance',
  'consulta',
  'bloqueado',
  'charla',
  'derivado',
] as const;
export type Category = (typeof CATEGORIES)[number];

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
  created_by: string;
  created_at: Timestamp;
}

export interface RequestRow {
  id: Uuid;
  short_id: string;
  project_id: Uuid;
  contact_id: Uuid | null;
  raw_text: string;
  status: RequestStatus;
  category: Category | null;
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
