import {
  assistantName,
  DEFAULT_RULES,
  SEED_IDS,
  type CommandRow,
  type ContactRow,
  type ContentVersionRow,
  type EventRow,
  type FactoryRow,
  type MessageRow,
  type ProjectRow,
  type QuoteRow,
  type RequestRow,
  type Rules,
} from '@dale/core';
import type { NewEvent, NewMessage, NewQuote, NewRequest, NewVersion, RedeemResult, Store } from './types.js';

const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);

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
  versions: ContentVersionRow[] = [];
  approvals: { request_id: string; actor: string; decision: string; via: string; at: string }[] = [];
  quotes: QuoteRow[] = [];
  commands: CommandRow[] = [];
  processed = new Set<number>();
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
    return list[0] ? clone({ version: list[0].version, rules: list[0].rules }) : null;
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
      (r) => r.project_id === projectId && r.category === 'permitido' && r.live_version_id && r.created_at >= sinceIso,
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
    const row: ContentVersionRow = {
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
  async publishVersion(projectId: string, versionId: string) {
    const v = this.versions.find((x) => x.id === versionId);
    if (!v) throw new Error(`La versión ${versionId} no existe`);
    if (v.project_id !== projectId) throw new Error(`La versión ${versionId} no es del proyecto ${projectId}`);
    for (const x of this.versions) if (x.project_id === projectId && x.status === 'viva' && x.id !== versionId) x.status = 'reemplazada';
    v.status = 'viva';
    v.published_at = now();
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
    config_path: 'dale.config.json',
    site_url: s.siteUrl,
    created_at: at,
  });
  store.rules.push({ project_id: SEED_IDS.project, version: 1, rules: structuredClone(DEFAULT_RULES) });
  store.versions.push({
    id: uuid(),
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
