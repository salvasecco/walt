import { OPEN_STATUSES } from "./labels";
import type { DaleEvent, DaleRequest } from "./types";

export type NodeState = "pendiente" | "activo" | "esperando" | "ok" | "falla" | "omitido";

export type JourneyNode = {
  step: string;
  state: NodeState;
  durationMs: number | null;
  at: string | null;
  detail: Record<string, unknown> | null;
};

const CONTENT_AUTO = ["recibido", "interpretado", "decidido", "gate", "borrador", "captura", "enviado", "aprobado_cliente", "publicado", "commit"];
const CONTENT_AGENCY = ["recibido", "interpretado", "decidido", "gate", "borrador", "captura", "enviado", "aprobado_agencia", "publicado", "commit"];
const CODE = ["recibido", "interpretado", "decidido", "aprobado_agencia", "agente_inicio", "agente_pr", "agente_preview", "publicado", "en_la_web"];
const QUESTION = ["recibido", "interpretado", "decidido", "respondido"];
const QUOTE = ["recibido", "interpretado", "decidido", "presupuesto", "enviado"];
const BLOCKED = ["recibido", "interpretado", "decidido", "enviado"];
const CHAT = ["recibido", "interpretado", "decidido", "enviado"];

/** Pasos que se agregan al final si aparecen en los eventos. */
const TRAILING = ["revertido", "derivado"];
/** Pasos internos que no se dibujan como nodo propio. */
const HIDDEN = new Set(["publicando"]);

export function basePath(req: Pick<DaleRequest, "category" | "lane">): string[] {
  switch (req.category) {
    case "permitido":
      return CONTENT_AUTO;
    case "riesgoso":
      return req.lane === "codigo" ? CODE : CONTENT_AGENCY;
    case "consulta":
      return QUESTION;
    case "fuera_de_alcance":
      return QUOTE;
    case "bloqueado":
      return BLOCKED;
    case "charla":
      return CHAT;
    case "derivado":
      return ["recibido", "interpretado", "decidido"];
    default:
      return CONTENT_AUTO;
  }
}

export function buildJourney(req: DaleRequest, events: DaleEvent[]): JourneyNode[] {
  const mine = events.filter((e) => e.request_id === req.id).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id));
  const last = new Map<string, DaleEvent>();
  for (const e of mine) last.set(e.step, e);

  const path = [...basePath(req)];
  // Pasos con eventos que el camino base no tiene (p. ej. derivado o un camino distinto al esperado).
  for (const e of mine) {
    if (HIDDEN.has(e.step) || path.includes(e.step)) continue;
    if (TRAILING.includes(e.step)) continue;
    // Insertar antes del primer paso sin eventos para respetar el orden real.
    const firstPending = path.findIndex((s) => !last.has(s));
    if (firstPending === -1) path.push(e.step);
    else path.splice(firstPending, 0, e.step);
  }
  for (const t of TRAILING) if (last.has(t)) path.push(t);

  const open = OPEN_STATUSES.includes(req.status);
  const waiting = req.status === "esperando_cliente" || req.status === "esperando_agencia" || req.status === "agente_listo";
  let marked = false;
  return path.map((step) => {
    const e = last.get(step);
    let state: NodeState;
    if (!e) {
      if (open && !marked) {
        state = waiting ? "esperando" : "pendiente";
        marked = true;
      } else state = open ? "pendiente" : "omitido";
    } else state = e.status === "inicio" ? "activo" : e.status;
    if (e?.status === "inicio") marked = true;
    return { step, state, durationMs: e?.duration_ms ?? null, at: e?.at ?? null, detail: e?.detail ?? null };
  });
}

/** Tiempo desde que llegó el pedido hasta publicado, si se publicó. */
export function timeToPublish(req: DaleRequest, events: DaleEvent[]): number | null {
  const pub = events.find((e) => e.request_id === req.id && e.step === "publicado" && e.status === "ok");
  if (!pub) return null;
  return new Date(pub.at).getTime() - new Date(req.created_at).getTime();
}
