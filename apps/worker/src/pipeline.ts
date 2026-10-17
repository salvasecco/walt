import type { AiProvider } from '@dale/ai';
import {
  asClause,
  buildInventory,
  containsCode,
  buttons as B,
  copy,
  costUsd,
  decide,
  DEFAULT_RULES,
  redact,
  revertChanges,
  runGate,
  shortId as newShortId,
  type Change,
  type CommandRow,
  type ContactRow,
  type Decision,
  type EventStep,
  type FactoryRow,
  type GateResult,
  type Interpretation,
  type Inventory,
  type Op,
  type ProjectRow,
  type RequestRow,
  type RequestStatus,
  type Role,
  type Rules,
  type Turn,
  type Usage,
  type Via,
} from '@dale/core';
import type { RepoRef, RunCodeChangeInput, RunCodeChangeResult } from '@dale/agent';
import type { Screenshotter } from './capture.js';
import type { Button, Channel, Incoming, OutMessage } from './channel/types.js';
import { Queue, withTimeout } from './queue.js';
import type { SiteRepo } from './site/repo.js';
import type { Store } from './store/types.js';

export const TIMEOUTS = { interpret: 45_000, commit: 20_000, agent: 300_000, ai: 45_000 } as const;
export const LIMITS = { perChat: 5, windowMs: 10 * 60_000, queueMax: 20, maxText: 2_000 } as const;

export interface AgentLane {
  runCodeChange(input: RunCodeChangeInput): Promise<RunCodeChangeResult>;
  mergeChange(input: { repo: RepoRef; prNumber: number }): Promise<{ mergeSha: string }>;
  revertChange(input: { repo: RepoRef; mergeSha: string; shortId: string }): Promise<{ revertSha: string }>;
}

export interface WorkerDeps {
  store: Store;
  channel: Channel;
  ai: AiProvider;
  repo: SiteRepo;
  screenshots: Screenshotter;
  agent: AgentLane;
  /** Secret values, for the gate and to redact errors. */
  secrets: string[];
  /** Fallback site URL when the project has none. */
  defaultSiteUrl: string;
  /** True when voice notes can be transcribed (OPENAI_API_KEY and a real provider). */
  canTranscribe?: boolean;
  /** Optional panel URL for the "Ver en el panel" button. */
  panelUrl?: string;
  now?: () => Date;
  log?: (line: string) => void;
  /** Called on every event saved (dry-run prints them). */
  onEvent?: (e: { requestId: string; shortId: string; step: EventStep; status: string; durationMs: number | null; detail: unknown }) => void;
}

interface Ctx {
  project: ProjectRow;
  factory: FactoryRow;
  agencyName: string;
  assistant: string;
}

const YES = /^(si|dale|ok|okey|oka|listo|perfecto|de una|joya|genial|aprobado|publicalo|si,? dale|dale,? si|si,? publicalo)[!.¡ ]*$/;
const NO = /^(no|nop|no era eso|para nada|asi no)[!. ]*$/;
const BACK = /^(volve atras|volver atras|volvelo atras|deshace(lo)?|desacelo|dejalo como estaba|volve a como estaba)[!. ]*$/;
const THANKS = /^(gracias|muchas gracias|genial,? gracias|mil gracias)/;

export function normalizeReply(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Now" in Montevideo (UTC-3, no DST) as ISO with offset, for relative dates. */
export function montevideoIso(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().replace(/\.\d{3}Z$/, '-03:00');
}

function startOfMonthIso(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3)).toISOString();
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const EMPTY_INVENTORY: Inventory = { currency: '', texts: [], colors: [], products: [], categories: [], banner: null, hours: null, sections: null };

/**
 * The worker pipeline (SPEC §9): receive, interpret, decide, draft, approve, publish, revert.
 * Every step saves events and messages; any exception ends in `derivado` with an answer.
 */
export class Worker {
  readonly fast: Queue;
  readonly slow: Queue;
  private readonly awaitingCorrection = new Map<string, string>();
  private readonly now: () => Date;
  private readonly log: (line: string) => void;

  constructor(private readonly d: WorkerDeps) {
    this.now = d.now ?? (() => new Date());
    this.log = d.log ?? ((l) => console.log(l));
    this.fast = new Queue('rápida', LIMITS.queueMax, (e) => this.log(`[cola rápida] ${this.redact(errMsg(e))}`));
    this.slow = new Queue('lenta', LIMITS.queueMax, (e) => this.log(`[cola lenta] ${this.redact(errMsg(e))}`));
  }

  private redact(s: string): string {
    return redact(s, this.d.secrets);
  }

  async idle(): Promise<void> {
    // A fast job may enqueue a slow one and vice versa.
    for (let i = 0; i < 5; i++) {
      await this.fast.onIdle();
      await this.slow.onIdle();
      if (this.fast.size === 0 && this.slow.size === 0) return;
    }
  }

  // ───────────────────────── entrada ─────────────────────────

  /** Entry point for every incoming update. Never throws. */
  async handle(u: Incoming): Promise<void> {
    try {
      if (u.updateId !== undefined && !(await this.d.store.markUpdateProcessed(u.updateId))) return;
      if (u.kind === 'start') return await this.handleStart(u.chatId, u.fromName, u.token);

      const contact = await this.d.store.getContactByChat(u.chatId);
      if (!contact) {
        await this.d.channel.send(u.chatId, { text: copy.noHabilitado() });
        return;
      }
      switch (u.kind) {
        case 'callback':
          await this.d.store.addMessage({ contact_id: contact.id, direction: 'entrada', text: null, media: { callback: u.data } });
          if (!this.fast.push(() => this.handleCallback(contact, u.data, 'telegram'))) await this.say(contact, null, { text: copy.colaLlena() });
          return;
        case 'other':
          await this.d.store.addMessage({ contact_id: contact.id, direction: 'entrada', text: null, media: { tipo: 'otro' } });
          await this.say(contact, null, { text: copy.soloTexto() });
          return;
        case 'voice': {
          if (!(await this.canTranscribe())) {
            await this.d.store.addMessage({ contact_id: contact.id, direction: 'entrada', text: null, media: { tipo: 'audio' } });
            await this.say(contact, null, { text: copy.audioSinTranscripcion() });
            return;
          }
          let text: string;
          try {
            const { data, mime } = await u.download();
            text = await withTimeout(this.d.ai.transcribe(data, mime), TIMEOUTS.ai, 'Transcripción');
          } catch (err) {
            this.log(`[audio] ${this.redact(errMsg(err))}`);
            await this.say(contact, null, { text: copy.audioSinTranscripcion() });
            return;
          }
          if (!text) {
            await this.say(contact, null, { text: copy.audioSinTranscripcion() });
            return;
          }
          return await this.handleText(contact, text, { audio: true });
        }
        case 'text':
          return await this.handleText(contact, u.text);
      }
    } catch (err) {
      this.log(`[entrada] ${this.redact(errMsg(err))}`);
      await this.d.channel.send(u.chatId, { text: copy.derivado() }).catch(() => {});
    }
  }

