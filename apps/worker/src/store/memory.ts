import {
  assistantName,
  DEFAULT_RULES,
  SEED_IDS,
  type AiSettingsRow,
  type CommandRow,
  type ContactRow,
  type ContentVersionRow,
  type EventRow,
  type FactoryRow,
  type GithubInstallationRow,
  type JobRow,
  type LabelCategory,
  type MessageRow,
  type ProjectRow,
  type QuoteRow,
  type RequestRow,
  type Rules,
  type SimilarLabelRow,
  type UsageLedgerRow,
  type WalletRow,
} from '@walt/core';
import {
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

const now = () => new Date().toISOString();
/** Categories published without the agency: 'simple' since 0004, 'permitido' before it. */
const AUTO_CATEGORIES = ['simple', 'permitido'];
const uuid = () => globalThis.crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);

/** Trigrams like pg_trgm: lowercase words, padded with two spaces before and one after. */
function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    const w = `  ${word} `;
    for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm's similarity(): shared trigrams over all distinct trigrams. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

type MemoryVersion = ContentVersionRow & { version?: number | null; publish_key?: string | null };

/** In-memory store: same behavior as Postgres for what the worker uses. For console and tests. */
export class MemoryStore implements Store {
  readonly kind = 'memoria' as const;
  factories: FactoryRow[] = [];
  projects: ProjectRow[] = [];
  contacts: ContactRow[] = [];
  invites: { token: string; project_id: string; role: 'cliente' | 'agencia'; max_uses: number; uses: number; expires_at: string }[] = [];
  rules: { project_id: string; version: number; rules: Rules }[] = [];
  requests: RequestRow[] = [];
  events: EventRow[] = [];
  messages: MessageRow[] = [];
  versions: MemoryVersion[] = [];
  approvals: { request_id: string; actor: string; decision: string; via: string; at: string }[] = [];
  quotes: QuoteRow[] = [];
  commands: CommandRow[] = [];
  processed = new Set<number>();
  processedKeys = new Set<string>();
  jobs: JobRow[] = [];
  labels: LabelRow[] = [];
  aiSettings: AiSettingsRow[] = [];
  /** Stand-in for Supabase Vault: secret id → key. */
  vault = new Map<string, string>();
  wallets: WalletRow[] = [];
  ledger: UsageLedgerRow[] = [];
  installations: GithubInstallationRow[] = [];
  private eventSeq = 0;

