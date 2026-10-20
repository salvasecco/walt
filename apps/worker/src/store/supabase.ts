import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AiSettingsRow,
  CommandRow,
  ContactRow,
  ContentVersionRow,
  FactoryRow,
  GithubInstallationRow,
  JobRow,
  LabelCategory,
  ProjectRow,
  QuoteRow,
  RequestRow,
  Rules,
  SimilarLabelRow,
  WalletRow,
} from '@walt/core';
import {
  legacyCategoryPatch,
  MissingMigrationError,
  toPromptExamples,
  VersionConflictError,
  type ExamplesQuery,
  type FailJobOptions,
  type JobsSummaryRow,
  type LabelRow,
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

const NUM_COLS = new Set([
  'confidence', 'cost_usd', 'amount_usd', 'telegram_chat_id',
  // 0004
  'price_usd', 'wallet_delta_usd', 'balance_after_usd', 'balance_usd', 'markup_pct', 'low_balance_usd', 'auto_recharge_usd',
  'monthly_cap_usd', 'request_cap_usd', 'similarity', 'installation_id', 'total', 'calls',
]);
const TIME_COLS = new Set([
  'created_at', 'updated_at', 'at', 'expires_at', 'published_at', 'done_at',
  // 0004
  'run_after', 'locked_at', 'lease_until', 'finished_at', 'labeled_at', 'key_validated_at', 'suspended_at', 'oldest',
]);

const NIL = '00000000-0000-4000-8000-000000000000';

/**
 * What 0004 adds that is missing, probed over REST without side effects (tables and columns with
 * `head` selects, functions with nil ids). Shared with `pnpm db:migrate`.
 */
export async function probeR1(db: SupabaseClient): Promise<string[]> {
  const missing: string[] = [];
  const tables = ['jobs', 'request_labels', 'memberships', 'ai_settings', 'wallets', 'usage_ledger', 'github_installations'];
  const cols: [string, string][] = [
    ['rules', 'policy_text, config'],
    ['content_versions', 'version, publish_key'],
    ['processed_updates', 'key, source'],
  ];
  // GET with limit(0), never HEAD: supabase-js turns the 404 of a HEAD to a missing table into a 204 without error.
  const checks = await Promise.all([
    ...tables.map(async (t) => ((await db.from(t).select('*').limit(0)).error ? t : null)),
    ...cols.map(async ([t, c]) => ((await db.from(t).select(c).limit(0)).error ? `${t}.(${c})` : null)),
    (async () => {
      // v2 answers with its own "no existe"; PostgREST says PGRST202 if the function is missing.
      const { error } = await db.rpc('publish_version_v2', { p_project: NIL, p_version: NIL });
      return error && (error.code === 'PGRST202' || !/no existe/.test(error.message)) ? 'publish_version_v2' : null;
    })(),
    (async () => ((await db.rpc('similar_labeled_requests', { p_factory: NIL, p_text: '', p_k: 1 })).error ? 'similar_labeled_requests' : null))(),
    (async () => ((await db.rpc('jobs_summary')).error ? 'jobs_summary' : null))(),
  ]);
  for (const c of checks) if (c) missing.push(c);
  return missing;
}

/** Same shape as PgStore rows: numbers as numbers, timestamps as ISO strings with Z. */
function norm<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) out[k] = v;
    else if (NUM_COLS.has(k)) out[k] = Number(v);
    else if (TIME_COLS.has(k) && typeof v === 'string') out[k] = new Date(v).toISOString();
    else out[k] = v;
  }
  return out as T;
}

function defined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
}

type Res<D> = { data: D | null; error: { message: string } | null };

function must<D>(res: Res<D>, what: string): D {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as D;
}

/**
 * Store over the Supabase REST API (supabase-js with the service role, HTTPS only).
 * Writes that PgStore does in a transaction use compare-and-swap here instead.
 */
export class SupabaseStore implements Store {
  readonly kind = 'postgres' as const;
  constructor(private readonly db: SupabaseClient) {}

