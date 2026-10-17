import type {
  ApprovalDecision,
  CommandRow,
  CommandStatus,
  ContactRow,
  ContentVersionRow,
  EventStatus,
  EventStep,
  FactoryRow,
  MessageDirection,
  ProjectRow,
  QuoteRow,
  RequestRow,
  RequestStatus,
  Role,
  Rules,
  Via,
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

  latestRules(projectId: string): Promise<{ version: number; rules: Rules } | null>;

  createRequest(r: NewRequest): Promise<RequestRow>;
  updateRequest(id: string, patch: RequestPatch): Promise<RequestRow>;
  getRequest(id: string): Promise<RequestRow | null>;
  getRequestByShortId(shortId: string): Promise<RequestRow | null>;
  /** Latest request of the contact in one of the statuses. */
  latestRequestOfContact(contactId: string, statuses: RequestStatus[]): Promise<RequestRow | null>;
  /** Requests in any of the statuses, oldest first (used to recover the ones a restart left mid-way). */
  requestsWithStatus(statuses: RequestStatus[]): Promise<RequestRow[]>;
  countRequestsSince(contactId: string, sinceIso: string): Promise<number>;
  /** Automatic (permitido) changes published this month for the project. */
  countAutoPublishedSince(projectId: string, sinceIso: string): Promise<number>;

  addEvent(e: NewEvent): Promise<void>;
  addMessage(m: NewMessage): Promise<void>;
  /** Latest messages of a contact, oldest first. */
  recentMessages(contactId: string, limit: number): Promise<{ direction: MessageDirection; text: string | null; at: string; request_id: string | null }[]>;

  getLiveVersion(projectId: string): Promise<ContentVersionRow | null>;
  getVersion(id: string): Promise<ContentVersionRow | null>;
  createVersion(v: NewVersion): Promise<ContentVersionRow>;
  updateVersion(id: string, patch: VersionPatch): Promise<void>;
  /** `publish_version(p_project, p_version)`: the previous live one becomes `reemplazada`. */
  publishVersion(projectId: string, versionId: string): Promise<void>;

  addApproval(a: { request_id: string; actor: Role; decision: ApprovalDecision; via: Via }): Promise<void>;

  createQuote(q: NewQuote): Promise<QuoteRow>;
  getQuote(id: string): Promise<QuoteRow | null>;
  updateQuote(id: string, patch: QuotePatch): Promise<QuoteRow>;
  /** Latest quotes of the project, newest first. */
  listQuotes(projectId: string, limit: number): Promise<QuoteRow[]>;

  /** Pending panel commands, oldest first. */
  pendingCommands(limit?: number): Promise<CommandRow[]>;
  finishCommand(id: string, status: Exclude<CommandStatus, 'pendiente'>, error?: string | null): Promise<void>;

  close(): Promise<void>;
}