  async markUpdateProcessed(updateId: number) {
    if (this.processed.has(updateId)) return false;
    this.processed.add(updateId);
    return true;
  }
  async getProject(id: string) {
    return clone(this.projects.find((p) => p.id === id) ?? null);
  }
  async getFactory(id: string) {
    return clone(this.factories.find((f) => f.id === id) ?? null);
  }
  async projectsByRepo(owner: string, name: string) {
    const o = owner.toLowerCase();
    const n = name.toLowerCase();
    return clone(this.projects.filter((p) => p.repo_owner.toLowerCase() === o && p.repo_name.toLowerCase() === n));
  }
  async getContactByChat(chatId: number) {
    return clone(this.contacts.find((c) => c.telegram_chat_id === chatId) ?? null);
  }
  async getContact(id: string) {
    return clone(this.contacts.find((c) => c.id === id) ?? null);
  }
  async listContacts(projectId: string, role?: 'cliente' | 'agencia') {
    return clone(this.contacts.filter((c) => c.project_id === projectId && (!role || c.role === role)));
  }
  async ensureContact(c: Pick<ContactRow, 'project_id' | 'display_name' | 'role' | 'telegram_chat_id'>) {
    const existing = this.contacts.find((x) => x.telegram_chat_id === c.telegram_chat_id);
    if (existing) {
      Object.assign(existing, c);
      return clone(existing);
    }
    const row: ContactRow = { id: uuid(), created_at: now(), ...c };
    this.contacts.push(row);
    return clone(row);
  }
  async redeemInvite(token: string, chatId: number, displayName: string): Promise<RedeemResult> {
    const inv = this.invites.find((i) => i.token === token);
    if (!inv) return { ok: false, reason: 'no_existe' };
    if (new Date(inv.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'vencida' };
    if (inv.uses >= inv.max_uses) return { ok: false, reason: 'sin_usos' };
    inv.uses++;
    const contact = await this.ensureContact({ project_id: inv.project_id, role: inv.role, display_name: displayName, telegram_chat_id: chatId });
    return { ok: true, contact };
  }
  async latestRules(projectId: string) {
    const list = this.rules.filter((r) => r.project_id === projectId).sort((a, b) => b.version - a.version);
    const r = list[0];
    return r ? clone({ version: r.version, rules: r.rules }) : null;
  }
  async createRequest(r: NewRequest) {
    if (this.requests.some((x) => x.short_id === r.short_id)) throw new Error('short_id repetido');
    const row: RequestRow = {
      id: uuid(),
      created_at: now(),
      updated_at: now(),
      status: 'recibido',
      category: null,
      lane: null,
      confidence: null,
      interpretation: null,
      ops: null,
      changes: null,
      gate: null,
      rules_version: null,
      draft_version_id: null,
      live_version_id: null,
      parent_request_id: null,
      pr_url: null,
      pr_number: null,
      preview_url: null,
      quote_id: null,
      error: null,
      cost_usd: 0,
      usage: null,
      ...r,
    };
    this.requests.push(row);
    return clone(row);
  }
  async updateRequest(id: string, patch: Partial<RequestRow>) {
    const row = this.requests.find((r) => r.id === id);
    if (!row) throw new Error(`No existe el pedido ${id}`);
    Object.assign(row, clone(patch), { updated_at: now() });
    return clone(row);
  }
  async getRequest(id: string) {
    return clone(this.requests.find((r) => r.id === id) ?? null);
  }
  async getRequestByShortId(shortId: string) {
    return clone(this.requests.find((r) => r.short_id === shortId) ?? null);
  }
  async latestRequestOfContact(contactId: string, statuses: string[]) {
    const list = this.requests.filter((r) => r.contact_id === contactId && statuses.includes(r.status));
    return clone(list.at(-1) ?? null);
  }
  async requestsWithStatus(statuses: string[]) {
    return clone(this.requests.filter((r) => statuses.includes(r.status)));
  }
  async countRequestsSince(contactId: string, sinceIso: string) {
    return this.requests.filter((r) => r.contact_id === contactId && r.created_at >= sinceIso).length;
  }
  async countAutoPublishedSince(projectId: string, sinceIso: string) {
    return this.requests.filter(
      (r) => r.project_id === projectId && AUTO_CATEGORIES.includes(String(r.category)) && r.live_version_id && r.created_at >= sinceIso,
    ).length;
  }
  async addEvent(e: NewEvent) {
    this.events.push({ id: ++this.eventSeq, at: now(), detail: null, duration_ms: null, ...clone(e) } as EventRow);
  }
  async addMessage(m: NewMessage) {
    this.messages.push({ id: uuid(), at: now(), request_id: null, media: null, ...clone(m) } as MessageRow);
  }
  async recentMessages(contactId: string, limit: number) {
    return clone(this.messages.filter((m) => m.contact_id === contactId).slice(-limit));
  }
  async getLiveVersion(projectId: string) {
    return clone(this.versions.find((v) => v.project_id === projectId && v.status === 'viva') ?? null);
  }
  async getVersion(id: string) {
    return clone(this.versions.find((v) => v.id === id) ?? null);
  }
  async createVersion(v: NewVersion) {
    const version = Math.max(0, ...this.versions.filter((x) => x.project_id === v.project_id).map((x) => x.version ?? 0)) + 1;
    const row: MemoryVersion = {
      version,
      publish_key: null,
      id: uuid(),
      created_at: now(),
      request_id: null,
      parent_id: null,
      status: 'borrador',
      git_commit_sha: null,
      git_error: null,
      published_at: null,
      ...clone(v),
    };
    if (row.status === 'viva' && this.versions.some((x) => x.project_id === row.project_id && x.status === 'viva')) {
      throw new Error('Ya hay una versión viva');
    }
    this.versions.push(row);
    return clone(row);
  }
  async updateVersion(id: string, patch: Partial<ContentVersionRow>) {
    const row = this.versions.find((v) => v.id === id);
    if (row) Object.assign(row, clone(patch));
  }
  /** Same rules as publish_version_v2: optimistic on the draft's parent, idempotent by version and key. */
  async publishVersion(projectId: string, versionId: string, opts: PublishOptions = {}): Promise<PublishResult> {
    if (opts.key) {
      const done = this.versions.find((x) => x.publish_key === opts.key);
      if (done) return { already: true, version: done.version ?? null };
    }
    const v = this.versions.find((x) => x.id === versionId);
    if (!v) throw new Error(`La versión ${versionId} no existe`);
    if (v.project_id !== projectId) throw new Error(`La versión ${versionId} no es del proyecto ${projectId}`);
    if (v.status === 'viva') return { already: true, version: v.version ?? null };
    if (v.status !== 'borrador') throw new Error(`La versión ${versionId} está ${v.status}: solo se publica un borrador`);
    const live = this.versions.find((x) => x.project_id === projectId && x.status === 'viva');
    const expected = opts.expectedLive ?? v.parent_id;
    if (expected && live?.id !== expected) throw new VersionConflictError(projectId);
    for (const x of this.versions) if (x.project_id === projectId && x.status === 'viva' && x.id !== versionId) x.status = 'reemplazada';
    v.status = 'viva';
    v.published_at = now();
    if (opts.key) v.publish_key = opts.key;
    return { already: false, version: v.version ?? null };
  }
  async addApproval(a: { request_id: string; actor: string; decision: string; via: string }) {
    this.approvals.push({ ...a, at: now() });
  }
  async createQuote(q: NewQuote) {
    const row: QuoteRow = { id: uuid(), created_at: now(), status: 'borrador', ...q };
    this.quotes.push(row);
    return clone(row);
  }
  async getQuote(id: string) {
    return clone(this.quotes.find((q) => q.id === id) ?? null);
  }
  async updateQuote(id: string, patch: Partial<QuoteRow>) {
    const row = this.quotes.find((q) => q.id === id);
    if (!row) throw new Error(`No existe el presupuesto ${id}`);
    Object.assign(row, patch);
    return clone(row);
  }
  async listQuotes(projectId: string, limit: number) {
    const reqIds = new Set(this.requests.filter((r) => r.project_id === projectId).map((r) => r.id));
    return clone(this.quotes.filter((q) => reqIds.has(q.request_id)).reverse().slice(0, limit));
  }
  async pendingCommands(limit = 20) {
    return clone(this.commands.filter((c) => c.status === 'pendiente').slice(0, limit));
  }
  async finishCommand(id: string, status: 'hecho' | 'error', error?: string | null) {
    const c = this.commands.find((x) => x.id === id);
    if (c) Object.assign(c, { status, error: error ?? null, done_at: now() });
  }
  /** Test helper: queue a panel command. */
  addCommand(c: Pick<CommandRow, 'type'> & Partial<CommandRow>): CommandRow {
    const row: CommandRow = { id: uuid(), created_at: now(), request_id: null, payload: null, status: 'pendiente', error: null, done_at: null, ...c };
    this.commands.push(row);
    return row;
  }
  async close() {}

  // ───────────────────────── R1 (0004) ─────────────────────────

  async schema(): Promise<SchemaInfo> {
    return { r1: true, missing: [] };
  }

  async markProcessed(key: string) {
    if (this.processedKeys.has(key)) return false;
    this.processedKeys.add(key);
    return true;
  }

  async enqueueJob(j: NewJob) {
    if (j.dedupeKey) {
      const existing = this.jobs.find((x) => x.dedupe_key === j.dedupeKey);
      if (existing) return { id: existing.id, inserted: false };
    }
    const at = now();
    const row: JobRow = {
      id: uuid(),
      kind: j.kind,
      queue: j.queue ?? 'default',
      payload: clone(j.payload ?? {}),
      project_id: j.projectId ?? null,
      request_id: j.requestId ?? null,
      dedupe_key: j.dedupeKey ?? null,
      status: 'pending',
      attempts: 0,
      max_attempts: Math.max(1, j.maxAttempts ?? 5),
      run_after: j.runAfter ?? at,
      last_error: null,
      dead: false,
      locked_at: null,
      locked_by: null,
      lease_until: null,
      finished_at: null,
      created_at: at,
    };
    this.jobs.push(row);
    return { id: row.id, inserted: true };
  }
  /** Same order and exclusivity as claim_job: oldest first, strict order and one running job per project and queue. */
  async claimJob(worker: string, queues: string[], leaseSeconds: number) {
    const t = Date.now();
    for (const j of this.jobs) {
      if (j.status === 'running' && queues.includes(j.queue) && j.lease_until && Date.parse(j.lease_until) < t) {
        const dead = j.attempts >= j.max_attempts;
        Object.assign(j, {
          status: dead ? 'failed' : 'pending',
          dead,
          last_error: 'Se venció el lease: el worker se cayó o se colgó',
          locked_by: null,
          lease_until: null,
          run_after: now(),
          finished_at: dead ? now() : null,
        });
      }
    }
    const seen = new Set<string>();
    for (const j of this.jobs) {
      if (j.status !== 'pending' || !queues.includes(j.queue)) continue;
      if (j.project_id) {
        const key = `${j.project_id}|${j.queue}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (this.jobs.some((r) => r.project_id === j.project_id && r.queue === j.queue && r.status === 'running')) continue;
      }
      if (Date.parse(j.run_after) > t) continue;
      Object.assign(j, {
        status: 'running',
        attempts: j.attempts + 1,
        locked_at: now(),
        locked_by: worker,
        lease_until: new Date(t + Math.max(leaseSeconds, 5) * 1000).toISOString(),
      });
      return clone(j);
    }
    return null;
  }
  private ownedJob(id: string, worker: string): JobRow | undefined {
    return this.jobs.find((j) => j.id === id && j.locked_by === worker && j.status === 'running');
  }
  async heartbeatJob(id: string, worker: string, leaseSeconds: number) {
    const j = this.ownedJob(id, worker);
    if (!j) return false;
    j.lease_until = new Date(Date.now() + Math.max(leaseSeconds, 5) * 1000).toISOString();
    return true;
  }
  async completeJob(id: string, worker: string) {
    const j = this.ownedJob(id, worker);
    if (!j) return false;
    Object.assign(j, { status: 'done', finished_at: now(), lease_until: null, last_error: null });
    return true;
  }
  async failJob(id: string, worker: string, error: string, opts: FailJobOptions = {}) {
    const j = this.ownedJob(id, worker);
    if (!j) return null;
    const dead = opts.retry === false || j.attempts >= j.max_attempts;
    const backoff = Math.min(opts.maxBackoffSeconds ?? 600, (opts.baseSeconds ?? 5) * 2 ** Math.max(j.attempts - 1, 0)) * (0.75 + Math.random() * 0.5);
    Object.assign(j, {
      last_error: error.slice(0, 2000),
      locked_by: null,
      lease_until: null,
      dead,
      status: dead ? 'failed' : 'pending',
      finished_at: dead ? now() : null,
      run_after: new Date(Date.now() + backoff * 1000).toISOString(),
    });
    return clone(j);
  }
  async getJob(id: string) {
    return clone(this.jobs.find((j) => j.id === id) ?? null);
  }
  async requestsWithActiveJobs(requestIds: string[]) {
    const ids = new Set(requestIds);
    return new Set(this.jobs.filter((j) => j.request_id && ids.has(j.request_id) && (j.status === 'pending' || j.status === 'running')).map((j) => j.request_id!));
  }
  async jobsSummary() {
    const groups = new Map<string, JobsSummaryRow>();
    for (const j of this.jobs) {
      if (j.status === 'done') continue;
      const key = `${j.queue}|${j.status}`;
      const g = groups.get(key) ?? { queue: j.queue, status: j.status, total: 0, oldest: j.created_at };
      g.total++;
      if (g.oldest && j.created_at < g.oldest) g.oldest = j.created_at;
      groups.set(key, g);
    }
    return [...groups.values()];
  }
  async purgeOldRows() {
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const before = this.jobs.length;
    this.jobs = this.jobs.filter((j) => !(j.status === 'done' && j.finished_at && j.finished_at < cutoff));
    return { jobs_done: before - this.jobs.length };
  }

  async labelRequest(requestId: string, to: LabelCategory, reason?: string | null, actorUserId?: string | null) {
    const req = this.requests.find((r) => r.id === requestId);
    if (!req) throw new Error(`No existe el pedido ${requestId}`);
    const project = this.projects.find((p) => p.id === req.project_id)!;
    const row: LabelRow = {
      id: uuid(),
      request_id: requestId,
      factory_id: project.factory_id,
      from_category: req.category,
      to_category: to,
      reason: reason?.trim() || null,
      actor_user_id: actorUserId ?? null,
      created_at: now(),
    };
    this.labels.push(row);
    return clone(row);
  }
  async similarLabeledRequests(factoryId: string, text: string, k = 5) {
    const latest = new Map<string, LabelRow>();
    for (const l of this.labels) if (l.factory_id === factoryId) latest.set(l.request_id, l);
    const out: SimilarLabelRow[] = [];
    for (const l of latest.values()) {
      const req = this.requests.find((r) => r.id === l.request_id);
      if (!req?.raw_text) continue;
      out.push({
        request_id: l.request_id,
        raw_text: req.raw_text,
        from_category: l.from_category,
        to_category: l.to_category,
        reason: l.reason,
        similarity: trigramSimilarity(req.raw_text, text),
        labeled_at: l.created_at,
      });
    }
    return out.sort((a, b) => b.similarity - a.similarity || b.labeled_at.localeCompare(a.labeled_at)).slice(0, Math.max(0, Math.min(k, 50)));
  }
  async similarExamples(q: ExamplesQuery) {
    return toPromptExamples(await this.similarLabeledRequests(q.factoryId, q.text, q.limit * 2), q.limit);
  }
  async countFactoryRequestsSince(factoryId: string, sinceIso: string) {
    const projects = new Set(this.projects.filter((p) => p.factory_id === factoryId).map((p) => p.id));
    return this.requests.filter((r) => projects.has(r.project_id) && r.created_at >= sinceIso).length;
  }

  async getAiSettings(factoryId: string, projectId: string | null) {
    const rows = this.aiSettings.filter((r) => r.factory_id === factoryId);
    return clone(rows.find((r) => projectId && r.project_id === projectId) ?? rows.find((r) => r.project_id === null) ?? null);
  }
  async getAiKey(factoryId: string, projectId: string | null) {
    const rows = this.aiSettings.filter((r) => r.factory_id === factoryId && r.secret_id);
    const row = rows.find((r) => projectId && r.project_id === projectId) ?? rows.find((r) => r.project_id === null);
    return row?.secret_id ? (this.vault.get(row.secret_id) ?? null) : null;
  }
  async setAiKey(factoryId: string, projectId: string | null, key: string) {
    if (key.trim().length < 20) throw new Error('La clave no parece una clave de API');
    let row = this.aiSettings.find((r) => r.factory_id === factoryId && r.project_id === projectId);
    const secretId = row?.secret_id ?? uuid();
    this.vault.set(secretId, key.trim());
    if (!row) {
      row = {
        id: uuid(), factory_id: factoryId, project_id: projectId, mode: 'byok', secret_id: null, key_hint: null, key_validated_at: null,
        monthly_cap_usd: null, request_cap_usd: null, alert_pct: 80, model_classify: null, model_code: null, created_at: now(), updated_at: now(),
      };
      this.aiSettings.push(row);
    }
    Object.assign(row, { mode: 'byok', secret_id: secretId, key_hint: key.trim().slice(-4), key_validated_at: now(), updated_at: now() });
  }
  private wallet(factoryId: string): WalletRow {
    let w = this.wallets.find((x) => x.factory_id === factoryId);
    if (!w) {
      w = { factory_id: factoryId, balance_usd: 0, markup_pct: 30, low_balance_usd: 5, auto_recharge: false, auto_recharge_usd: null, created_at: now(), updated_at: now() };
      this.wallets.push(w);
    }
    return w;
  }
  async recordUsage(u: UsageEntry) {
    let delta = 0;
    let balance: number | null = this.wallets.find((x) => x.factory_id === u.factoryId)?.balance_usd ?? null;
    if (u.mode === 'credits' && u.priceUsd > 0) {
      const w = this.wallet(u.factoryId);
      delta = -u.priceUsd;
      w.balance_usd = Math.round((w.balance_usd + delta) * 1e6) / 1e6;
      balance = w.balance_usd;
    }
    this.ledger.push({
      id: uuid(), factory_id: u.factoryId, project_id: u.projectId ?? null, request_id: u.requestId ?? null, kind: u.kind, mode: u.mode,
      model: u.model ?? null, input_tokens: u.inputTokens ?? 0, output_tokens: u.outputTokens ?? 0, cache_read_tokens: u.cacheReadTokens ?? 0,
      cache_write_tokens: u.cacheWriteTokens ?? 0, cost_usd: u.costUsd, price_usd: u.priceUsd, wallet_delta_usd: delta, balance_after_usd: balance,
      reference: null, detail: u.detail ?? null, created_at: now(),
    });
    return { balanceUsd: balance };
  }
  async getWallet(factoryId: string) {
    return clone(this.wallets.find((w) => w.factory_id === factoryId) ?? null);
  }
  async creditWallet(factoryId: string, amountUsd: number, reference: string) {
    const w = this.wallet(factoryId);
    if (this.ledger.some((l) => l.reference === reference)) return { already: true, balanceUsd: w.balance_usd };
    w.balance_usd = Math.round((w.balance_usd + amountUsd) * 1e6) / 1e6;
    this.ledger.push({
      id: uuid(), factory_id: factoryId, project_id: null, request_id: null, kind: 'recharge', mode: 'credits', model: null, input_tokens: 0,
      output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0, price_usd: 0, wallet_delta_usd: amountUsd,
      balance_after_usd: w.balance_usd, reference, detail: null, created_at: now(),
    });
    return { already: false, balanceUsd: w.balance_usd };
  }
  async usageSince(factoryId: string, sinceIso: string, projectId?: string | null) {
    const rows = this.ledger.filter(
      (l) => l.factory_id === factoryId && l.created_at >= sinceIso && (l.kind === 'ai' || l.kind === 'agent') && (!projectId || l.project_id === projectId),
    );
    return { costUsd: rows.reduce((a, l) => a + l.cost_usd, 0), priceUsd: rows.reduce((a, l) => a + l.price_usd, 0), calls: rows.length };
  }

  async githubInstallation(factoryId: string, owner: string) {
    return clone(
      this.installations.find((i) => i.factory_id === factoryId && i.account_login.toLowerCase() === owner.toLowerCase() && !i.suspended_at) ?? null,
    );
  }
}

export interface MemorySeed {
  agencyName: string;
  siteUrl: string;
  repo: string;
  content: unknown;
}

/** Same data as `pnpm seed`, in memory: agency, bakery project, rules v1 and the live version. */
export function seedMemory(store: MemoryStore, s: MemorySeed): void {
  const [owner, name] = s.repo.split('/') as [string, string];
  const at = now();
  store.factories.push({ id: SEED_IDS.agency, name: s.agencyName, assistant_name: assistantName(s.agencyName), created_at: at });
  store.projects.push({
    id: SEED_IDS.project,
    factory_id: SEED_IDS.agency,
    name: 'Panadería Mabel',
    client_name: 'Mabel',
    repo_owner: owner,
    repo_name: name,
    default_branch: 'main',
    mode: 'contenido',
    config_path: 'walt.config.json',
    site_url: s.siteUrl,
    created_at: at,
  });
  store.rules.push({ project_id: SEED_IDS.project, version: 1, rules: structuredClone(DEFAULT_RULES) });
  store.versions.push({
    id: uuid(),
    version: 1,
    publish_key: null,
    project_id: SEED_IDS.project,
    request_id: null,
    parent_id: null,
    status: 'viva',
    content: clone(s.content),
    git_commit_sha: null,
    git_error: null,
    published_at: at,
    created_at: at,
  });
}
