/**
 * Model price table in USD per million tokens: Anthropic first-party rates from
 * https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-20). Cache writes are the
 * 5-minute TTL (1.25x input). Cache reads are 0.1x input, except 0.05x on Opus 5.5 and Sonnet 5.5 and
 * 0.025x on Fable 5.1. Bedrock rates may differ; we use the same table.
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  fake: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

/**
 * Claude Haiku 5.5 prices by prompt length: a request whose prompt (input plus cache reads and writes)
 * is over 100,000 tokens pays this card for the whole request.
 */
export const LONG_PROMPT_PRICES: Record<string, { threshold: number; price: ModelPrice }> = {
  'claude-haiku-5-5': { threshold: 100_000, price: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 } },
};

/** Used for unknown models so costs are never under-reported. */
const FALLBACK: ModelPrice = MODEL_PRICES['claude-opus-5-5']!;

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Normalizes provider-specific ids, e.g. Bedrock `anthropic.claude-opus-5-5` or `us.anthropic.…`. */
export function normalizeModelId(model: string): string {
  return model.replace(/^([a-z]{2,4}\.)?anthropic\./, '').replace(/-v\d+(:\d+)?$/, '');
}

export function priceFor(model: string): ModelPrice {
  return MODEL_PRICES[normalizeModelId(model)] ?? FALLBACK;
}

export function costUsd(usage: Usage | Usage[]): number {
  const list = Array.isArray(usage) ? usage : [usage];
  let total = 0;
  for (const u of list) {
    const long = LONG_PROMPT_PRICES[normalizeModelId(u.model)];
    const prompt = u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0);
    const p = long && prompt > long.threshold ? long.price : priceFor(u.model);
    total +=
      (u.inputTokens * p.input +
        u.outputTokens * p.output +
        (u.cacheReadTokens ?? 0) * p.cacheRead +
        (u.cacheWriteTokens ?? 0) * p.cacheWrite) /
      1_000_000;
  }
  return Math.round(total * 1e6) / 1e6;
}

export const EMPTY_USAGE = (model = 'fake'): Usage => ({ model, inputTokens: 0, outputTokens: 0 });
