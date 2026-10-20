import type {
  AiSettingsRow,
  ApprovalDecision,
  CommandRow,
  CommandStatus,
  ContactRow,
  ContentVersionRow,
  EventStatus,
  EventStep,
  FactoryRow,
  GithubInstallationRow,
  JobRow,
  LabelCategory,
  SimilarLabeledRow,
  LedgerMode,
  MessageDirection,
  ProjectRow,
  QuoteRow,
  RequestLabelRow,
  RequestRow,
  RequestStatus,
  Role,
  Rules,
  Via,
  WalletRow,
} from '@walt/core';

export type NewRequest = Pick<RequestRow, 'short_id' | 'project_id' | 'contact_id' | 'raw_text'> &
  Partial<Pick<RequestRow, 'status' | 'parent_request_id'>>;
export type RequestPatch = Partial<Omit<RequestRow, 'id' | 'created_at' | 'updated_at' | 'short_id' | 'project_id'>>;
export type NewVersion = Pick<ContentVersionRow, 'project_id' | 'content'> &
  Partial<Pick<ContentVersionRow, 'request_id' | 'parent_id' | 'status'>>;
export type VersionPatch = Partial<Pick<ContentVersionRow, 'status' | 'git_commit_sha' | 'git_error'>>;
export type NewQuote = Pick<QuoteRow, 'request_id' | 'title' | 'description' | 'amount_usd' | 'eta_days'>;
export type QuotePatch = Partial<Pick<QuoteRow, 'title' | 'description' | 'amount_usd' | 'eta_days' | 'status'>>;

export interface NewEvent {
  request_id: string;
  step: EventStep;
  status: EventStatus;
  detail?: unknown;
  duration_ms?: number | null;
}

export interface NewMessage {
  request_id?: string | null;
  contact_id: string;
  direction: MessageDirection;
  text: string | null;
  media?: unknown;
}

export interface NewJob {
  kind: string;
  payload?: unknown;
  projectId?: string | null;
  requestId?: string | null;
  /** `default` or `agent`. Default `default`. */
  queue?: string;
  /** Same key → the same job (Telegram update, command, request). */
  dedupeKey?: string | null;
  runAfter?: string | null;
  maxAttempts?: number;
}

export interface FailJobOptions {
  /** False sends it straight to the dead letter. Default true. */
  retry?: boolean;
  baseSeconds?: number;
  maxBackoffSeconds?: number;
}

export interface JobsSummaryRow {
  queue: string;
  status: string;
  total: number;
  oldest: string | null;
}

/** One model call (or agent run) for the usage ledger. */
export interface UsageEntry {
  factoryId: string;
  projectId?: string | null;
  requestId?: string | null;
  kind: 'ai' | 'agent';
  mode: LedgerMode;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
  priceUsd: number;
  detail?: unknown;
}

export interface PublishOptions {
  /** Live version the draft was built on. Default: the draft's `parent_id`. */
  expectedLive?: string | null;
  /** Idempotency key, e.g. `publish:<request id>`: the same key never publishes twice. */
  key?: string | null;
}

export interface PublishResult {
  /** The version was already live, or the key was already used: nothing changed. */
  already: boolean;
  /** Version number (0004); null before it. */
  version: number | null;
}

/** Raised when the live version changed under a publish (Postgres 40001 from publish_version_v2). */
export class VersionConflictError extends Error {
  constructor(projectId: string) {
    super(`La versión viva del proyecto ${projectId} cambió mientras se publicaba`);
    this.name = 'VersionConflictError';
  }
}

/** Raised by the R1 methods when migration 0004 is not applied. */
export class MissingMigrationError extends Error {
  constructor(what: string) {
    super(`Falta la migración 0004 (${what}): pnpm db:migrate --copy 0004`);
    this.name = 'MissingMigrationError';
  }
}

/** What the database supports: `r1` once 0004 is applied. */
export interface SchemaInfo {
  r1: boolean;
  /** What 0004 adds that is missing (empty when `r1`). */
  missing: string[];
}

export type RedeemResult =
  | { ok: true; contact: ContactRow }
  | { ok: false; reason: 'no_existe' | 'vencida' | 'sin_usos' };

/**
 * Everything the worker reads and writes (SPEC §5). Implementations: Supabase over HTTPS
 * (supabase-js, service role), in memory (console, tests, no credentials) and PgStore
 * (plain SQL, exercised in tests with PGlite against the real migration).
 */
export interface Store {
  readonly kind: 'postgres' | 'memoria';

  /** True if the update is new (and marks it); false if it was already processed. */
  markUpdateProcessed(updateId: number): Promise<boolean>;

  getProject(id: string): Promise<ProjectRow | null>;
  getFactory(id: string): Promise<FactoryRow | null>;
  getContactByChat(chatId: number): Promise<ContactRow | null>;
  getContact(id: string): Promise<ContactRow | null>;
  listContacts(projectId: string, role?: Role): Promise<ContactRow[]>;
  /** Creates or moves a contact for a chat (used by the console channel). */
  ensureContact(c: Pick<ContactRow, 'project_id' | 'display_name' | 'role' | 'telegram_chat_id'>): Promise<ContactRow>;
  /** Validates expiry and uses, links the chat with the invite's project and role, and counts the use. */
  redeemInvite(token: string, chatId: number, displayName: string): Promise<RedeemResult>;

  /** Latest rules version. `policyText` and `config` are '' and {} before 0004. */
  latestRules(projectId: string): Promise<{ version: number; rules: Rules; policyText: string; config: unknown } | null>;

