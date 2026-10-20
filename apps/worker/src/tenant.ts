import { createHash } from 'node:crypto';
import type { AiProvider } from '@walt/ai';
import { costUsd, type AiSettingsRow, type LedgerMode, type Usage } from '@walt/core';
import { currentWork } from './context.js';
import type { Store } from './store/types.js';

/** Why a request cannot use the AI right now. The pipeline turns it into `derivado`; the agency sees the reason. */
export class AiBudgetError extends Error {
  constructor(message: string, readonly code: 'sin_clave' | 'sin_saldo' | 'tope_mes' | 'tope_pedido') {
    super(message);
    this.name = 'AiBudgetError';
  }
}

/** How a project pays for the AI right now. */
export interface AiResolution {
  mode: LedgerMode;
  factoryId: string | null;
  projectId: string | null;
  settings: AiSettingsRow | null;
  /** BYOK key (never log it). */
  key: string | null;
  /** Markup over cost in credits mode, in percent. */
  markupPct: number;
}

export interface TenantAiOptions {
  store: Store;
  /** Walt's provider (platform, credits and claude_code modes). */
  platform: AiProvider;
  /** Provider with an agency's key (BYOK) and, optionally, another interpretation model. */
  makeProvider: (opts: { key: string | null; model: string | null }) => AiProvider;
  /** Adds a BYOK key to the values the logs redact. */
  onSecret?: (value: string) => void;
  log?: (line: string) => void;
  now?: () => Date;
  /** Settings and keys are cached this long. Default 60 s. */
  cacheMs?: number;
}

function monthStartIso(d: Date): string {
  // Month in Montevideo (UTC-3, no DST), as the panel counts it.
  const local = new Date(d.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3)).toISOString();
}

/**
 * The three ways an agency pays for the AI (brief §4), chosen per call from the work context's project:
 * - no `ai_settings` row → Walt's key, as before (`platform` in the ledger, nothing charged);
 * - `byok` → the agency's Anthropic key from Supabase Vault;
 * - `credits` → Walt's key, debited from the agency's wallet (cost + markup); without balance it does not run;
 * - `claude_code` → classification with Walt's key; code changes are not run by Walt (see the worker).
 * Monthly and per-request caps apply in every mode. Each call is saved in `usage_ledger`.
 */