  private async canTranscribe(): Promise<boolean> {
    return !!this.d.canTranscribe;
  }

  private async handleStart(chatId: number, fromName: string, token?: string): Promise<void> {
    if (token) {
      const r = await this.d.store.redeemInvite(token, chatId, fromName);
      if (!r.ok) {
        await this.d.channel.send(chatId, { text: copy.invitacionInvalida() });
        return;
      }
      const ctx = await this.ctxFor(r.contact.project_id);
      await this.say(r.contact, null, { text: copy.bienvenida(ctx.assistant) });
      return;
    }
    const contact = await this.d.store.getContactByChat(chatId);
    if (!contact) {
      await this.d.channel.send(chatId, { text: copy.noHabilitado() });
      return;
    }
    const ctx = await this.ctxFor(contact.project_id);
    await this.say(contact, null, { text: copy.bienvenida(ctx.assistant) });
  }

  private async handleText(contact: ContactRow, rawText: string, media?: Record<string, unknown>): Promise<void> {
    const text = rawText.slice(0, LIMITS.maxText);
    const reply = normalizeReply(text);

    // Step 3: a short answer to an open request is not a new request.
    if (YES.test(reply) || NO.test(reply) || BACK.test(reply)) {
      const handled = await this.tryQuickReply(contact, text, reply);
      if (handled) return;
    }

    const since = new Date(this.now().getTime() - LIMITS.windowMs).toISOString();
    if ((await this.d.store.countRequestsSince(contact.id, since)) >= LIMITS.perChat) {
      await this.d.store.addMessage({ contact_id: contact.id, direction: 'entrada', text, media: media ?? null });
      await this.say(contact, null, { text: copy.limitePedidos() });
      return;
    }
    if (this.fast.size >= LIMITS.queueMax) {
      await this.d.store.addMessage({ contact_id: contact.id, direction: 'entrada', text, media: media ?? null });
      await this.say(contact, null, { text: copy.colaLlena() });
      return;
    }

    const parent = this.awaitingCorrection.get(contact.id) ?? null;
    this.awaitingCorrection.delete(contact.id);
    const t0 = performance.now();
    const req = await this.createRequest(contact, text, parent);
    await this.d.store.addMessage({ request_id: req.id, contact_id: contact.id, direction: 'entrada', text, media: media ?? null });
    await this.say(contact, req.id, { text: copy.recibido() });
    await this.event(req, 'recibido', 'ok', Math.round(performance.now() - t0), parent ? { correccionDe: parent } : null);
    const queued = this.fast.push(() => this.processRequest(req.id));
    if (!queued) await this.derive(req.id, new Error('Cola llena'));
  }

  private async createRequest(contact: ContactRow, text: string, parent: string | null): Promise<RequestRow> {
    for (let i = 0; ; i++) {
      try {
        return await this.d.store.createRequest({
          short_id: newShortId(),
          project_id: contact.project_id,
          contact_id: contact.id,
          raw_text: text,
          parent_request_id: parent,
        });
      } catch (err) {
        if (i >= 2) throw err; // short_id collision: retry with another
      }
    }
  }

  private async tryQuickReply(contact: ContactRow, text: string, reply: string): Promise<boolean> {
    if (BACK.test(reply)) {
      const last = await this.d.store.latestRequestOfContact(contact.id, ['publicado']);
      if (!last) return false;
      await this.d.store.addMessage({ request_id: last.id, contact_id: contact.id, direction: 'entrada', text });
      this.fast.push(() => this.handleCallback(contact, `undo:${last.short_id}`, 'telegram'));
      return true;
    }
    const open = await this.d.store.latestRequestOfContact(contact.id, ['esperando_cliente']);
    if (!open) return false;
    await this.d.store.addMessage({ request_id: open.id, contact_id: contact.id, direction: 'entrada', text });
    const data = YES.test(reply) ? `ok:${open.short_id}` : `no:${open.short_id}`;
    this.fast.push(() => this.handleCallback(contact, data, 'telegram'));
    return true;
  }

  // ───────────────────────── pedido ─────────────────────────

  async processRequest(requestId: string): Promise<void> {
    try {
      await this.runRequest(requestId);
    } catch (err) {
      await this.derive(requestId, err);
    }
  }

