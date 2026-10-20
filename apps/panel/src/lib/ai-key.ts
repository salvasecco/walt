import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Forma de una API key de Anthropic (no una clave de admin, que no sirve para pedir respuestas). */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(key) && !key.startsWith("sk-ant-admin");
}

export type KeyCheck = { ok: true; note?: string } | { ok: false; error: string };

/**
 * Valida la clave de la agencia con una consulta a la API de modelos (no gasta tokens). La clave nunca se
 * loguea ni se devuelve en los errores: los mensajes son nuestros, no los de la API.
 */
export async function validateAnthropicKey(key: string): Promise<KeyCheck> {
  const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 });
  try {
    await client.models.list({ limit: 1 });
    return { ok: true };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "Anthropic dice que la clave no es válida." };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "La clave no tiene permiso para usar la API de Anthropic." };
    // 429: la reconoció, pero esa clave está limitada en este momento.
    if (e instanceof Anthropic.RateLimitError) return { ok: true, note: "Anthropic la reconoció, pero esa clave está llegando a su límite de uso." };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: "No pude hablar con Anthropic para validar la clave. Probá de nuevo." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Anthropic respondió ${e.status ?? "con un error"} al validar la clave.` };
    return { ok: false, error: "No pude validar la clave." };
  }
}
