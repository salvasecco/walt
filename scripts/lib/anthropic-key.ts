import Anthropic from '@anthropic-ai/sdk';
import { redact } from '@walt/core';

export type KeyCheck =
  | { ok: true; models: string[] }
  | { ok: false; reason: 'invalida' | 'sin_permiso' | 'sin_modelo' | 'sin_credito' | 'no_responde'; detail: string };

/**
 * Validates an agency's Anthropic key (BYOK) without spending tokens: `models.retrieve` of each model Walt
 * uses with it. A 401 is an invalid key, 403 a key without access, 404 a model the organization cannot
 * use. Never prints the key: every message goes through `redact` with it.
 */
export async function checkAnthropicKey(key: string, models: string[], timeoutMs = 10_000, fetchImpl?: typeof fetch): Promise<KeyCheck> {
  const client = new Anthropic({ apiKey: key, timeout: timeoutMs, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  const clean = (s: string) => redact(s, [key]);
  try {
    for (const m of models) await client.models.retrieve(m);
    return { ok: true, models };
  } catch (err) {
    const detail = clean(err instanceof Error ? err.message : String(err)).slice(0, 300);
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: 'invalida', detail };
    if (err instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: 'sin_permiso', detail };
    if (err instanceof Anthropic.NotFoundError) return { ok: false, reason: 'sin_modelo', detail };
    if (err instanceof Anthropic.APIError && err.status === 402) return { ok: false, reason: 'sin_credito', detail };
    return { ok: false, reason: 'no_responde', detail };
  }
}

export const KEY_CHECK_TEXT: Record<Exclude<KeyCheck, { ok: true }>['reason'], string> = {
  invalida: 'la clave no es válida (401)',
  sin_permiso: 'la clave no tiene permiso para usar la API (403)',
  sin_modelo: 'la organización de esa clave no tiene acceso a los modelos que usa Walt (404)',
  sin_credito: 'la organización de esa clave no tiene crédito (402)',
  no_responde: 'no pude comprobarla ahora (red o API): probá de nuevo',
};