  private async runRequest(requestId: string): Promise<void> {
    const { store } = this.d;
    let req = (await store.getRequest(requestId))!;
    const contact = (await store.getContact(req.contact_id!))!;
    const ctx = await this.ctxFor(req.project_id);
    req = await store.updateRequest(req.id, { status: 'interpretando' });

    const live = await store.getLiveVersion(req.project_id);
    const contract = ctx.project.mode === 'contenido' ? await this.d.repo.loadContract(ctx.project) : null;
    if (ctx.project.mode === 'contenido' && !live) throw new Error('El proyecto no tiene versión viva');
    const inventory = contract && live ? buildInventory(contract.config, live.content) : EMPTY_INVENTORY;
    const rulesRow = await store.latestRules(req.project_id);
    const rules: Rules = rulesRow?.rules ?? DEFAULT_RULES;

    const history = await this.history(contact.id, req.id);
    const { interpretation, usage } = await this.step(req, 'interpretado', async () =>
      withTimeout(
        this.d.ai.interpret({
          inventory,
          history,
          text: req.raw_text,
          agencyName: ctx.agencyName,
          clientName: ctx.project.client_name,
          now: montevideoIso(this.now()),
        }),
        TIMEOUTS.interpret,
        'Interpretación',
      ),
      (r) => ({ resumen: r.interpretation.summary, tipo: r.interpretation.kind, confianza: r.interpretation.confidence, proveedor: this.d.ai.name }),
    );
    req = await this.addUsage(req, [usage]);
    req = await store.updateRequest(req.id, {
      interpretation,
      ops: interpretation.ops,
      confidence: interpretation.confidence,
      rules_version: rulesRow?.version ?? null,
    });

    // aprobacion / revertir from the model with an open request: treat as the answer (SPEC §9 step 3).
    if (interpretation.kind === 'aprobacion' || interpretation.kind === 'revertir') {
      const target =
        interpretation.kind === 'aprobacion'
          ? await store.latestRequestOfContact(contact.id, ['esperando_cliente'])
          : await store.latestRequestOfContact(contact.id, ['publicado']);
      await store.updateRequest(req.id, { status: 'charla', category: 'charla', parent_request_id: target?.id ?? req.parent_request_id });
      await this.event(req, 'decidido', 'ok', 0, { categoria: 'charla', razones: target ? ['Respuesta a un pedido abierto'] : [] });
      if (target) {
        await this.handleCallback(contact, `${interpretation.kind === 'aprobacion' ? 'ok' : 'undo'}:${target.short_id}`, 'telegram');
      } else {
        await this.say(contact, req.id, { text: interpretation.kind === 'aprobacion' ? copy.nadaPendiente() : copy.nadaParaVolver() });
      }
      return;
    }

    let gate: GateResult | null = null;
    if (interpretation.kind === 'cambio' && interpretation.ops.length > 0 && contract && live) {
      const autoPublishedThisMonth = await store.countAutoPublishedSince(req.project_id, startOfMonthIso(this.now()));
      gate = await this.step(
        req,
        'gate',
        async () =>
          runGate({
            config: contract.config,
            content: live.content,
            schema: contract.schema,
            ops: interpretation.ops,
            rules,
            secrets: this.d.secrets,
            autoPublishedThisMonth,
          }),
        (g) => ({ resultado: g.outcome, razones: g.reasons, cambios: g.changes.length }),
      );
    }

    // Phase 2: two concrete readings of an ambiguous change → two previews and a button each.
    if (
      interpretation.kind === 'cambio' &&
      interpretation.ops.length === 0 &&
      (interpretation.options?.length ?? 0) >= 2 &&
      contract &&
      live &&
      !containsCode(req.raw_text)
    ) {
      const autoPublishedThisMonth = await store.countAutoPublishedSince(req.project_id, startOfMonthIso(this.now()));
      const viable = interpretation.options!.slice(0, 2).map((o) => ({
        label: o.label,
        gate: runGate({ config: contract.config, content: live.content, schema: contract.schema, ops: o.ops, rules, secrets: this.d.secrets, autoPublishedThisMonth }),
      }));
      if (viable.every((v) => v.gate.outcome === 'auto' && v.gate.changes.length > 0)) {
        return this.flowOptions(req, contact, ctx, interpretation, viable);
      }
    }

    const decision = decide(interpretation, gate, rules, {
      rawText: req.raw_text,
      projectMode: ctx.project.mode,
      hasOpenRequest: false,
    });
    await this.event(req, 'decidido', 'ok', 0, { categoria: decision.category, carril: decision.lane, razones: decision.reasons });
    req = await store.updateRequest(req.id, {
      category: decision.category,
      lane: decision.lane,
      gate: gate ? { outcome: gate.outcome, reasons: gate.reasons } : { outcome: null, reasons: decision.reasons },
      changes: gate?.changes ?? null,
    });

    switch (decision.category) {
      case 'permitido':
        return this.flowPermitido(req, contact, ctx, interpretation, gate!);
      case 'riesgoso':
        return decision.lane === 'codigo'
          ? this.flowRiesgosoCodigo(req, contact, ctx, interpretation, decision)
          : this.flowRiesgosoContenido(req, contact, ctx, interpretation, gate, decision);
      case 'fuera_de_alcance':
        return this.flowFueraDeAlcance(req, contact, ctx, interpretation);
      case 'consulta':
        return this.flowConsulta(req, contact, ctx, inventory);
      case 'bloqueado':
        return this.flowBloqueado(req, contact, ctx, interpretation, decision.reasons);
      case 'charla':
        await store.updateRequest(req.id, { status: 'charla' });
        await this.say(contact, req.id, { text: THANKS.test(normalizeReply(req.raw_text)) ? copy.charlaGracias() : copy.charla() });
        return;
      case 'derivado':
        return this.derive(req.id, new Error(decision.reasons.join('; ') || 'Derivado por las reglas'), { expected: true });
    }
  }

  private async history(contactId: string, currentRequestId: string): Promise<Turn[]> {
    const msgs = await this.d.store.recentMessages(contactId, 14);
    return msgs
      .filter((m) => m.text && m.request_id !== currentRequestId)
      .slice(-10)
      .map((m) => ({ role: m.direction === 'entrada' ? 'cliente' : 'asistente', text: m.text!, at: m.at }));
  }

  // ───────────────────────── categorías ─────────────────────────

  private async draftAndCapture(req: RequestRow, gate: GateResult, ctx: Ctx): Promise<{ photo: Buffer | null; previewUrl: string }> {
    const live = await this.d.store.getLiveVersion(req.project_id);
    const draft = await this.step(
      req,
      'borrador',
      () => this.d.store.createVersion({ project_id: req.project_id, request_id: req.id, parent_id: live?.id ?? null, status: 'borrador', content: gate.content }),
      (v) => ({ version: v.id }),
    );
    const previewUrl = this.previewUrl(ctx.project, draft.id);
    await this.d.store.updateRequest(req.id, { draft_version_id: draft.id, preview_url: previewUrl });
    let photo: Buffer | null = null;
    if (this.d.screenshots.enabled) {
      const t0 = performance.now();
      await this.event(req, 'captura', 'inicio', null, { url: previewUrl });
      photo = await this.d.screenshots.capture(previewUrl);
      await this.event(req, 'captura', photo ? 'ok' : 'falla', Math.round(performance.now() - t0), photo ? { bytes: photo.length } : { error: 'Sin captura: se manda el link' });
    }
    return { photo, previewUrl };
  }

  private previewUrl(project: ProjectRow, versionId: string): string {
    const u = new URL(project.site_url || this.d.defaultSiteUrl);
    u.searchParams.set('preview', versionId);
    return u.toString();
  }

  private async flowPermitido(req: RequestRow, contact: ContactRow, ctx: Ctx, it: Interpretation, gate: GateResult): Promise<void> {
    await this.say(contact, req.id, { text: copy.entendido(it.summary) });
    const { photo, previewUrl } = await this.draftAndCapture(req, gate, ctx);
    const text = photo ? copy.vistaPrevia(it.summary) : `${copy.vistaPrevia(it.summary)}\n${copy.linkVistaPrevia(previewUrl)}`;
    await this.step(req, 'enviado', () =>
      this.say(contact, req.id, {
        text,
        photo,
        buttons: [[{ text: B.dale, data: `ok:${req.short_id}` }, { text: B.noEraEso, data: `no:${req.short_id}` }]],
      }),
    );
    await this.d.store.updateRequest(req.id, { status: 'esperando_cliente' });
  }

