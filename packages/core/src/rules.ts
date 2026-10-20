import { z } from 'zod';
import { OP_TYPES, type OpType } from './ops.ts';
import { isRuleTemplateId, ruleTemplate } from './templates.ts';

export const POLICIES = ['auto', 'agencia', 'bloqueado'] as const;
export type Policy = (typeof POLICIES)[number];

const glob = z.string().trim().min(1).max(200);
const globList = z.array(glob).max(200);

/**
 * Structured rules of a project (`rules.config` jsonb, docs/R1-CONTRATO.md). Defined here, by the
 * taxonomy session; the panel writes it and the worker reads it with `parseRulesConfig`.
 */
export const RulesConfigSchema = z.object({
  /** A diff that touches these goes to `delicado` (on top of `ALWAYS_DELICATE_GLOBS`). */
  delicateGlobs: globList,
  /** The code agent can't read or write these at all (on top of its own protected list). */
  protectedGlobs: globList,
  /** Exceptions to `delicateGlobs` (never to `ALWAYS_DELICATE_GLOBS`): e.g. `app/api/contacto/**`. */
  simpleGlobs: globList,
  /** Short descriptions of requests that are always "algo nuevo"; they go to the decision prompt. */
  alwaysNew: z.array(z.string().trim().min(1).max(200)).max(50),
  /** Template the rules started from: one of `RULE_TEMPLATE_IDS` (kept as a string for forward compatibility). */
  template: z.string().trim().min(1).max(60),
  /** A price that changes more than this % shows a warning in the preview. Default: `limits.maxPriceChangePct`. */
  priceWarnPct: z.number().positive().max(10_000).optional(),
  /** Deposit asked when a quote is accepted, % of the total. Default `DEFAULT_DEPOSIT_PCT`. */
  depositPct: z.number().min(0).max(100).optional(),
});
export type RulesConfig = z.infer<typeof RulesConfigSchema>;

export const RulesSchema = z.object({
  policies: z.record(z.string(), z.enum(POLICIES)),
  limits: z.object({
    /** Now a warning threshold for the preview, not an escalation (R1). `config.priceWarnPct` wins if set. */
    maxPriceChangePct: z.number().positive(),
    monthlyQuota: z.number().int().nonnegative(),
    /** Below this the client sees a "revisalo bien" warning, or is asked for detail on code requests. */
    minConfidence: z.number().min(0).max(1),
    /** More operations than this show a warning in the preview. */
    maxOpsPerRequest: z.number().int().positive(),
  }),
  /** The agency's policy in natural language (`rules.policy_text`): it goes to the decision prompt as data. */
  policy_text: z.string().max(8_000).optional(),
  /** `rules.config`. Missing in rows from before the R1 migration: read it with `rulesConfig(rules)`. */
  config: RulesConfigSchema.optional(),
});
export type Rules = z.infer<typeof RulesSchema>;

/** Default rules, version 1 of every project (SPEC §8, R1: the banner and sections are simple). */
export const DEFAULT_RULES: Rules = {
  policies: {
    set_text: 'auto',
    set_price: 'auto',
    adjust_prices: 'auto',
    set_availability: 'auto',
    set_color: 'auto',
    set_hours: 'auto',
    set_banner: 'auto',
    toggle_section: 'auto',
    add_product: 'auto',
  },
  limits: { maxPriceChangePct: 30, monthlyQuota: 200, minConfidence: 0.6, maxOpsPerRequest: 40 },
  policy_text: '',
  config: ruleTemplate('generic').config,
};

/** Policy for an operation type. Unknown or missing types fall back to `agencia`. */
export function policyFor(rules: Rules, type: OpType | string): Policy {
  return rules.policies[type] ?? 'agencia';
}

export function defaultRules(): Rules {
  return structuredClone(DEFAULT_RULES);
}

/**
 * Reads `rules.config` from storage without ever throwing: starts from the template it names (or
 * `generic`) and takes every field of the stored value that is valid. `{}` (the column default) gives
 * the generic template.
 */
export function parseRulesConfig(raw: unknown): RulesConfig {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const template = isRuleTemplateId(o.template) ? o.template : 'generic';
  const out: RulesConfig = ruleTemplate(template).config;
  const shape = RulesConfigSchema.shape;
  for (const key of Object.keys(shape) as (keyof RulesConfig)[]) {
    if (o[key] === undefined) continue;
    const r = shape[key].safeParse(o[key]);
    if (r.success && r.data !== undefined) (out as Record<string, unknown>)[key] = r.data;
  }
  return out;
}

/** The config of a set of rules, with defaults for rules from before R1. */
export function rulesConfig(rules: Pick<Rules, 'config'>): RulesConfig {
  return rules.config ? parseRulesConfig(rules.config) : parseRulesConfig(undefined);
}

/**
 * Rules as read from a `rules` row (policies, limits, policy_text, config). For the stores: missing
 * columns (before the R1 migration) get their defaults.
 */
export function rulesFromRow(row: { policies: unknown; limits: unknown; policy_text?: unknown; config?: unknown }): Rules {
  const base = defaultRules();
  const policies = z.record(z.string(), z.enum(POLICIES)).safeParse(row.policies);
  const limits = RulesSchema.shape.limits.safeParse(row.limits);
  return {
    policies: policies.success ? policies.data : base.policies,
    limits: limits.success ? limits.data : base.limits,
    policy_text: typeof row.policy_text === 'string' ? row.policy_text : '',
    config: parseRulesConfig(row.config),
  };
}

/** % above which a price change shows a warning in the preview. */
export function priceWarnPct(rules: Rules): number {
  return rules.config?.priceWarnPct ?? rules.limits.maxPriceChangePct;
}

export { OP_TYPES };
