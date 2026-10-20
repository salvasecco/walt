// Del lado del navegador: manda un evento de la landing sin esperar respuesta ni bloquear nada.
import type { LandingEvent } from "./events";

export function track(event: LandingEvent, props: Record<string, string> = {}): void {
  try {
    const body = JSON.stringify({ event, props });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/eventos", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/eventos", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
  } catch {
    // ignore
  }
}