  private async flowOptions(
    req: RequestRow,
    contact: ContactRow,
    ctx: Ctx,
    it: Interpretation,
    options: { label: string; gate: GateResult }[],
  ): Promise<void> {
    await this.event(req, 'decidido', 'ok', 0, { categoria: 'permitido', carril: 'contenido', opciones: options.map((o) => o.label) });
    await this.d.store.updateRequest(req.id, { category: 'permitido', lane: 'contenido', gate: { outcome: 'auto', reasons: [] } });
    await this.say(contact, req.id, { text: copy.entendido(it.summary) });
    const drafts: string[] = [];
    for (const [i, o] of options.entries()) {
      const { photo, previewUrl } = await this.draftAndCapture(req, o.gate, ctx);
      const fresh = (await this.d.store.getRequest(req.id))!;
      drafts.push(fresh.draft_version_id!);
      const label = o.label.slice(0, 30);
      await this.step(req, 'enviado', () =>
        this.say(contact, req.id, {
          text: `${copy.opcion(i + 1, label)}${photo ? '' : `\n${copy.linkVistaPrevia(previewUrl)}`}`,
          photo,
          buttons: [[{ text: label, data: `opt:${req.short_id}:${i}` }]],
        }),
      );
    }
    await this.say(contact, req.id, { text: copy.elegiUna(), buttons: [[{ text: B.noEraEso, data: `no:${req.short_id}` }]] });
    await this.d.store.updateRequest(req.id, {
      status: 'esperando_cliente',
      draft_version_id: null,
      gate: { outcome: 'auto', reasons: [], options: options.map((o, i) => ({ label: o.label, draftVersionId: drafts[i], changes: o.gate.changes })) },
    });
  }

  private async chooseOption(req: RequestRow, index: number, via: Via): Promise<void> {
    const it = req.interpretation as Interpretation | null;
    const opts = (req.gate as { options?: { label: string; draftVersionId: string; changes: Change[] }[] } | null)?.options;
    const option = it?.options?.[index];
    const meta = opts?.[index];
    if (!option || !meta) return;
    for (const [i, o] of (opts ?? []).entries()) {
      if (i === index) continue;
      const v = await this.d.store.getVersion(o.draftVersionId);
      if (v?.status === 'borrador') await this.d.store.updateVersion(v.id, { status: 'descartada' });
    }
    await this.d.store.updateRequest(req.id, {
      ops: option.ops,
      changes: meta.changes,
      draft_version_id: meta.draftVersionId,
      interpretation: { ...it, ops: option.ops, summary: `${it!.summary}: ${option.label}` },
    });
    await this.d.store.addApproval({ request_id: req.id, actor: 'cliente', decision: 'aprobado', via });
    await this.event(req, 'aprobado_cliente', 'ok', 0, { via, opcion: option.label });
    await this.publish(req.id, 'cliente', via);
  }

  private async flowRiesgosoContenido(
    req: RequestRow,
    contact: ContactRow,
    ctx: Ctx,
    it: Interpretation,
    gate: GateResult | null,
    decision: Decision,
  ): Promise<void> {
    // Nothing concrete to approve (e.g. low confidence without operations): the team takes it.
    if (!gate || gate.outcome === 'bloqueado' || gate.changes.length === 0) {
      return this.derive(req.id, new Error(decision.reasons.join('; ') || 'No hay cambios concretos para aprobar'), { expected: true });
    }
    const reason = asClause(decision.reasons[0] ?? 'necesita una revisión');
    const { photo, previewUrl } = await this.draftAndCapture(req, gate, ctx);
    await this.say(contact, req.id, { text: copy.esperaAgencia(ctx.agencyName, reason) });
    const text = copy.agenciaAprobacion(ctx.project.client_name, it.summary, reason) + (photo ? '' : `\n${copy.linkVistaPrevia(previewUrl)}`);
    await this.step(req, 'enviado', () =>
      this.notifyAgency(ctx, req.id, {
        text,
        photo,
        buttons: [[{ text: B.aprobar, data: `gok:${req.short_id}` }, { text: B.rechazar, data: `gno:${req.short_id}` }], ...this.panelRow()],
      }),
    );
    await this.d.store.updateRequest(req.id, { status: 'esperando_agencia' });
  }

  private async flowRiesgosoCodigo(req: RequestRow, contact: ContactRow, ctx: Ctx, it: Interpretation, decision: Decision): Promise<void> {
    const reason = asClause(decision.reasons[0] ?? 'toca código');
    await this.say(contact, req.id, { text: copy.esperaAgencia(ctx.agencyName, reason) });
    const ficha = it.codeInstruction ?? it.summary;
    await this.step(req, 'enviado', () =>
      this.notifyAgency(ctx, req.id, {
        text: copy.agenciaCodigo(ctx.project.client_name, it.summary, ficha, reason),
        buttons: [[{ text: B.aprobarYHacer, data: `gok:${req.short_id}` }, { text: B.rechazar, data: `gno:${req.short_id}` }], ...this.panelRow()],
      }),
    );
    await this.d.store.updateRequest(req.id, { status: 'esperando_agencia' });
  }

  private async flowFueraDeAlcance(req: RequestRow, contact: ContactRow, ctx: Ctx, it: Interpretation): Promise<void> {
    await this.d.store.updateRequest(req.id, { status: 'cotizando' });
    const past = await this.d.store.listQuotes(req.project_id, 20);
    const { quote, usage } = await this.step(
      req,
      'presupuesto',
      () =>
        withTimeout(
          this.d.ai.draftQuote({
            text: req.raw_text,
            pastQuotes: past.map((q) => ({ title: q.title, description: q.description, amountUsd: q.amount_usd, etaDays: q.eta_days, status: q.status })),
          }),
          TIMEOUTS.ai,
          'Presupuesto',
        ),
      (r) => ({ titulo: r.quote.title, monto: r.quote.amountUsd, dias: r.quote.etaDays }),
    );
    const row = await this.d.store.createQuote({
      request_id: req.id,
      title: quote.title,
      description: quote.description,
      amount_usd: quote.amountUsd,
      eta_days: quote.etaDays,
    });
    req = await this.addUsage(req, [usage]);
    await this.d.store.updateRequest(req.id, { quote_id: row.id, status: 'cotizado' });
    await this.say(contact, req.id, { text: copy.fueraDeAlcance(ctx.agencyName) });
    await this.notifyAgency(ctx, req.id, {
      text: copy.agenciaFueraDeAlcance(ctx.project.client_name, it.summary, quote.title, quote.amountUsd, quote.etaDays),
      buttons: this.panelRow(),
    });
  }