  private async one<T>(res: PromiseLike<Res<unknown>>, what: string): Promise<T | null> {
    const data = must(await res, what) as Record<string, unknown> | Record<string, unknown>[] | null;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? norm<T>(row) : null;
  }
  private async many<T>(res: PromiseLike<Res<unknown>>, what: string): Promise<T[]> {
    return ((must(await res, what) as Record<string, unknown>[] | null) ?? []).map((r) => norm<T>(r));
  }
  private async insert<T>(table: string, values: Record<string, unknown>): Promise<T> {
    return (await this.one<T>(this.db.from(table).insert(defined(values)).select().single(), `insert ${table}`))!;
  }
  private async update<T>(table: string, id: string, patch: Record<string, unknown>): Promise<T> {
    const values = defined(patch);
    const q = Object.keys(values).length
      ? this.db.from(table).update(values).eq('id', id).select().maybeSingle()
      : this.db.from(table).select().eq('id', id).maybeSingle();
    const row = await this.one<T>(q, `update ${table}`);
    if (!row) throw new Error(`No existe ${table} ${id}`);
    return row;
  }
  private async count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string): Promise<number> {
    const res = await q;
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return res.count ?? 0;
  }

  private schemaP: Promise<SchemaInfo> | null = null;
  schema(): Promise<SchemaInfo> {
    this.schemaP ??= probeR1(this.db)
      .then((missing) => ({ r1: missing.length === 0, missing }))
      .catch((err) => {
        this.schemaP = null;
        throw err;
      });
    return this.schemaP;
  }
  private async needR1(what: string): Promise<void> {
    if (!(await this.schema()).r1) throw new MissingMigrationError(what);
  }
  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await this.db.rpc(fn, args);
    if (res.error) {
      if (res.error.code === '40001') throw Object.assign(new Error(res.error.message), { code: '40001' });
      throw new Error(`${fn}: ${res.error.message}`);
    }
    return res.data as T;
  }

  async markUpdateProcessed(updateId: number) {
    const rows = await this.many(
      this.db.from('processed_updates').upsert({ update_id: updateId }, { onConflict: 'update_id', ignoreDuplicates: true }).select('update_id'),
      'processed_updates',
    );
    return rows.length > 0;
  }
  getProject(id: string) {
    return this.one<ProjectRow>(this.db.from('projects').select().eq('id', id).maybeSingle(), 'projects');
  }
  getFactory(id: string) {
    return this.one<FactoryRow>(this.db.from('factories').select().eq('id', id).maybeSingle(), 'factories');
  }
  getContactByChat(chatId: number) {
    return this.one<ContactRow>(this.db.from('contacts').select().eq('telegram_chat_id', chatId).maybeSingle(), 'contacts');
  }
  getContact(id: string) {
    return this.one<ContactRow>(this.db.from('contacts').select().eq('id', id).maybeSingle(), 'contacts');
  }
  listContacts(projectId: string, role?: string) {
    let q = this.db.from('contacts').select().eq('project_id', projectId);
    if (role) q = q.eq('role', role);
    return this.many<ContactRow>(q.order('created_at'), 'contacts');
  }
  async ensureContact(c: Pick<ContactRow, 'project_id' | 'display_name' | 'role' | 'telegram_chat_id'>) {
    return (await this.one<ContactRow>(this.db.from('contacts').upsert(c, { onConflict: 'telegram_chat_id' }).select().single(), 'contacts'))!;
  }
  async redeemInvite(token: string, chatId: number, displayName: string): Promise<RedeemResult> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const inv = await this.one<{ project_id: string; role: 'cliente' | 'agencia'; max_uses: number; uses: number; expires_at: string }>(
        this.db.from('invites').select('project_id, role, max_uses, uses, expires_at').eq('token', token).maybeSingle(),
        'invites',
      );
      if (!inv) return { ok: false, reason: 'no_existe' };
      if (new Date(inv.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'vencida' };
      if (inv.uses >= inv.max_uses) return { ok: false, reason: 'sin_usos' };
      // Compare-and-swap on `uses` instead of `select ... for update`.
      const bumped = await this.many(
        this.db.from('invites').update({ uses: inv.uses + 1 }).eq('token', token).eq('uses', inv.uses).select('token'),
        'invites',
      );
      if (bumped.length === 0) continue;
      const contact = await this.ensureContact({ project_id: inv.project_id, role: inv.role, display_name: displayName, telegram_chat_id: chatId });
      return { ok: true, contact };
    }
    return { ok: false, reason: 'sin_usos' };
  }
  async latestRules(projectId: string) {
    const r1 = (await this.schema()).r1;
    const r = await this.one<{ version: number; policies: Rules['policies']; limits: Rules['limits']; policy_text?: string; config?: unknown }>(
      this.db
        .from('rules')
        .select(r1 ? 'version, policies, limits, policy_text, config' : 'version, policies, limits')
        .eq('project_id', projectId)
        .order('version', { ascending: false })
        .limit(1),
      'rules',
    );
    if (!r) return null;
    const rules = { policies: r.policies, limits: r.limits, ...(r1 ? { policy_text: r.policy_text ?? '', config: r.config ?? {} } : {}) } as Rules;
    return { version: r.version, rules };
  }
  async createRequest(r: NewRequest) {
    return this.insert<RequestRow>('requests', (await this.schema()).r1 ? r : legacyCategoryPatch(r as NewRequest & { category?: unknown }));
  }
  async updateRequest(id: string, patch: Partial<RequestRow>) {
    return this.update<RequestRow>('requests', id, (await this.schema()).r1 ? patch : legacyCategoryPatch(patch));
  }
  getRequest(id: string) {
    return this.one<RequestRow>(this.db.from('requests').select().eq('id', id).maybeSingle(), 'requests');
  }
  getRequestByShortId(shortId: string) {
    return this.one<RequestRow>(this.db.from('requests').select().eq('short_id', shortId).maybeSingle(), 'requests');
  }
  latestRequestOfContact(contactId: string, statuses: string[]) {
    return this.one<RequestRow>(
      this.db.from('requests').select().eq('contact_id', contactId).in('status', statuses).order('created_at', { ascending: false }).limit(1),
      'requests',
    );
  }
  requestsWithStatus(statuses: string[]) {
    return this.many<RequestRow>(this.db.from('requests').select().in('status', statuses).order('created_at'), 'requests');
  }
  countRequestsSince(contactId: string, sinceIso: string) {
    return this.count(
      this.db.from('requests').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).gte('created_at', sinceIso),
      'requests',
    );
  }
  countAutoPublishedSince(projectId: string, sinceIso: string) {
    return this.count(
      this.db
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        // 'simple' since 0004; 'permitido' before it.
        .in('category', ['simple', 'permitido'])
        .not('live_version_id', 'is', null)
        .gte('created_at', sinceIso),
      'requests',
    );
  }
  async addEvent(e: NewEvent) {
    must(await this.db.from('events').insert({ ...e, detail: e.detail ?? null, duration_ms: e.duration_ms ?? null }), 'insert events');
  }
  async addMessage(m: NewMessage) {
    must(await this.db.from('messages').insert({ ...m, request_id: m.request_id ?? null, media: m.media ?? null }), 'insert messages');
  }
  async recentMessages(contactId: string, limit: number) {
    const rows = await this.many<{ direction: 'entrada' | 'salida'; text: string | null; at: string; request_id: string | null }>(
      this.db.from('messages').select('direction, text, at, request_id').eq('contact_id', contactId).order('at', { ascending: false }).limit(limit),
      'messages',
    );
    return rows.reverse();
  }
  getLiveVersion(projectId: string) {
    return this.one<ContentVersionRow>(
      this.db.from('content_versions').select().eq('project_id', projectId).eq('status', 'viva').maybeSingle(),
      'content_versions',
    );
  }
  getVersion(id: string) {
    return this.one<ContentVersionRow>(this.db.from('content_versions').select().eq('id', id).maybeSingle(), 'content_versions');
  }
  createVersion(v: NewVersion) {
    return this.insert<ContentVersionRow>('content_versions', v);
  }
  async updateVersion(id: string, patch: Partial<ContentVersionRow>) {
    await this.update('content_versions', id, patch);
  }
  async publishVersion(projectId: string, versionId: string, opts: PublishOptions = {}): Promise<PublishResult> {
    if (!(await this.schema()).r1) {
      must(await this.db.rpc('publish_version', { p_project: projectId, p_version: versionId }), 'publish_version');
      return { already: false, version: null };
    }
    try {
      const r = await this.rpc<{ already: boolean; version: number | null }>('publish_version_v2', {
        p_project: projectId,
        p_version: versionId,
        p_expected_live: opts.expectedLive ?? null,
        p_key: opts.key ?? null,
      });
      return { already: !!r.already, version: r.version ?? null };
    } catch (err) {
      if ((err as { code?: string }).code === '40001') throw new VersionConflictError(projectId);
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
    return this.one<QuoteRow>(this.db.from('quotes').select().eq('id', id).maybeSingle(), 'quotes');
  }
  updateQuote(id: string, patch: Partial<QuoteRow>) {
    return this.update<QuoteRow>('quotes', id, patch);
  }
  async listQuotes(projectId: string, limit: number) {
    // quotes ↔ requests have two foreign keys, so the embed names the one from quotes.request_id.
    const rows = await this.many<QuoteRow & { requests?: unknown }>(
      this.db
        .from('quotes')
        .select('*, requests!quotes_request_id_fkey!inner(project_id)')
        .eq('requests.project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit),
      'quotes',
    );
    return rows.map(({ requests: _r, ...q }) => q as QuoteRow);
  }
  pendingCommands(limit = 20) {
    return this.many<CommandRow>(this.db.from('commands').select().eq('status', 'pendiente').order('created_at').limit(limit), 'commands');
  }
  async finishCommand(id: string, status: 'hecho' | 'error', error?: string | null) {
    must(
      await this.db.from('commands').update({ status, error: error ?? null, done_at: new Date().toISOString() }).eq('id', id),
      'update commands',
    );
  }
  async close() {
    await this.db.removeAllChannels();
  }

  // ───────────────────────── R1 (0004) ─────────────────────────

  async markProcessed(key: string, source: string) {
    await this.needR1('processed_updates.key');
    const rows = await this.many(
      this.db.from('processed_updates').upsert({ key, source }, { onConflict: 'key', ignoreDuplicates: true }).select('id'),
      'processed_updates',
    );
    return rows.length > 0;
  }

  async enqueueJob(j: NewJob) {
    await this.needR1('jobs');
    const rows = await this.rpc<{ id: string; inserted: boolean }[]>('enqueue_job', {
      p_kind: j.kind,
      p_payload: j.payload ?? {},
      p_project: j.projectId ?? null,
      p_request: j.requestId ?? null,
      p_queue: j.queue ?? 'default',
      p_dedupe_key: j.dedupeKey ?? null,
      p_run_after: j.runAfter ?? null,
      p_max_attempts: j.maxAttempts ?? 5,
    });
    return { id: rows[0]!.id, inserted: rows[0]!.inserted };
  }
  async claimJob(worker: string, queues: string[], leaseSeconds: number) {
    const rows = await this.rpc<Record<string, unknown>[]>('claim_job', { p_worker: worker, p_queues: queues, p_lease_seconds: leaseSeconds });
    return rows[0] ? norm<JobRow>(rows[0]) : null;
  }
  async heartbeatJob(id: string, worker: string, leaseSeconds: number) {
    return !!(await this.rpc<boolean>('heartbeat_job', { p_id: id, p_worker: worker, p_lease_seconds: leaseSeconds }));
  }
  async completeJob(id: string, worker: string) {
    return !!(await this.rpc<boolean>('complete_job', { p_id: id, p_worker: worker }));
  }
  async failJob(id: string, worker: string, error: string, opts: FailJobOptions = {}) {
    const rows = await this.rpc<Record<string, unknown>[]>('fail_job', {
      p_id: id,
      p_worker: worker,
      p_error: error,
      p_retry: opts.retry ?? true,
      p_base_seconds: opts.baseSeconds ?? 5,
      p_max_backoff_seconds: opts.maxBackoffSeconds ?? 600,
    });
    return rows[0] ? norm<JobRow>(rows[0]) : null;
  }
  getJob(id: string) {
    return this.one<JobRow>(this.db.from('jobs').select().eq('id', id).maybeSingle(), 'jobs');
  }
  async requestsWithActiveJobs(requestIds: string[]) {
    if (requestIds.length === 0 || !(await this.schema()).r1) return new Set<string>();
    const rows = await this.many<{ request_id: string }>(
      this.db.from('jobs').select('request_id').in('request_id', requestIds).in('status', ['pending', 'running']),
      'jobs',
    );
    return new Set(rows.map((r) => r.request_id));
  }
  async jobsSummary() {
    if (!(await this.schema()).r1) return [];
    return ((await this.rpc<Record<string, unknown>[]>('jobs_summary')) ?? []).map((r) => norm<JobsSummaryRow>(r));
  }
  async purgeOldRows() {
    if (!(await this.schema()).r1) return {};
    return (await this.rpc<Record<string, number>>('purge_old_rows')) ?? {};
  }

  async labelRequest(requestId: string, to: LabelCategory, reason?: string | null, actorUserId?: string | null) {
    await this.needR1('request_labels');
    const row = await this.rpc<Record<string, unknown>>('label_request', {
      p_request: requestId,
      p_to_category: to,
      p_reason: reason ?? null,
      p_actor: actorUserId ?? null,
    });
    return norm<LabelRow>(row);
  }
  async similarLabeledRequests(factoryId: string, text: string, k = 5) {
    if (!(await this.schema()).r1) return [];
    const rows = await this.rpc<Record<string, unknown>[]>('similar_labeled_requests', { p_factory: factoryId, p_text: text, p_k: k });
    return (rows ?? []).map((r) => norm<SimilarLabelRow>(r));
  }
  async similarExamples(q: ExamplesQuery) {
    return toPromptExamples(await this.similarLabeledRequests(q.factoryId, q.text, q.limit * 2), q.limit);
  }
  countFactoryRequestsSince(factoryId: string, sinceIso: string) {
    return this.count(
      this.db
        .from('requests')
        .select('id, projects!inner(factory_id)', { count: 'exact', head: true })
        .eq('projects.factory_id', factoryId)
        .gte('created_at', sinceIso),
      'requests',
    );
  }

  async getAiSettings(factoryId: string, projectId: string | null) {
    if (!(await this.schema()).r1) return null;
    const rows = await this.many<AiSettingsRow>(this.db.from('ai_settings').select().eq('factory_id', factoryId), 'ai_settings');
    return rows.find((r) => projectId && r.project_id === projectId) ?? rows.find((r) => r.project_id === null) ?? null;
  }
  async getAiKey(factoryId: string, projectId: string | null) {
    if (!(await this.schema()).r1) return null;
    return (await this.rpc<string | null>('get_ai_key', { p_factory: factoryId, p_project: projectId })) ?? null;
  }
  async setAiKey(factoryId: string, projectId: string | null, key: string) {
    await this.needR1('ai_settings');
    await this.rpc('set_ai_key', { p_factory: factoryId, p_project: projectId, p_key: key });
  }
  async recordUsage(u: UsageEntry) {
    if (!(await this.schema()).r1) return { balanceUsd: null };
    const r = await this.rpc<{ balance_usd: number | string | null }>('record_usage', {
      p_factory: u.factoryId,
      p_project: u.projectId ?? null,
      p_request: u.requestId ?? null,
      p_kind: u.kind,
      p_mode: u.mode,
      p_model: u.model ?? null,
      p_input_tokens: u.inputTokens ?? 0,
      p_output_tokens: u.outputTokens ?? 0,
      p_cache_read_tokens: u.cacheReadTokens ?? 0,
      p_cache_write_tokens: u.cacheWriteTokens ?? 0,
      p_cost_usd: u.costUsd,
      p_price_usd: u.priceUsd,
      p_detail: u.detail ?? null,
    });
    return { balanceUsd: r?.balance_usd === null || r?.balance_usd === undefined ? null : Number(r.balance_usd) };
  }
  async getWallet(factoryId: string) {
    if (!(await this.schema()).r1) return null;
    return this.one<WalletRow>(this.db.from('wallets').select().eq('factory_id', factoryId).maybeSingle(), 'wallets');
  }
  async creditWallet(factoryId: string, amountUsd: number, reference: string) {
    await this.needR1('wallets');
    const r = await this.rpc<{ already: boolean; balance_usd: number | string }>('credit_wallet', {
      p_factory: factoryId,
      p_amount_usd: amountUsd,
      p_reference: reference,
    });
    return { already: !!r.already, balanceUsd: Number(r.balance_usd ?? 0) };
  }
  async usageSince(factoryId: string, sinceIso: string, projectId?: string | null) {
    if (!(await this.schema()).r1) return { costUsd: 0, priceUsd: 0, calls: 0 };
    const rows = await this.rpc<{ cost_usd: number | string; price_usd: number | string; calls: number | string }[]>('usage_since', {
      p_factory: factoryId,
      p_since: sinceIso,
      p_project: projectId ?? null,
    });
    const r = rows?.[0];
    return { costUsd: Number(r?.cost_usd ?? 0), priceUsd: Number(r?.price_usd ?? 0), calls: Number(r?.calls ?? 0) };
  }

  async githubInstallation(factoryId: string, owner: string) {
    if (!(await this.schema()).r1) return null;
    const rows = await this.many<GithubInstallationRow>(
      this.db.from('github_installations').select().eq('factory_id', factoryId).ilike('account_login', owner.replace(/[%_\\]/g, '\\$&')).is('suspended_at', null),
      'github_installations',
    );
    return rows[0] ?? null;
  }
}

/** Service-role client over HTTPS (no sessions, no realtime needed by the worker). */
export function serviceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
