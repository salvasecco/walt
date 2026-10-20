import { sanitizeEvent } from "@/lib/landing/events";
import { recordLandingEvent } from "@/lib/landing/events-server";

// Eventos de la landing (docs/LANDING.md §12). Responde siempre 204: no dice si guardó, ni por qué no.
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 0 && raw.length <= 2000) {
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    const clean = sanitizeEvent(body);
    if (clean) await recordLandingEvent(clean);
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