  private async flowConsulta(req: RequestRow, contact: ContactRow, ctx: Ctx, inventory: Inventory): Promise<void> {
    const { answer, usage } = await this.step(
      req,
      'respondido',
      () => withTimeout(this.d.ai.answerConsulta({ inventory, text: req.raw_text, assistantName: ctx.assistant }), TIMEOUTS.ai, 'Consulta'),
      (r) => ({ respuesta: r.answer }),
    );
    req = await this.addUsage(req, [usage]);
    await this.say(contact, req.id, { text: answer });
    await this.d.store.updateRequest(req.id, { status: 'respondido' });
  }

  private async flowBloqueado(req: RequestRow, contact: ContactRow, ctx: Ctx, it: Interpretation, reasons: string[]): Promise<void> {
    await this.d.store.updateRequest(req.id, { status: 'bloqueado' });
    await this.say(contact, req.id, { text: copy.bloqueado(ctx.agencyName) });
    await this.notifyAgency(ctx, req.id, {
      text: copy.agenciaBloqueado(ctx.project.client_name, it.summary, reasons.map(asClause).join('; ') || 'reglas'),
      buttons: this.panelRow(),
    });
  }

  /** Any exception or timeout: `derivado`, an answer to the client and a notice to the agency. Never throws. */
  async derive(requestId: string, err: unknown, opts: { expected?: boolean } = {}): Promise<void> {
    const msg = this.redact(errMsg(err));
    if (!opts.expected) this.log(`[derivado] ${requestId}: ${msg}`);
    try {
      const req = await this.d.store.getRequest(requestId);
      if (!req) return;
      await this.d.store.updateRequest(req.id, { status: 'derivado', category: 'derivado', error: msg });
      await this.event(req, 'derivado', opts.expected ? 'ok' : 'falla', null, { error: msg });
      const contact = req.contact_id ? await this.d.store.getContact(req.contact_id) : null;
      if (contact) await this.say(contact, req.id, { text: copy.derivado() });
      const ctx = await this.ctxFor(req.project_id);
      const summary = (req.interpretation as Interpretation | null)?.summary ?? req.raw_text.slice(0, 200);
      await this.notifyAgency(ctx, req.id, { text: copy.agenciaDerivado(ctx.project.client_name, req.short_id, summary, msg), buttons: this.panelRow() });
    } catch (inner) {
      this.log(`[derivado] no pude avisar: ${this.redact(errMsg(inner))}`);
    }
  }

  // ───────────────────────── botones y respuestas ─────────────────────────

  /** Button presses and panel commands. Never throws. */
  async handleCallback(actor: ContactRow | null, data: string, via: Via): Promise<void> {
    const [action, short] = data.split(':');
    if (!action || !short) return;
    const req = await this.d.store.getRequestByShortId(short);
    if (!req) return;
    if (actor && actor.project_id !== req.project_id) return;
    const isAgency = !actor || actor.role === 'agencia';
    try {
      switch (action) {
        case 'ok':
          if (req.status !== 'esperando_cliente') return;
          if (((req.ops as Op[] | null) ?? []).length === 0) return await this.sayTo(req.contact_id, req.id, { text: copy.elegiUna() });
          await this.d.store.addApproval({ request_id: req.id, actor: 'cliente', decision: 'aprobado', via });
          await this.event(req, 'aprobado_cliente', 'ok', 0, { via });
          return await this.publish(req.id, 'cliente', via);
        case 'no':
          if (req.status !== 'esperando_cliente') return;
          await this.d.store.addApproval({ request_id: req.id, actor: 'cliente', decision: 'rechazado', via });
          await this.discardDraft(req);
          for (const o of (req.gate as { options?: { draftVersionId: string }[] } | null)?.options ?? []) {
            const v = await this.d.store.getVersion(o.draftVersionId);
            if (v?.status === 'borrador') await this.d.store.updateVersion(v.id, { status: 'descartada' });
          }
          await this.d.store.updateRequest(req.id, { status: 'descartado' });
          if (req.contact_id) this.awaitingCorrection.set(req.contact_id, req.id);
          return await this.sayTo(req.contact_id, req.id, { text: copy.noEraEso() });
        case 'undo':
          if (req.status !== 'publicado') return;
          return await this.revert(req.id, via);
        case 'gok':
          if (!isAgency || req.status !== 'esperando_agencia') return;
          await this.d.store.addApproval({ request_id: req.id, actor: 'agencia', decision: 'aprobado', via });
          await this.event(req, 'aprobado_agencia', 'ok', 0, { via });
          if (req.lane === 'codigo') {
            await this.d.store.updateRequest(req.id, { status: 'agente_trabajando' });
            if (!this.slow.push(() => this.runAgent(req.id))) throw new Error('La cola del agente está llena');
            return;
          }
          return await this.publish(req.id, 'agencia', via);
        case 'gno':
          if (!isAgency || !['esperando_agencia', 'agente_listo', 'esperando_cliente'].includes(req.status)) return;
          await this.d.store.addApproval({ request_id: req.id, actor: 'agencia', decision: 'rechazado', via });
          await this.discardDraft(req);
          await this.d.store.updateRequest(req.id, { status: 'rechazado' });
          return await this.sayTo(req.contact_id, req.id, { text: copy.rechazadoAgencia((await this.ctxFor(req.project_id)).agencyName) });
        case 'pub':
          if (!isAgency) return;
          if (req.lane === 'codigo' && req.status === 'agente_listo') return await this.publishCode(req.id, via);
          if (req.status === 'esperando_agencia' || req.status === 'esperando_cliente') {
            await this.d.store.addApproval({ request_id: req.id, actor: 'agencia', decision: 'aprobado', via });
            await this.event(req, 'aprobado_agencia', 'ok', 0, { via });
            return await this.publish(req.id, 'agencia', via);
          }
          return;
        case 'opt': {
          if (req.status !== 'esperando_cliente') return;
          const index = Number(data.split(':')[2]);
          if (!Number.isInteger(index)) return;
          return await this.chooseOption(req, index, via);
        }
        case 'qok':
        case 'qno':
          return await this.answerQuote(req, action === 'qok');
      }
    } catch (err) {
      await this.derive(req.id, err);
    }
  }

  private async discardDraft(req: RequestRow): Promise<void> {
    if (!req.draft_version_id) return;
    const v = await this.d.store.getVersion(req.draft_version_id);
    if (v?.status === 'borrador') await this.d.store.updateVersion(v.id, { status: 'descartada' });
  }

  private async answerQuote(req: RequestRow, accepted: boolean): Promise<void> {
    if (!req.quote_id) return;
    const quote = await this.d.store.getQuote(req.quote_id);
    if (!quote || quote.status !== 'enviado') return;
    await this.d.store.updateQuote(quote.id, { status: accepted ? 'aceptado' : 'rechazado' });
    const ctx = await this.ctxFor(req.project_id);
    await this.sayTo(req.contact_id, req.id, { text: accepted ? copy.presupuestoAceptado(ctx.agencyName) : copy.presupuestoAhoraNo() });
    await this.notifyAgency(ctx, req.id, { text: copy.agenciaPresupuesto(ctx.project.client_name, quote.title, accepted) });
  }

