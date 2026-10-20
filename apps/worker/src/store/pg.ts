import type {
  AiSettingsRow,
  CommandRow,
  ContactRow,
  ContentVersionRow,
  FactoryRow,
  GithubInstallationRow,
  JobRow,
  LabelCategory,
  SimilarLabeledRow,
  ProjectRow,
  QuoteRow,
  RequestLabelRow,
  RequestRow,
  Rules,
  WalletRow,
} from '@walt/core';
import {
  MissingMigrationError,
  VersionConflictError,
  type FailJobOptions,
  type JobsSummaryRow,
  type NewEvent,
  type NewJob,
  type NewMessage,
  type NewQuote,
  type NewRequest,
  type NewVersion,
  type PublishOptions,
  type PublishResult,
  type RedeemResult,
  type SchemaInfo,
  type Store,
  type UsageEntry,
} from './types.js';

/** Minimal SQL client: postgres.js (`sql.unsafe`) in production, PGlite in tests. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const JSON_COLS = new Set(['interpretation', 'ops', 'changes', 'gate', 'usage', 'content', 'detail', 'media', 'payload', 'policies', 'limits', 'config']);
const NUM_COLS = new Set([
  'confidence', 'cost_usd', 'amount_usd', 'telegram_chat_id',
  // 0004
  'price_usd', 'wallet_delta_usd', 'balance_after_usd', 'balance_usd', 'markup_pct', 'low_balance_usd', 'auto_recharge_usd',
  'monthly_cap_usd', 'request_cap_usd', 'similarity', 'installation_id', 'total', 'calls',
]);

/** What 0004 adds, checked in the catalog. */
const R1_PROBES: [string, string][] = [
  ['jobs', "to_regclass('public.jobs') is not null"],
  ['request_labels', "to_regclass('public.request_labels') is not null"],
  ['memberships', "to_regclass('public.memberships') is not null"],
  ['ai_settings', "to_regclass('public.ai_settings') is not null"],
  ['wallets', "to_regclass('public.wallets') is not null"],
  ['usage_ledger', "to_regclass('public.usage_ledger') is not null"],
  ['github_installations', "to_regclass('public.github_installations') is not null"],
  ['rules.policy_text', "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rules' and column_name = 'policy_text')"],
  ['content_versions.version', "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'content_versions' and column_name = 'version')"],
  ['processed_updates.key', "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'processed_updates' and column_name = 'key')"],
  ['publish_version_v2', "exists (select 1 from pg_proc where proname = 'publish_version_v2')"],
  ['claim_job', "exists (select 1 from pg_proc where proname = 'claim_job')"],
];

function pgCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

/** Normalizes driver differences: numeric/bigint as numbers, timestamps as ISO strings. */
function norm<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (NUM_COLS.has(k) && v !== null && v !== undefined) out[k] = Number(v);
    else out[k] = v;
  }
  return out as T;
}

function param(col: string, v: unknown): unknown {
  return JSON_COLS.has(col) && v !== null && v !== undefined ? JSON.stringify(v) : v;
}
function cast(col: string): string {
  return JSON_COLS.has(col) ? '::jsonb' : '';
}

export class PgStore implements Store {
  readonly kind = 'postgres' as const;
  constructor(private readonly db: Db) {}

