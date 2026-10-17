import { z } from 'zod';
import { OP_TYPES, type OpType } from './ops.ts';

export const POLICIES = ['auto', 'agencia', 'bloqueado'] as const;
export type Policy = (typeof POLICIES)[number];

export const RulesSchema = z.object({
  policies: z.record(z.string(), z.enum(POLICIES)),
  limits: z.object({
    maxPriceChangePct: z.number().positive(),
    monthlyQuota: z.number().int().nonnegative(),
    minConfidence: z.number().min(0).max(1),
    maxOpsPerRequest: z.number().int().positive(),
  }),
});
export type Rules = z.infer<typeof RulesSchema>;

/** Default rules, version 1 of every project (SPEC §8). */
export const DEFAULT_RULES: Rules = {
  policies: {
    set_text: 'auto',
    set_price: 'auto',
    adjust_prices: 'auto',
    set_availability: 'auto',
    set_color: 'auto',
    set_hours: 'auto',
    set_banner: 'agencia',
    toggle_section: 'agencia',
  },
  limits: { maxPriceChangePct: 30, monthlyQuota: 200, minConfidence: 0.6, maxOpsPerRequest: 40 },
};

/** Policy for an operation type. Unknown or missing types fall back to `agencia`. */
export function policyFor(rules: Rules, type: OpType | string): Policy {
  return rules.policies[type] ?? 'agencia';
}

export function defaultRules(): Rules {
  return structuredClone(DEFAULT_RULES);
}

export { OP_TYPES };