  // ───────────────────────── publicar y revertir ─────────────────────────

  /** SPEC §9 step 7: re-apply the ops on the current live version, re-run the gate, publish, commit. */
  async publish(requestId: string, actor: Role, via: Via): Promise<void> {
    const { store } = this.d;
    let req = (await store.getRequest(requestId))!;
    const ctx = await this.ctxFor(req.project_id);
    req = await store.updateRequest(req.id, { status: 'publicando' });
    const t0 = performance.now();
    await this.event(req, 'publicando', 'inicio', null, { actor, via });

    const live = await store.getLiveVersion(req.project_id);
    if (!live) throw new Error('El proyecto no tiene versión viva');
    const contract = await this.d.repo.loadContract(ctx.project);
    const rules = (await store.latestRules(req.project_id))?.rules ?? DEFAULT_RULES;
    const ops = (req.ops as Op[] | null) ?? [];
    const gate = runGate({
      config: contract.config,
      content: live.content,
      schema: contract.schema,
      ops,
      rules,
      secrets: this.d.secrets,
      autoPublishedThisMonth: actor === 'cliente' ? await store.countAutoPublishedSince(req.project_id, startOfMonthIso(this.now())) : 0,
    });
    await this.event(req, 'gate', 'ok', null, { resultado: gate.outcome, razones: gate.reasons, alPublicar: true });
    if (gate.outcome === 'bloqueado') {
      await store.updateRequest(req.id, { category: 'bloqueado', gate: { outcome: gate.outcome, reasons: gate.reasons } });
      await this.event(req, 'publicando', 'falla', Math.round(performance.now() - t0), { razones: gate.reasons });
      const contact = req.contact_id ? await store.getContact(req.contact_id) : null;
      const it = (req.interpretation as Interpretation | null) ?? ({ summary: req.raw_text } as Interpretation);
      if (contact) await this.flowBloqueado(req, contact, ctx, it, gate.reasons);
      return;
    }
    if (gate.outcome === 'agencia' && actor === 'cliente') {
      // Rules changed between the preview and the approval: now the agency decides.
      await store.updateRequest(req.id, { status: 'esperando_agencia', category: 'riesgoso', lane: 'contenido', gate: { outcome: gate.outcome, reasons: gate.reasons } });
      await this.event(req, 'publicando', 'falla', Math.round(performance.now() - t0), { razones: gate.reasons, aLaAgencia: true });
      const contact = req.contact_id ? await store.getContact(req.contact_id) : null;
      const it = (req.interpretation as Interpretation | null) ?? ({ summary: req.raw_text } as Interpretation);
      const reason = asClause(gate.reasons[0] ?? 'necesita una revisión');
      if (contact) await this.say(contact, req.id, { text: copy.esperaAgencia(ctx.agencyName, reason) });
      await this.notifyAgency(ctx, req.id, {
        text: copy.agenciaAprobacion(ctx.project.client_name, it.summary, reason),
        buttons: [[{ text: B.aprobar, data: `gok:${req.short_id}` }, { text: B.rechazar, data: `gno:${req.short_id}` }], ...this.panelRow()],
      });
      return;
    }

    // Reuse the previewed draft if it was built on this same live version (same ops, same base → same content).
    const draft = req.draft_version_id ? await store.getVersion(req.draft_version_id) : null;
    let versionId: string;
    if (draft && draft.status === 'borrador' && draft.parent_id === live.id) {
      versionId = draft.id;
    } else {
      if (draft?.status === 'borrador') await store.updateVersion(draft.id, { status: 'descartada' });
      versionId = (await store.createVersion({ project_id: req.project_id, request_id: req.id, parent_id: live.id, status: 'borrador', content: gate.content })).id;
    }
    await store.publishVersion(req.project_id, versionId);
    req = await store.updateRequest(req.id, { live_version_id: versionId, changes: gate.changes, status: 'publicado' });
    await this.event(req, 'publicado', 'ok', Math.round(performance.now() - t0), { version: versionId, cambios: gate.changes.length });

    const summary = (req.interpretation as Interpretation | null)?.summary ?? req.raw_text;
    const undo = [[{ text: B.volver, data: `undo:${req.short_id}` }]];
    await this.sayTo(req.contact_id, req.id, { text: actor === 'agencia' ? copy.aprobadoAgencia(ctx.agencyName) : copy.publicado(), buttons: undo });
    if (actor === 'agencia' && via === 'telegram') await this.notifyAgency(ctx, req.id, { text: copy.agenciaPublicado(req.short_id) });

    await this.commit(req, ctx.project, versionId, `dale: ${summary} (#${req.short_id})`);
  }

  /** Commit of the content JSON. If it fails the version stays live and `git_error` is saved. */
  async commit(req: RequestRow, project: ProjectRow, versionId: string, message: string): Promise<boolean> {
    const version = await this.d.store.getVersion(versionId);
    if (!version) return false;
    try {
      const { config } = await this.d.repo.loadContract(project);
      const sha = await this.step(
        req,
        'commit',
        () => withTimeout(this.d.repo.commitContent(project, config, version.content, message), TIMEOUTS.commit, 'Commit'),
        (s) => ({ sha: s, modo: this.d.repo.mode }),
      );
      await this.d.store.updateVersion(versionId, { git_commit_sha: sha, git_error: null });
      return true;
    } catch (err) {
      await this.d.store.updateVersion(versionId, { git_error: this.redact(errMsg(err)) });
      return false;
    }
  }