  private async one<T>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.db.query<Record<string, unknown>>(text, params);
    return rows[0] ? norm<T>(rows[0]) : null;
  }
  private async many<T>(text: string, params: unknown[] = []): Promise<T[]> {
    return (await this.db.query<Record<string, unknown>>(text, params)).map((r) => norm<T>(r));
  }
  private async insert<T>(table: string, values: Record<string, unknown>, db: Db = this.db): Promise<T> {
    const cols = Object.keys(values).filter((k) => values[k] !== undefined);
    const text = `insert into ${table} (${cols.join(', ')}) values (${cols.map((c, i) => `$${i + 1}${cast(c)}`).join(', ')}) returning *`;
    const rows = await db.query<Record<string, unknown>>(text, cols.map((c) => param(c, values[c])));
    return norm<T>(rows[0]!);
  }
  private async update<T>(table: string, id: string, patch: Record<string, unknown>): Promise<T> {
    const cols = Object.keys(patch).filter((k) => patch[k] !== undefined);
    if (cols.length === 0) return (await this.one<T>(`select * from ${table} where id = $1`, [id]))!;
    const text = `update ${table} set ${cols.map((c, i) => `${c} = $${i + 2}${cast(c)}`).join(', ')} where id = $1 returning *`;
    const row = await this.one<T>(text, [id, ...cols.map((c) => param(c, patch[c]))]);
    if (!row) throw new Error(`No existe ${table} ${id}`);
    return row;
  }

  async markUpdateProcessed(updateId: number) {
    const rows = await this.db.query('insert into processed_updates (update_id) values ($1) on conflict do nothing returning update_id', [updateId]);
    return rows.length > 0;
  }
  getProject(id: string) {
    return this.one<ProjectRow>('select * from projects where id = $1', [id]);
  }
  getFactory(id: string) {
    return this.one<FactoryRow>('select * from factories where id = $1', [id]);
  }
  getContactByChat(chatId: number) {
    return this.one<ContactRow>('select * from contacts where telegram_chat_id = $1', [chatId]);
  }
  getContact(id: string) {
    return this.one<ContactRow>('select * from contacts where id = $1', [id]);
  }
  listContacts(projectId: string, role?: string) {
    return role
      ? this.many<ContactRow>('select * from contacts where project_id = $1 and role = $2 order by created_at', [projectId, role])
      : this.many<ContactRow>('select * from contacts where project_id = $1 order by created_at', [projectId]);
  }
  async ensureContact(c: Pick<ContactRow, 'project_id' | 'display_name' | 'role' | 'telegram_chat_id'>, db: Db = this.db) {
    const rows = await db.query<Record<string, unknown>>(
      `insert into contacts (project_id, display_name, role, telegram_chat_id) values ($1, $2, $3, $4)
       on conflict (telegram_chat_id) do update set project_id = excluded.project_id, display_name = excluded.display_name, role = excluded.role
       returning *`,
      [c.project_id, c.display_name, c.role, c.telegram_chat_id],
    );
    return norm<ContactRow>(rows[0]!);
  }
  async redeemInvite(token: string, chatId: number, displayName: string): Promise<RedeemResult> {
    return this.db.transaction(async (tx) => {
      const [inv] = await tx.query<{ project_id: string; role: 'cliente' | 'agencia'; max_uses: number; uses: number; expires_at: Date | string }>(
        'select project_id, role, max_uses, uses, expires_at from invites where token = $1 for update',
        [token],
      );
      if (!inv) return { ok: false, reason: 'no_existe' } as const;
      if (new Date(inv.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'vencida' } as const;
      if (inv.uses >= inv.max_uses) return { ok: false, reason: 'sin_usos' } as const;
      await tx.query('update invites set uses = uses + 1 where token = $1', [token]);
      const contact = await this.ensureContact({ project_id: inv.project_id, role: inv.role, display_name: displayName, telegram_chat_id: chatId }, tx);
      return { ok: true, contact } as const;
    });
  }
  async latestRules(projectId: string) {
    const r1 = (await this.schema()).r1;
    const r = await this.one<{ version: number; policies: Rules['policies']; limits: Rules['limits']; policy_text?: string; config?: unknown }>(
      `select version, policies, limits${r1 ? ', policy_text, config' : ''} from rules where project_id = $1 order by version desc limit 1`,
      [projectId],
    );
    return r
      ? { version: r.version, rules: { policies: r.policies, limits: r.limits }, policyText: r.policy_text ?? '', config: r.config ?? {} }
      : null;
  }
  createRequest(r: NewRequest) {
    return this.insert<RequestRow>('requests', r);
  }
  updateRequest(id: string, patch: Partial<RequestRow>) {
    return this.update<RequestRow>('requests', id, patch);
  }
  getRequest(id: string) {
    return this.one<RequestRow>('select * from requests where id = $1', [id]);
  }
  getRequestByShortId(shortId: string) {
    return this.one<RequestRow>('select * from requests where short_id = $1', [shortId]);
  }
  latestRequestOfContact(contactId: string, statuses: string[]) {
    return this.one<RequestRow>(
      'select * from requests where contact_id = $1 and status = any($2::text[]) order by created_at desc limit 1',
      [contactId, statuses],
    );
  }
  async requestsWithStatus(statuses: string[]) {
    return this.many<RequestRow>('select * from requests where status = any($1::text[]) order by created_at', [statuses]);
  }
  async countRequestsSince(contactId: string, sinceIso: string) {
    const r = await this.one<{ n: number }>('select count(*)::int as n from requests where contact_id = $1 and created_at >= $2', [contactId, sinceIso]);
    return Number(r?.n ?? 0);
  }
  async countAutoPublishedSince(projectId: string, sinceIso: string) {
    const r = await this.one<{ n: number }>(
      `select count(*)::int as n from requests
       where project_id = $1 and category in ('simple', 'permitido') and live_version_id is not null and created_at >= $2`,
      [projectId, sinceIso],
    );
    return Number(r?.n ?? 0);
  }
  async addEvent(e: NewEvent) {
    await this.insert('events', { ...e, detail: e.detail ?? null, duration_ms: e.duration_ms ?? null });
  }
  async addMessage(m: NewMessage) {
    await this.insert('messages', { ...m, request_id: m.request_id ?? null, media: m.media ?? null });
  }
  async recentMessages(contactId: string, limit: number) {
    const rows = await this.many<{ direction: 'entrada' | 'salida'; text: string | null; at: string; request_id: string | null }>(
      'select direction, text, at, request_id from messages where contact_id = $1 order by at desc limit $2',
      [contactId, limit],
    );
    return rows.reverse();
  }
  getLiveVersion(projectId: string) {
    return this.one<ContentVersionRow>("select * from content_versions where project_id = $1 and status = 'viva'", [projectId]);
  }
  getVersion(id: string) {
    return this.one<ContentVersionRow>('select * from content_versions where id = $1', [id]);
  }
  createVersion(v: NewVersion) {
    return this.insert<ContentVersionRow>('content_versions', v);
  }
  async updateVersion(id: string, patch: Partial<ContentVersionRow>) {
    await this.update('content_versions', id, patch);
  }
  async publishVersion(projectId: string, versionId: string, opts: PublishOptions = {}): Promise<PublishResult> {
    if (!(await this.schema()).r1) {
      await this.db.query('select publish_version($1::uuid, $2::uuid)', [projectId, versionId]);
      return { already: false, version: null };
    }
    try {
      const [row] = await this.db.query<{ r: { already: boolean; version: number | null } }>(
        'select publish_version_v2($1::uuid, $2::uuid, $3::uuid, $4::text) as r',
        [projectId, versionId, opts.expectedLive ?? null, opts.key ?? null],
      );
      return { already: !!row?.r.already, version: row?.r.version ?? null };
    } catch (err) {
      if (pgCode(err) === '40001') throw new VersionConflictError(projectId);
      throw err;
    }
  }
  async addApproval(a: { request_id: string; actor: string; decision: string; via: string }) {
    await this.insert('approvals', a);
  }
  createQuote(q: NewQuote) {
    return this.insert<QuoteRow>('quotes', q);
  }
  getQuote(id: string) {
    return this.one<QuoteRow>('select * from quotes where id = $1', [id]);
  }
  updateQuote(id: string, patch: Partial<QuoteRow>) {
    return this.update<QuoteRow>('quotes', id, patch);
  }
  listQuotes(projectId: string, limit: number) {
    return this.many<QuoteRow>(
      `select q.* from quotes q join requests r on r.id = q.request_id
       where r.project_id = $1 order by q.created_at desc limit $2`,
      [projectId, limit],
    );
  }
  pendingCommands(limit = 20) {
    return this.many<CommandRow>("select * from commands where status = 'pendiente' order by created_at limit $1", [limit]);
  }
  async finishCommand(id: string, status: 'hecho' | 'error', error?: string | null) {
    await this.db.query('update commands set status = $2, error = $3, done_at = now() where id = $1', [id, status, error ?? null]);
  }
  close() {
    return this.db.close();
  }

  // ───────────────────────── R1 (0004) ─────────────────────────

  private schemaP: Promise<SchemaInfo> | null = null;
  schema(): Promise<SchemaInfo> {
    this.schemaP ??= (async () => {
      const [row] = await this.db.query<Record<string, boolean>>(`select ${R1_PROBES.map(([, sql], i) => `${sql} as p${i}`).join(', ')}`);
      const missing = R1_PROBES.filter((_, i) => !row?.[`p${i}`]).map(([name]) => name);
      return { r1: missing.length === 0, missing };
    })().catch((err) => {
      this.schemaP = null;
      throw err;
    });
    return this.schemaP;
  }
  private async needR1(what: string): Promise<void> {
    if (!(await this.schema()).r1) throw new MissingMigrationError(what);
  }

  async markProcessed(key: string, source: string) {
    await this.needR1('processed_updates.key');
    const rows = await this.db.query('insert into processed_updates (key, source) values ($1, $2) on conflict (key) do nothing returning id', [key, source]);
    return rows.length > 0;
  }

  async enqueueJob(j: NewJob) {
    await this.needR1('jobs');
    const [row] = await this.db.query<{ id: string; inserted: boolean }>(
      'select id, inserted from enqueue_job($1, $2::jsonb, $3::uuid, $4::uuid, $5, $6, $7::timestamptz, $8)',
      [j.kind, JSON.stringify(j.payload ?? {}), j.projectId ?? null, j.requestId ?? null, j.queue ?? 'default', j.dedupeKey ?? null, j.runAfter ?? null, j.maxAttempts ?? 5],
    );
    return { id: row!.id, inserted: row!.inserted };
  }
  async claimJob(worker: string, queues: string[], leaseSeconds: number) {
    const rows = await this.many<JobRow>('select * from claim_job($1, $2::text[], $3)', [worker, queues, leaseSeconds]);
    return rows[0] ?? null;
  }
  async heartbeatJob(id: string, worker: string, leaseSeconds: number) {
    const [row] = await this.db.query<{ ok: boolean }>('select heartbeat_job($1::uuid, $2, $3) as ok', [id, worker, leaseSeconds]);
    return !!row?.ok;
  }
  async completeJob(id: string, worker: string) {
    const [row] = await this.db.query<{ ok: boolean }>('select complete_job($1::uuid, $2) as ok', [id, worker]);
    return !!row?.ok;
  }
  async failJob(id: string, worker: string, error: string, opts: FailJobOptions = {}) {
    const rows = await this.many<JobRow>('select * from fail_job($1::uuid, $2, $3, $4, $5, $6)', [
      id, worker, error, opts.retry ?? true, opts.baseSeconds ?? 5, opts.maxBackoffSeconds ?? 600,
    ]);
    return rows[0] ?? null;
  }
  getJob(id: string) {
    return this.one<JobRow>('select * from jobs where id = $1', [id]);
  }
  async requestsWithActiveJobs(requestIds: string[]) {
    if (requestIds.length === 0 || !(await this.schema()).r1) return new Set<string>();
    const rows = await this.db.query<{ request_id: string }>(
      "select distinct request_id from jobs where request_id = any($1::uuid[]) and status in ('pending', 'running')",
      [requestIds],
    );
    return new Set(rows.map((r) => r.request_id));
  }
  async jobsSummary() {
    if (!(await this.schema()).r1) return [];
    return this.many<JobsSummaryRow>('select * from jobs_summary()');
  }
  async purgeOldRows() {
    if (!(await this.schema()).r1) return {};
    const [row] = await this.db.query<{ r: Record<string, number> }>('select purge_old_rows() as r');
    return row?.r ?? {};
  }

  async labelRequest(requestId: string, to: LabelCategory, reason?: string | null, actorUserId?: string | null) {
    await this.needR1('request_labels');
    return (await this.one<RequestLabelRow>('select * from label_request($1::uuid, $2, $3, $4::uuid)', [requestId, to, reason ?? null, actorUserId ?? null]))!;
  }
  async similarLabeledRequests(factoryId: string, text: string, k = 5) {
    if (!(await this.schema()).r1) return [];
    return this.many<SimilarLabeledRow>('select * from similar_labeled_requests($1::uuid, $2, $3)', [factoryId, text, k]);
  }
  async countFactoryRequestsSince(factoryId: string, sinceIso: string) {
    const r = await this.one<{ n: number }>(
      'select count(*)::int as n from requests r join projects p on p.id = r.project_id where p.factory_id = $1 and r.created_at >= $2',
      [factoryId, sinceIso],
    );
    return Number(r?.n ?? 0);
  }

  async getAiSettings(factoryId: string, projectId: string | null) {
    if (!(await this.schema()).r1) return null;
    return this.one<AiSettingsRow>(
      'select * from ai_settings where factory_id = $1 and (project_id = $2 or project_id is null) order by project_id nulls last limit 1',
      [factoryId, projectId],
    );
  }
  async getAiKey(factoryId: string, projectId: string | null) {
    if (!(await this.schema()).r1) return null;
    const [row] = await this.db.query<{ k: string | null }>('select get_ai_key($1::uuid, $2::uuid) as k', [factoryId, projectId]);
    return row?.k ?? null;
  }
  async setAiKey(factoryId: string, projectId: string | null, key: string) {
    await this.needR1('ai_settings');
    await this.db.query('select set_ai_key($1::uuid, $2::uuid, $3)', [factoryId, projectId, key]);
  }
  async recordUsage(u: UsageEntry) {
    if (!(await this.schema()).r1) return { balanceUsd: null };
    const [row] = await this.db.query<{ r: { balance_usd: number | string | null } }>(
      'select record_usage($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11::numeric, $12::numeric, $13::jsonb) as r',
      [
        u.factoryId, u.projectId ?? null, u.requestId ?? null, u.kind, u.mode, u.model ?? null,
        u.inputTokens ?? 0, u.outputTokens ?? 0, u.cacheReadTokens ?? 0, u.cacheWriteTokens ?? 0,
        u.costUsd, u.priceUsd, u.detail === undefined ? null : JSON.stringify(u.detail),
      ],
    );
    const b = row?.r.balance_usd;
    return { balanceUsd: b === null || b === undefined ? null : Number(b) };
  }
  async getWallet(factoryId: string) {
    if (!(await this.schema()).r1) return null;
    return this.one<WalletRow>('select * from wallets where factory_id = $1', [factoryId]);
  }
  async creditWallet(factoryId: string, amountUsd: number, reference: string) {
    await this.needR1('wallets');
    const [row] = await this.db.query<{ r: { already: boolean; balance_usd: number | string } }>(
      'select credit_wallet($1::uuid, $2::numeric, $3) as r',
      [factoryId, amountUsd, reference],
    );
    return { already: !!row?.r.already, balanceUsd: Number(row?.r.balance_usd ?? 0) };
  }
  async usageSince(factoryId: string, sinceIso: string, projectId?: string | null) {
    if (!(await this.schema()).r1) return { costUsd: 0, priceUsd: 0, calls: 0 };
    const r = await this.one<{ cost_usd: number; price_usd: number; calls: number }>('select * from usage_since($1::uuid, $2::timestamptz, $3::uuid)', [
      factoryId, sinceIso, projectId ?? null,
    ]);
    return { costUsd: Number(r?.cost_usd ?? 0), priceUsd: Number(r?.price_usd ?? 0), calls: Number(r?.calls ?? 0) };
  }

  async githubInstallation(factoryId: string, owner: string) {
    if (!(await this.schema()).r1) return null;
    return this.one<GithubInstallationRow>(
      'select * from github_installations where factory_id = $1 and lower(account_login) = lower($2) and suspended_at is null order by created_at limit 1',
      [factoryId, owner],
    );
  }
}

/** postgres.js adapter (SUPABASE_DB_URL). */
export async function postgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { max: 4, prepare: false, onnotice: () => {} });
  const wrap = (s: { unsafe: (t: string, p?: never[]) => Promise<unknown> }): Pick<Db, 'query'> => ({
    query: async <T>(text: string, params: unknown[] = []) => (await s.unsafe(text, params as never[])) as unknown as T[],
  });
  return {
    ...wrap(sql as never),
    transaction: <T>(fn: (db: Db) => Promise<T>) =>
      sql.begin((tx) => fn({ ...wrap(tx as never), transaction: () => Promise.reject(new Error('anidada')), close: async () => {} })) as Promise<T>,
    close: () => sql.end(),
  };
}
