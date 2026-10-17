import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import {
  interpretationJsonSchema,
  InterpretationSchema,
  type Interpretation,
  type QuoteDraft,
  type Usage,
} from '@dale/core';
import { z } from 'zod';
import { formatHistory, formatInventory, loadPrompt } from './prompts.js';
import type { AiProvider, InterpretInput } from './types.js';

/** What a provider-specific transport must do: one Messages API call. */
export interface ModelRequest {
  system: string;
  user: string;
  /** JSON Schema for structured output (`output_config.format`). */
  schema?: Record<string, unknown>;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  timeoutMs: number;
}
export interface ModelResponse {
  text: string;
  usage: Usage;
  stopReason: string | null;
}
export type ModelTransport = (req: ModelRequest) => Promise<ModelResponse>;

export const INTERPRET_TIMEOUT_MS = 45_000;

export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiOutputError';
  }
}

const QuoteDraftSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  amountUsd: z.number().nonnegative(),
  etaDays: z.number().int().nonnegative(),
});
const quoteJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    amountUsd: { type: 'number' },
    etaDays: { type: 'integer' },
  },
  required: ['title', 'description', 'amountUsd', 'etaDays'],
  additionalProperties: false,
};

type RawUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};
type RawMessage = { model: string; stop_reason: string | null; usage: RawUsage; content: { type: string; text?: string }[] };

function toResponse(msg: RawMessage, requestedModel: string): ModelResponse {
  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  return {
    text,
    stopReason: msg.stop_reason,
    usage: {
      model: msg.model || requestedModel,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

function baseParams(model: string, req: ModelRequest) {
  return {
    model,
    max_tokens: req.maxTokens,
    // The static system prompt is cached; the inventory and the message go in the user turn.
    system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: req.user }],
    output_config: {
      effort: req.effort,
      ...(req.schema ? { format: { type: 'json_schema' as const, schema: req.schema } } : {}),
    },
  };
}

/** First-party Claude API, with the server-side refusal fallback. */
export function anthropicTransport(opts: { apiKey: string; model: string }): ModelTransport {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1 });
  return async (req) => {
    const msg = await client.beta.messages.create(
      { ...baseParams(opts.model, req), betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
      { timeout: req.timeoutMs },
    );
    return toResponse(msg as unknown as RawMessage, opts.model);
  };
}

/** Bedrock model ids carry the `anthropic.` prefix. */
export function bedrockModelId(model: string): string {
  return /^([a-z]{2,4}\.)?anthropic\./.test(model) ? model : `anthropic.${model}`;
}

/** Claude in Amazon Bedrock (Mantle client, Messages API shape). */
export function bedrockTransport(opts: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  model: string;
}): ModelTransport {
  const client = new AnthropicBedrockMantle({
    awsRegion: opts.region,
    awsAccessKey: opts.accessKeyId,
    awsSecretAccessKey: opts.secretAccessKey,
    maxRetries: 1,
  });
  const model = bedrockModelId(opts.model);
  return async (req) => {
    const msg = await client.messages.create(baseParams(model, req), { timeout: req.timeoutMs });
    return toResponse(msg as unknown as RawMessage, model);
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AiOutputError('El modelo no devolvió JSON válido');
  }
}

/**
 * Calls the model and validates with zod; one retry if the output does not validate (SPEC §10).
 * Usage of every attempt is returned so the cost is never under-reported.
 */
