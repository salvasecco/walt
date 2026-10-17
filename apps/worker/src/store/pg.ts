import type { CommandRow, ContactRow, ContentVersionRow, FactoryRow, ProjectRow, QuoteRow, RequestRow, Rules } from '@dale/core';
import type { NewEvent, NewMessage, NewQuote, NewRequest, NewVersion, RedeemResult, Store } from './types.js';

/** Minimal SQL client: postgres.js (`sql.unsafe`) in production, PGlite in tests. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const JSON_COLS = new Set(['interpretation', 'ops', 'changes', 'gate', 'usage', 'content', 'detail', 'media', 'payload', 'policies', 'limits']);
const NUM_COLS = new Set(['confidence', 'cost_usd', 'amount_usd', 'telegram_chat_id']);

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
    const r = await this.one<{ version: number; policies: Rules['policies']; limits: Rules['limits'] }>(
      'select version, policies, limits from rules where project_id = $1 order by version desc limit 1',
      [projectId],
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
  async countRequestsSince(contactId: string, sinceIso: string) {
    const r = await this.one<{ n: number }>('select count(*)::int as n from requests where contact_id = $1 and created_at >= $2', [contactId, sinceIso]);
    return Number(r?.n ?? 0);
  }
  async countAutoPublishedSince(projectId: string, sinceIso: string) {
    const r = await this.one<{ n: number }>(
      `select count(*)::int as n from requests
       where project_id = $1 and category = 'permitido' and live_version_id is not null and created_at >= $2`,
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
  async publishVersion(projectId: string, versionId: string) {
    await this.db.query('select publish_version($1::uuid, $2::uuid)', [projectId, versionId]);
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
