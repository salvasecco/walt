import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODELS } from "@walt/core";

/** Forma de una API key de Anthropic (no una clave de admin, que no sirve para pedir respuestas). */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(key) && !key.startsWith("sk-ant-admin");
}

export type KeyCheck = { ok: true; note?: string } | { ok: false; error: string };

/** Los modelos que Walt usa con la clave de la agencia: el que clasifica y el del agente de código. */
function modelsWaltUses(): string[] {
  return [...new Set([process.env.MODEL_INTERPRET?.trim() || DEFAULT_MODELS.interpret, process.env.MODEL_AGENT?.trim() || DEFAULT_MODELS.agent])];
}

/**
 * Valida la clave de la agencia sin gastar tokens: `models.retrieve` de cada modelo que Walt usa con ella (como
 * `checkAnthropicKey` de los scripts de infra). 401: no es válida; 403: sin permiso; 404: la organización no
 * tiene ese modelo; 402: sin crédito; 429: la reconoció pero está al límite. La clave nunca se loguea ni vuelve
 * en un mensaje: los mensajes son nuestros, nunca el texto de la API.
 */
export async function validateAnthropicKey(key: string): Promise<KeyCheck> {
  const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 });
  try {
    for (const model of modelsWaltUses()) await client.models.retrieve(model);
    return { ok: true };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "Anthropic dice que la clave no es válida." };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "La clave no tiene permiso para usar la API de Anthropic." };
    if (e instanceof Anthropic.NotFoundError) return { ok: false, error: "La organización de esa clave no tiene acceso a los modelos que usa Walt." };
    if (e instanceof Anthropic.RateLimitError) return { ok: true, note: "Anthropic la reconoció, pero esa clave está llegando a su límite de uso." };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: "No pude hablar con Anthropic para validar la clave. Probá de nuevo." };
    if (e instanceof Anthropic.APIError && e.status === 402) return { ok: false, error: "La organización de esa clave no tiene crédito en Anthropic." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Anthropic respondió ${e.status ?? "con un error"} al validar la clave.` };
    return { ok: false, error: "No pude validar la clave." };
  }
}