  /** SPEC §9 step 8. */
  async revert(requestId: string, via: Via): Promise<void> {
    const { store } = this.d;
    let req = (await store.getRequest(requestId))!;
    const ctx = await this.ctxFor(req.project_id);
    const t0 = performance.now();
    await this.event(req, 'revertido', 'inicio', null, { via });

    if (req.lane === 'codigo') {
      const mergeSha = (req.changes as { mergeSha?: string } | null)?.mergeSha;
      if (!mergeSha) throw new Error('No encontré el merge para revertir');
      const { revertSha } = await withTimeout(
        this.d.agent.revertChange({ repo: this.repoRef(ctx.project), mergeSha, shortId: req.short_id }),
        TIMEOUTS.commit * 3,
        'Revert',
      );
      await store.updateRequest(req.id, { status: 'revertido' });
      await this.event(req, 'revertido', 'ok', Math.round(performance.now() - t0), { sha: revertSha });
      await this.sayTo(req.contact_id, req.id, { text: copy.revertido() });
      return;
    }

    const live = await store.getLiveVersion(req.project_id);
    if (!live) throw new Error('El proyecto no tiene versión viva');
    const changes = (req.changes as Change[] | null) ?? [];
    const r = revertChanges(live.content, changes);
    if ('conflict' in r) {
      await this.event(req, 'revertido', 'falla', Math.round(performance.now() - t0), { conflicto: r.conflict });
      await this.sayTo(req.contact_id, req.id, { text: copy.conflictoRevertir(ctx.agencyName) });
      await this.notifyAgency(ctx, req.id, { text: copy.agenciaConflicto(req.short_id, r.conflict.join(', ')), buttons: this.panelRow() });
      return;
    }
    // Gate over the reverted content (schema, security): no operations, only validation.
    const contract = await this.d.repo.loadContract(ctx.project);
    const gate = runGate({ config: contract.config, content: r.content, schema: contract.schema, ops: [], rules: DEFAULT_RULES, secrets: this.d.secrets });
    if (gate.outcome === 'bloqueado') throw new Error(`El contenido revertido no pasa el gate: ${gate.reasons.join('; ')}`);
    const v = await store.createVersion({ project_id: req.project_id, request_id: req.id, parent_id: live.id, status: 'borrador', content: r.content });
    await store.publishVersion(req.project_id, v.id);
    req = await store.updateRequest(req.id, { status: 'revertido', live_version_id: v.id });
    await this.event(req, 'revertido', 'ok', Math.round(performance.now() - t0), { version: v.id });
    await this.sayTo(req.contact_id, req.id, { text: copy.revertido() });
    await this.commit(req, ctx.project, v.id, `dale: revert #${req.short_id}`);
  }

  // ───────────────────────── carril de código ─────────────────────────

  private repoRef(p: ProjectRow): RepoRef {
    return { owner: p.repo_owner, name: p.repo_name, defaultBranch: p.default_branch };
  }

  async runAgent(requestId: string): Promise<void> {
    try {
      let req = (await this.d.store.getRequest(requestId))!;
      const ctx = await this.ctxFor(req.project_id);
      const it = req.interpretation as Interpretation | null;
      const instruction = it?.codeInstruction ?? it?.summary ?? 'Cambio pedido por el cliente';
      const t0 = performance.now();
      await this.event(req, 'agente_inicio', 'inicio', null, null);
      const res = await withTimeout(
        this.d.agent.runCodeChange({ repo: this.repoRef(ctx.project), requestId: req.id, shortId: req.short_id, instruction, timeoutMs: TIMEOUTS.agent }),
        TIMEOUTS.agent + 30_000,
        'Agente',
      );
      await this.event(req, 'agente_inicio', 'ok', Math.round(performance.now() - t0), { archivos: res.changedFiles });
      await this.event(req, 'agente_pr', 'ok', null, { pr: res.prUrl, numero: res.prNumber });
      if (res.previewUrl) await this.event(req, 'agente_preview', 'ok', null, { url: res.previewUrl });
      req = await this.d.store.updateRequest(req.id, { status: 'agente_listo', pr_url: res.prUrl, pr_number: res.prNumber, preview_url: res.previewUrl ?? null });
      const links: Button[] = [];
      if (res.previewUrl) links.push({ text: B.verPreview, url: res.previewUrl });
      links.push({ text: B.verPr, url: res.prUrl });
      await this.notifyAgency(ctx, req.id, {
        text: copy.agenciaAgenteListo(req.short_id, it?.summary ?? req.raw_text),
        buttons: [links, [{ text: B.publicar, data: `pub:${req.short_id}` }, { text: B.descartar, data: `gno:${req.short_id}` }]],
      });
    } catch (err) {
      await this.derive(requestId, err);
    }
  }

  private async publishCode(requestId: string, via: Via): Promise<void> {
    let req = (await this.d.store.getRequest(requestId))!;
    const ctx = await this.ctxFor(req.project_id);
    if (!req.pr_number) throw new Error('El pedido no tiene PR');
    const t0 = performance.now();
    await this.event(req, 'publicando', 'inicio', null, { via, pr: req.pr_number });
    const { mergeSha } = await withTimeout(this.d.agent.mergeChange({ repo: this.repoRef(ctx.project), prNumber: req.pr_number }), 60_000, 'Merge');
    req = await this.d.store.updateRequest(req.id, { status: 'publicado', changes: { mergeSha } });
    await this.event(req, 'publicado', 'ok', Math.round(performance.now() - t0), { sha: mergeSha });
    await this.sayTo(req.contact_id, req.id, { text: copy.aprobadoAgencia(ctx.agencyName), buttons: [[{ text: B.volver, data: `undo:${req.short_id}` }]] });
  }

  // ───────────────────────── comandos del panel ─────────────────────────

  /** Runs one panel command (SPEC §9). Throws on error so the poller marks it `error`. */
  async runCommand(cmd: CommandRow): Promise<void> {
    const payload = (cmd.payload ?? {}) as Record<string, unknown>;
    const req = cmd.request_id ? await this.d.store.getRequest(cmd.request_id) : null;
    const need = () => {
      if (!req) throw new Error('El comando necesita request_id');
      return req;
    };
    switch (cmd.type) {
      case 'aprobar':
        return this.commandCallback(need(), 'gok');
      case 'rechazar':
        return this.commandCallback(need(), 'gno');
      case 'publicar':
        return this.commandCallback(need(), 'pub');
      case 'revertir': {
        const r = need();
        if (r.status !== 'publicado') throw new Error(`El pedido está ${r.status}, no publicado`);
        return this.inFast(() => this.revert(r.id, 'panel'));
      }
      case 'enviar_presupuesto':
        return this.sendQuote(need(), payload);
      case 'reintentar_commit': {
        const versionId = (payload.version_id as string | undefined) ?? need().live_version_id;
        if (!versionId) throw new Error('No hay versión para commitear');
        const version = await this.d.store.getVersion(versionId);
        if (!version) throw new Error('No existe la versión');
        const project = (await this.d.store.getProject(version.project_id))!;
        const owner = req ?? (version.request_id ? await this.d.store.getRequest(version.request_id) : null);
        const message = owner ? `dale: ${(owner.interpretation as Interpretation | null)?.summary ?? 'cambio'} (#${owner.short_id})` : 'dale: publicación';
        const ok = owner
          ? await this.commit(owner, project, versionId, message)
          : await this.commitWithoutRequest(project, versionId, message);
        if (!ok) throw new Error((await this.d.store.getVersion(versionId))?.git_error ?? 'El commit volvió a fallar');
        return;
      }
      case 'proponer': {
        const text = String(payload.text ?? '').trim();
        if (!text) throw new Error('proponer necesita payload.text');
        const projectId = req?.project_id ?? (payload.project_id as string | undefined);
        if (!projectId) throw new Error('proponer necesita request_id o payload.project_id');
        const clients = await this.d.store.listContacts(projectId, 'cliente');
        for (const c of clients) await this.say(c, req?.id ?? null, { text });
        return;
      }
    }
  }