export class TenantAi {
  private readonly settingsCache = new Map<string, { at: number; value: { factoryId: string | null; settings: AiSettingsRow | null } }>();
  private readonly keyCache = new Map<string, { at: number; key: string | null }>();
  private readonly providers = new Map<string, AiProvider>();
  private readonly alerted = new Set<string>();
  private readonly cacheMs: number;
  private readonly now: () => Date;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: TenantAiOptions) {
    this.cacheMs = opts.cacheMs ?? 60_000;
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? (() => {});
  }

  /** The `AiProvider` the worker uses: same interface, the tenant is picked per call. */
  provider(): AiProvider {
    const p = this.opts.platform;
    return {
      name: p.name,
      interpret: (input) => this.call((ai) => ai.interpret(input)),
      answerConsulta: (input) => this.call((ai) => ai.answerConsulta(input)),
      draftQuote: (input) => this.call((ai) => ai.draftQuote(input)),
      transcribe: (audio, mime) => p.transcribe(audio, mime),
    };
  }

  private async scope(projectId: string | null): Promise<{ factoryId: string | null; settings: AiSettingsRow | null }> {
    if (!projectId) return { factoryId: null, settings: null };
    const hit = this.settingsCache.get(projectId);
    if (hit && Date.now() - hit.at < this.cacheMs) return hit.value;
    const project = await this.opts.store.getProject(projectId);
    const factoryId = project?.factory_id ?? null;
    const settings = factoryId ? await this.opts.store.getAiSettings(factoryId, projectId) : null;
    const value = { factoryId, settings };
    this.settingsCache.set(projectId, { at: Date.now(), value });
    return value;
  }

  private async key(factoryId: string, projectId: string | null): Promise<string | null> {
    const k = `${factoryId}|${projectId ?? ''}`;
    const hit = this.keyCache.get(k);
    if (hit && Date.now() - hit.at < this.cacheMs * 5) return hit.key;
    const key = await this.opts.store.getAiKey(factoryId, projectId);
    if (key) this.opts.onSecret?.(key);
    this.keyCache.set(k, { at: Date.now(), key });
    return key;
  }

  /** Forgets cached settings and keys (after the agency changes them). */
  invalidate(): void {
    this.settingsCache.clear();
    this.keyCache.clear();
  }

  /**
   * How this project pays, checking keys, balance and caps first. Throws AiBudgetError when it must not run.
   * `requestId` enables the per-request cap.
   */
  async resolve(projectId: string | null, requestId: string | null = null): Promise<AiResolution> {
    const { factoryId, settings } = await this.scope(projectId);
    if (!factoryId || !settings) return { mode: 'platform', factoryId, projectId, settings: null, key: null, markupPct: 0 };
    const res: AiResolution = { mode: settings.mode, factoryId, projectId, settings, key: null, markupPct: 0 };
    if (settings.mode === 'byok') {
      res.key = await this.key(factoryId, projectId);
      if (!res.key) throw new AiBudgetError('La agencia eligió usar su propia clave de Anthropic, pero no hay una cargada', 'sin_clave');
    }
    if (settings.mode === 'credits') {
      const wallet = await this.opts.store.getWallet(factoryId);
      res.markupPct = wallet?.markup_pct ?? 30;
      const balance = wallet?.balance_usd ?? 0;
      if (balance <= 0) throw new AiBudgetError('La agencia no tiene saldo de créditos de IA: hay que cargar saldo', 'sin_saldo');
      if (wallet && balance < wallet.low_balance_usd) this.alertOnce(`saldo:${factoryId}`, `[ia] saldo bajo de la agencia ${factoryId}: USD ${balance.toFixed(2)}`);
    }
    if (settings.monthly_cap_usd !== null) {
      const since = monthStartIso(this.now());
      const spent = await this.opts.store.usageSince(factoryId, since, settings.project_id);
      const used = settings.mode === 'credits' ? spent.priceUsd : spent.costUsd;
      if (used >= settings.monthly_cap_usd) {
        throw new AiBudgetError(`Se alcanzó el tope de gasto de IA del mes (USD ${settings.monthly_cap_usd})`, 'tope_mes');
      }
      if (used >= (settings.monthly_cap_usd * settings.alert_pct) / 100) {
        this.alertOnce(`tope:${settings.id}:${since}`, `[ia] la agencia ${factoryId} usó el ${Math.round((used / settings.monthly_cap_usd) * 100)}% del tope del mes`);
      }
    }
    if (settings.request_cap_usd !== null && requestId) {
      const req = await this.opts.store.getRequest(requestId);
      if (req && req.cost_usd >= settings.request_cap_usd) {
        throw new AiBudgetError(`El pedido llegó al tope de gasto de IA por pedido (USD ${settings.request_cap_usd})`, 'tope_pedido');
      }
    }
    return res;
  }

  private alertOnce(key: string, line: string): void {
    if (this.alerted.has(key)) return;
    this.alerted.add(key);
    this.log(line);
  }

  private providerFor(res: AiResolution): AiProvider {
    const model = res.settings?.model_classify ?? null;
    if (!res.key && !model) return this.opts.platform;
    const id = `${res.key ? createHash('sha256').update(res.key).digest('hex').slice(0, 16) : 'walt'}|${model ?? ''}`;
    let p = this.providers.get(id);
    if (!p) {
      p = this.opts.makeProvider({ key: res.key, model });
      this.providers.set(id, p);
    }
    return p;
  }

  private async call<T extends { usage: Usage }>(fn: (ai: AiProvider) => Promise<T>): Promise<T> {
    const work = currentWork();
    const res = await this.resolve(work?.projectId ?? null, work?.requestId ?? null);
    const out = await fn(this.providerFor(res));
    await this.record(res, work?.requestId ?? null, 'ai', out.usage);
    return out;
  }

  /** Saves a model call (or an agent run, with its cost) in the ledger. Never throws. */
  async record(res: AiResolution, requestId: string | null, kind: 'ai' | 'agent', usage: Usage | null, agentCostUsd?: number): Promise<void> {
    if (!res.factoryId) return;
    const cost = usage ? costUsd(usage) : (agentCostUsd ?? 0);
    const price = res.mode === 'credits' ? Math.round(cost * (1 + res.markupPct / 100) * 1e6) / 1e6 : 0;
    try {
      await this.opts.store.recordUsage({
        factoryId: res.factoryId,
        projectId: res.projectId,
        requestId,
        kind,
        mode: res.mode,
        model: usage?.model ?? null,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cacheReadTokens: usage?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
        costUsd: cost,
        priceUsd: price,
      });
    } catch (err) {
      this.log(`[ia] no pude guardar el uso en el ledger: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