  createRequest(r: NewRequest): Promise<RequestRow>;
  updateRequest(id: string, patch: RequestPatch): Promise<RequestRow>;
  getRequest(id: string): Promise<RequestRow | null>;
  getRequestByShortId(shortId: string): Promise<RequestRow | null>;
  /** Latest request of the contact in one of the statuses. */
  latestRequestOfContact(contactId: string, statuses: RequestStatus[]): Promise<RequestRow | null>;
  /** Requests in any of the statuses, oldest first (used to recover the ones a restart left mid-way). */
  requestsWithStatus(statuses: RequestStatus[]): Promise<RequestRow[]>;
  countRequestsSince(contactId: string, sinceIso: string): Promise<number>;
  /** Automatic changes (category simple, or permitido before 0004) published since a date for the project. */
  countAutoPublishedSince(projectId: string, sinceIso: string): Promise<number>;

  addEvent(e: NewEvent): Promise<void>;
  addMessage(m: NewMessage): Promise<void>;
  /** Latest messages of a contact, oldest first. */
  recentMessages(contactId: string, limit: number): Promise<{ direction: MessageDirection; text: string | null; at: string; request_id: string | null }[]>;

  getLiveVersion(projectId: string): Promise<ContentVersionRow | null>;
  getVersion(id: string): Promise<ContentVersionRow | null>;
  createVersion(v: NewVersion): Promise<ContentVersionRow>;
  updateVersion(id: string, patch: VersionPatch): Promise<void>;
  /**
   * Publishes a draft; the previous live one becomes `reemplazada`. With 0004 it goes through
   * `publish_version_v2`: optimistic locking (throws VersionConflictError if the live version is not the
   * one the draft was built on) and idempotent (same version or same key → `already`). Before 0004, `publish_version`.
   */
  publishVersion(projectId: string, versionId: string, opts?: PublishOptions): Promise<PublishResult>;

  addApproval(a: { request_id: string; actor: Role; decision: ApprovalDecision; via: Via }): Promise<void>;

  createQuote(q: NewQuote): Promise<QuoteRow>;
  getQuote(id: string): Promise<QuoteRow | null>;
  updateQuote(id: string, patch: QuotePatch): Promise<QuoteRow>;
  /** Latest quotes of the project, newest first. */
  listQuotes(projectId: string, limit: number): Promise<QuoteRow[]>;

  /** Pending panel commands, oldest first. */
  pendingCommands(limit?: number): Promise<CommandRow[]>;
  finishCommand(id: string, status: Exclude<CommandStatus, 'pendiente'>, error?: string | null): Promise<void>;

  // ───────────── R1 (migration 0004). Before it: reads come back empty, writes throw MissingMigrationError. ─────────────

  /** Whether 0004 is applied (probed once and cached). */
  schema(): Promise<SchemaInfo>;

  /** Webhook idempotency with a text key (WhatsApp and others): true if new. */
  markProcessed(key: string, source: string): Promise<boolean>;

  /** Durable queue. */
  enqueueJob(job: NewJob): Promise<{ id: string; inserted: boolean }>;
  claimJob(worker: string, queues: string[], leaseSeconds: number): Promise<JobRow | null>;
  heartbeatJob(id: string, worker: string, leaseSeconds: number): Promise<boolean>;
  completeJob(id: string, worker: string): Promise<boolean>;
  /** Retry with exponential backoff, or dead letter when attempts are used up (or `retry: false`). */
  failJob(id: string, worker: string, error: string, opts?: FailJobOptions): Promise<JobRow | null>;
  getJob(id: string): Promise<JobRow | null>;
  /** Of these requests, the ones with a pending or running job. */
  requestsWithActiveJobs(requestIds: string[]): Promise<Set<string>>;
  jobsSummary(): Promise<JobsSummaryRow[]>;
  /** Deletes finished jobs and old processed updates. */
  purgeOldRows(): Promise<Record<string, number>>;

  /** Relabels: the agency says what the request really was. */
  labelRequest(requestId: string, to: LabelCategory, reason?: string | null, actorUserId?: string | null): Promise<RequestLabelRow>;
  /** Relabeled requests of the agency, most similar to `text` first (pg_trgm). */
  similarLabeledRequests(factoryId: string, text: string, k?: number): Promise<SimilarLabeledRow[]>;
  /** Requests of the agency's projects created since a date (rate limit per agency). */
  countFactoryRequestsSince(factoryId: string, sinceIso: string): Promise<number>;

  /** AI mode: the project's row, else the agency's, else null (Walt's key). */
  getAiSettings(factoryId: string, projectId: string | null): Promise<AiSettingsRow | null>;
  /** BYOK key from Supabase Vault (project first, then agency). Never log it. */
  getAiKey(factoryId: string, projectId: string | null): Promise<string | null>;
  /** Stores a (validated) key in Vault and sets the mode to byok. */
  setAiKey(factoryId: string, projectId: string | null, key: string): Promise<void>;
  /** Saves a model call; in credits mode it also debits the wallet. */
  recordUsage(u: UsageEntry): Promise<{ balanceUsd: number | null }>;
  getWallet(factoryId: string): Promise<WalletRow | null>;
  /** Recharge or adjustment, idempotent by reference. */
  creditWallet(factoryId: string, amountUsd: number, reference: string): Promise<{ already: boolean; balanceUsd: number }>;
  usageSince(factoryId: string, sinceIso: string, projectId?: string | null): Promise<{ costUsd: number; priceUsd: number; calls: number }>;

  /** GitHub App installation of the agency for a repo owner (case-insensitive), if any. */
  githubInstallation(factoryId: string, owner: string): Promise<GithubInstallationRow | null>;

  close(): Promise<void>;
}