async function structured<T>(
  transport: ModelTransport,
  req: ModelRequest,
  schema: z.ZodType<T>,
): Promise<{ value: T; usage: Usage[] }> {
  const usage: Usage[] = [];
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await transport(req);
    usage.push(res.usage);
    if (res.stopReason === 'refusal') throw new AiOutputError('El modelo rechazó el pedido');
    if (res.stopReason === 'max_tokens') {
      lastError = new AiOutputError('La respuesta del modelo quedó cortada');
      continue;
    }
    try {
      const parsed = schema.safeParse(parseJson(res.text));
      if (parsed.success) return { value: parsed.data, usage };
      lastError = new AiOutputError(`La salida no valida: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError ?? new AiOutputError('Salida inválida');
}

export function sumUsage(list: Usage[]): Usage {
  return list.reduce<Usage>(
    (a, u) => ({
      model: u.model || a.model,
      inputTokens: a.inputTokens + u.inputTokens,
      outputTokens: a.outputTokens + u.outputTokens,
      cacheReadTokens: (a.cacheReadTokens ?? 0) + (u.cacheReadTokens ?? 0),
      cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (u.cacheWriteTokens ?? 0),
    }),
    { model: list[0]?.model ?? 'fake', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
}

/** Wraps the client's text as untrusted data: neutralizes any closing tag it might carry. */
export function untrusted(tag: string, text: string): string {
  const safe = text.replace(new RegExp(`</?\\s*${tag}\\s*>`, 'gi'), '');
  return `<${tag}>\n${safe}\n</${tag}>`;
}

export function buildInterpretUser(input: InterpretInput): string {
  return [
    `ahora: ${input.now} (zona America/Montevideo)`,
    `cliente: ${input.clientName}`,
    `agencia: ${input.agencyName}`,
    '',
    'Inventario de la web (lo único que se puede tocar):',
    formatInventory(input.inventory),
    '',
    untrusted('historial', formatHistory(input.history)),
    '',
    untrusted('mensaje_cliente', input.text),
  ].join('\n');
}

export interface ClaudeProviderOptions {
  name: 'anthropic' | 'bedrock';
  transport: ModelTransport;
  /** For `transcribe`. */
  openAiKey?: string;
}

export function createClaudeProvider(opts: ClaudeProviderOptions): AiProvider {
  const { transport } = opts;
  return {
    name: opts.name,
    async interpret(input) {
      const { value, usage } = await structured<Interpretation>(
        transport,
        {
          system: loadPrompt('interpret'),
          user: buildInterpretUser(input),
          schema: interpretationJsonSchema,
          effort: 'medium',
          maxTokens: 8000,
          timeoutMs: INTERPRET_TIMEOUT_MS,
        },
        InterpretationSchema,
      );
      // Ops only make sense for a change; never trust them elsewhere.
      const interpretation = value.kind === 'cambio' ? value : { ...value, ops: [], options: undefined };
      return { interpretation, usage: sumUsage(usage) };
    },
    async answerConsulta({ inventory, text, assistantName }) {
      const res = await transport({
        system: loadPrompt('consulta').replace('{asistente}', assistantName ?? 'el asistente'),
        user: ['Inventario de la web:', formatInventory(inventory), '', untrusted('mensaje_cliente', text)].join('\n'),
        effort: 'low',
        maxTokens: 2000,
        timeoutMs: INTERPRET_TIMEOUT_MS,
      });
      if (res.stopReason === 'refusal' || !res.text.trim()) throw new AiOutputError('El modelo no respondió la consulta');
      return { answer: res.text.trim(), usage: res.usage };
    },
    async draftQuote({ text, pastQuotes }) {
      const past = pastQuotes.length
        ? pastQuotes.map((q) => `- ${q.title}: USD ${q.amountUsd}, ${q.etaDays} días${q.status ? ` (${q.status})` : ''}. ${q.description}`).join('\n')
        : '(sin presupuestos anteriores)';
      const { value, usage } = await structured<QuoteDraft>(
        transport,
        {
          system: loadPrompt('presupuesto'),
          user: [`Presupuestos anteriores del proyecto:\n${past}`, '', untrusted('pedido_cliente', text)].join('\n'),
          schema: quoteJsonSchema,
          effort: 'low',
          maxTokens: 4000,
          timeoutMs: INTERPRET_TIMEOUT_MS,
        },
        QuoteDraftSchema,
      );
      return { quote: { ...value, amountUsd: Math.round(value.amountUsd) }, usage: sumUsage(usage) };
    },
    async transcribe(audio, mime) {
      if (!opts.openAiKey) throw new Error('Sin OPENAI_API_KEY no se transcriben audios');
      return transcribeWithOpenAi(opts.openAiKey, audio, mime);
    },
  };
}

/** Optional voice notes: OpenAI transcription API (not a Claude call). */
export async function transcribeWithOpenAi(apiKey: string, audio: Buffer, mime: string): Promise<string> {
  const form = new FormData();
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') ? 'm4a' : 'webm';
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `audio.${ext}`);
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'es');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`La transcripción falló (HTTP ${res.status})`);
  const body = (await res.json()) as { text?: string };
  return (body.text ?? '').trim();
}
