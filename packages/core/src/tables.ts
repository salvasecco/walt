/**
 * Rows of the tables added by migration 0004 (R1 infra). Types only: no runtime code, safe in the browser.
 * See docs/R1-CONTRATO.md, "Esquema 0004".
 */

type Uuid = string;
type Timestamp = string;

/** Categories a request can be relabeled to (`request_labels.to_category`). */
export const LABEL_CATEGORIES = ['consulta', 'simple', 'delicado', 'nuevo', 'bloqueado'] as const;
export type LabelCategory = (typeof LABEL_CATEGORIES)[number];

/**
 * A relabeled request returned by `similar_labeled_requests`, most similar first. The row as stored;
 * `exampleSourceOf()` turns it into the prompt's `LabeledExample` (examples.ts).
 * `RequestLabelRow` lives in types.ts.
 */
export interface SimilarLabeledRow {
  request_id: Uuid;
  raw_text: string;
  from_category: string | null;
  to_category: LabelCategory;
  reason: string | null;
  /** pg_trgm similarity, 0..1. */
  similarity: number;
  labeled_at: Timestamp;
}

export const MEMBERSHIP_ROLES = ['owner', 'admin', 'member'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export interface MembershipRow {
  id: Uuid;
  user_id: Uuid;
  factory_id: Uuid;
  role: MembershipRole;
  created_at: Timestamp;
}

export const JOB_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRow {
  id: Uuid;
  kind: string;
  /** `default` (requests, buttons, commands) or `agent` (code changes). */
  queue: string;
  payload: unknown;
  project_id: Uuid | null;
  request_id: Uuid | null;
  dedupe_key: string | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: Timestamp;
  last_error: string | null;
  /** Dead letter: gave up (attempts used up, or an error that is not retried). */
  dead: boolean;
  locked_at: Timestamp | null;
  locked_by: string | null;
  lease_until: Timestamp | null;
  finished_at: Timestamp | null;
  created_at: Timestamp;
}

export const AI_MODES = ['byok', 'credits', 'claude_code'] as const;
export type AiMode = (typeof AI_MODES)[number];
/** Modes in the usage ledger: `platform` is Walt's own key (no ai_settings row). */
export type LedgerMode = AiMode | 'platform';

export interface AiSettingsRow {
  id: Uuid;
  factory_id: Uuid;
  /** Null: the agency default. A project row overrides it. */
  project_id: Uuid | null;
  mode: AiMode;
  /** Supabase Vault secret id (BYOK). Never the key itself. */
  secret_id: Uuid | null;
  /** Last 4 characters of the key, to show in the panel. */
  key_hint: string | null;
  key_validated_at: Timestamp | null;
  monthly_cap_usd: number | null;
  request_cap_usd: number | null;
  alert_pct: number;
  model_classify: string | null;
  model_code: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface WalletRow {
  factory_id: Uuid;
  balance_usd: number;
  markup_pct: number;
  low_balance_usd: number;
  auto_recharge: boolean;
  auto_recharge_usd: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UsageLedgerRow {
  id: Uuid;
  factory_id: Uuid;
  project_id: Uuid | null;
  request_id: Uuid | null;
  kind: 'ai' | 'agent' | 'recharge' | 'adjustment';
  mode: LedgerMode;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** What the call cost (price table of @walt/core). */
  cost_usd: number;
  /** What the agency is charged. */
  price_usd: number;
  /** How much the wallet moved (negative for usage in credits mode, positive for recharges). */
  wallet_delta_usd: number;
  balance_after_usd: number | null;
  reference: string | null;
  detail: unknown;
  created_at: Timestamp;
}

export interface GithubInstallationRow {
  id: Uuid;
  factory_id: Uuid;
  installation_id: number;
  account_login: string;
  account_type: 'User' | 'Organization' | null;
  suspended_at: Timestamp | null;
  created_at: Timestamp;
}