  /** Runs a job in the fast queue and waits for it (panel commands). */
  private inFast(fn: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ok = this.fast.push(async () => {
        try {
          await fn();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      if (!ok) reject(new Error('La cola está llena'));
    });
  }

  private async commitWithoutRequest(project: ProjectRow, versionId: string, message: string): Promise<boolean> {
    const version = (await this.d.store.getVersion(versionId))!;
    try {
      const { config } = await this.d.repo.loadContract(project);
      const sha = await withTimeout(this.d.repo.commitContent(project, config, version.content, message), TIMEOUTS.commit, 'Commit');
      await this.d.store.updateVersion(versionId, { git_commit_sha: sha, git_error: null });
      return true;
    } catch (err) {
      await this.d.store.updateVersion(versionId, { git_error: this.redact(errMsg(err)) });
      return false;
    }
  }

  private async commandCallback(req: RequestRow, action: 'gok' | 'gno' | 'pub'): Promise<void> {
    const before = req.status;
    // Through the fast queue, so it never races with a request being processed.
    await this.inFast(() => this.handleCallback(null, `${action}:${req.short_id}`, 'panel'));
    const after = await this.d.store.getRequest(req.id);
    if (after && after.status === before && after.status !== 'agente_trabajando') {
      throw new Error(`No se pudo ${action === 'gok' ? 'aprobar' : action === 'gno' ? 'rechazar' : 'publicar'}: el pedido está ${before}`);
    }
  }

  private async sendQuote(req: RequestRow, payload: Record<string, unknown>): Promise<void> {
    const quoteId = (payload.quote_id as string | undefined) ?? req.quote_id;
    if (!quoteId) throw new Error('El pedido no tiene presupuesto');
    const patch: Record<string, unknown> = { status: 'enviado' };
    for (const k of ['title', 'description', 'amount_usd', 'eta_days'] as const) if (payload[k] !== undefined) patch[k] = payload[k];
    const quote = await this.d.store.updateQuote(quoteId, patch);
    const ctx = await this.ctxFor(req.project_id);
    await this.sayTo(req.contact_id, req.id, {
      text: copy.presupuesto(ctx.agencyName, quote.title, quote.amount_usd, quote.eta_days),
      buttons: [[{ text: B.aceptar, data: `qok:${req.short_id}` }, { text: B.ahoraNo, data: `qno:${req.short_id}` }]],
    });
  }

  // ───────────────────────── utilidades ─────────────────────────

  private readonly ctxCache = new Map<string, { at: number; ctx: Ctx }>();
  private async ctxFor(projectId: string): Promise<Ctx> {
    const hit = this.ctxCache.get(projectId);
    if (hit && Date.now() - hit.at < 30_000) return hit.ctx;
    const project = await this.d.store.getProject(projectId);
    if (!project) throw new Error(`No existe el proyecto ${projectId}`);
    const factory = await this.d.store.getFactory(project.factory_id);
    if (!factory) throw new Error(`No existe la agencia ${project.factory_id}`);
    const ctx = { project, factory, agencyName: factory.name, assistant: factory.assistant_name };
    this.ctxCache.set(projectId, { at: Date.now(), ctx });
    return ctx;
  }

  private panelRow(): Button[][] {
    return this.d.panelUrl ? [[{ text: B.verPanel, url: this.d.panelUrl }]] : [];
  }

  /** Sends and saves an outgoing message. A channel failure is logged, never thrown. */
  private async say(contact: ContactRow, requestId: string | null, msg: OutMessage): Promise<void> {
    let error: string | null = null;
    try {
      await this.d.channel.send(contact.telegram_chat_id, msg);
    } catch (err) {
      error = this.redact(errMsg(err));
      this.log(`[envío] a ${contact.display_name}: ${error}`);
    }
    const media: Record<string, unknown> = {};
    if (msg.photo) media.foto = true;
    if (msg.buttons?.length) media.botones = msg.buttons.flat().map((b) => ('data' in b ? { text: b.text, data: b.data } : { text: b.text, url: b.url }));
    if (error) media.error = error;
    await this.d.store.addMessage({
      request_id: requestId,
      contact_id: contact.id,
      direction: 'salida',
      text: msg.text,
      media: Object.keys(media).length ? media : null,
    });
  }

  private async sayTo(contactId: string | null, requestId: string, msg: OutMessage): Promise<void> {
    if (!contactId) return;
    const c = await this.d.store.getContact(contactId);
    if (c) await this.say(c, requestId, msg);
  }

  private async notifyAgency(ctx: Ctx, requestId: string, msg: OutMessage): Promise<void> {
    const agency = await this.d.store.listContacts(ctx.project.id, 'agencia');
    for (const a of agency) await this.say(a, requestId, msg);
  }

  private async event(req: Pick<RequestRow, 'id' | 'short_id'>, step: EventStep, status: 'inicio' | 'ok' | 'falla', durationMs: number | null, detail: unknown): Promise<void> {
    await this.d.store.addEvent({ request_id: req.id, step, status, detail: detail ?? null, duration_ms: durationMs });
    this.d.onEvent?.({ requestId: req.id, shortId: req.short_id, step, status, durationMs, detail });
  }

  /** Saves `inicio`, runs, then `ok` with the duration, or `falla` and rethrows. */
  private async step<T>(req: Pick<RequestRow, 'id' | 'short_id'>, step: EventStep, fn: () => Promise<T>, detail?: (r: T) => unknown): Promise<T> {
    const t0 = performance.now();
    await this.event(req, step, 'inicio', null, null);
    try {
      const r = await fn();
      await this.event(req, step, 'ok', Math.round(performance.now() - t0), detail ? detail(r) : null);
      return r;
    } catch (err) {
      await this.event(req, step, 'falla', Math.round(performance.now() - t0), { error: this.redact(errMsg(err)) });
      throw err;
    }
  }

  private async addUsage(req: RequestRow, usage: Usage[]): Promise<RequestRow> {
    const fresh = (await this.d.store.getRequest(req.id)) ?? req;
    const all = [...((fresh.usage as Usage[] | null) ?? []), ...usage];
    return this.d.store.updateRequest(req.id, { usage: all, cost_usd: costUsd(all) });
  }
}

export type { RequestStatus };
