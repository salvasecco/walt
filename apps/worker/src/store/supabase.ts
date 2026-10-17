import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CommandRow, ContactRow, ContentVersionRow, FactoryRow, ProjectRow, QuoteRow, RequestRow, Rules } from '@walt/core';
import type { NewEvent, NewMessage, NewQuote, NewRequest, NewVersion, RedeemResult, Store } from './types.js';

const NUM_COLS = new Set(['confidence', 'cost_usd', 'amount_usd', 'telegram_chat_id']);
const TIME_COLS = new Set(['created_at', 'updated_at', 'at', 'expires_at', 'published_at', 'done_at']);

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
    const r = await this.one<{ version: number; policies: Rules['policies']; limits: Rules['limits'] }>(
      this.db.from('rules').select('version, policies, limits').eq('project_id', projectId).order('version', { ascending: false }).limit(1),
      'rules',
    );
    return r ? { version: r.version, rules: { policies: r.policies, limits: r.limits } } : null;
  }
  createRequest(r: NewRequest) {
    return this.insert<RequestRow>('requests', r);
  }
  updateRequest(id: string, patch: Partial<RequestRow>) {
    return this.update<RequestRow>('requests', id, patch);
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
        .eq('category', 'permitido')
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
  async publishVersion(projectId: string, versionId: string) {
    must(await this.db.rpc('publish_version', { p_project: projectId, p_version: versionId }), 'publish_version');
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
}

/** Service-role client over HTTPS (no sessions, no realtime needed by the worker). */
export function serviceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
