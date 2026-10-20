// Tablero de Atención: en qué columna va cada proyecto según su pedido más urgente.
// Funciones puras (sin Supabase ni React) para poder probarlas.
import { isPendingAgency } from "./taxonomy";
import type { RequestStatus } from "./types";

export type Column = "te_necesita" | "en_curso" | "esperando_cliente" | "al_dia";

/** Orden visual de las columnas. */
export const COLUMNS: Column[] = ["te_necesita", "esperando_cliente", "en_curso", "al_dia"];

/** Precedencia: un proyecto va a la primera columna de esta lista que le corresponda. */
export const PRECEDENCE: Column[] = ["te_necesita", "en_curso", "esperando_cliente", "al_dia"];

export const COLUMN_LABEL: Record<Column, string> = {
  te_necesita: "Te necesita",
  esperando_cliente: "Esperando al cliente",
  en_curso: "En curso",
  al_dia: "Al día",
};

/** Derivados cuentan solo si son de los últimos 7 días (y no hubo un publicado después). */
export const RECENT_MS = 7 * 86_400_000;

const IN_PROGRESS: RequestStatus[] = ["recibido", "interpretando", "cotizando", "agente_trabajando", "publicando"];
/**
 * Lo que queda para una persona sin respuesta automática. Un bloqueado no: no se aplica nada y al cliente
 * ya se le avisó (brief §1), así que no espera a la agencia.
 */
const HANDED_OFF: RequestStatus[] = ["derivado"];

export type AttRequest = {
  id: string;
  short_id: string;
  project_id: string;
  raw_text: string;
  summary?: string | null;
  status: RequestStatus;
  /** Guardada: puede venir con un nombre viejo. Solo lo delicado espera a la agencia. */
  category: string | null;
  created_at: string;
};

export type AttQuote = {
  id: string;
  status: "borrador" | "enviado" | "aceptado" | "rechazado";
  title: string;
  created_at: string;
  project_id: string | null;
  request_short_id: string | null;
};

export type AttVersion = {
  id: string;
  project_id: string;
  status: string;
  git_error: string | null;
  git_commit_sha: string | null;
  created_at: string;
  request_short_id: string | null;
};

export type ItemKind =
  | "aprobar"
  | "agente_listo"
  | "presupuesto_borrador"
  | "derivado"
  | "commit_fallido"
  | "en_curso"
  | "esperando_cliente"
  | "presupuesto_enviado"
  | "ultimo_pedido";

export type Action = "aprobar" | "ver" | "presupuesto";

export type AttItem = {
  kind: ItemKind;
  column: Column;
  /** Desde cuándo está así (para "hace cuánto" y para ordenar). */
  since: string;
  text: string;
  shortId: string | null;
  requestId: string | null;
  status: RequestStatus | null;
  quoteId: string | null;
  action: Action;
};

export const KIND_LABEL: Record<ItemKind, string> = {
  aprobar: "Espera tu aprobación",
  agente_listo: "Cambio de código listo para revisar",
  presupuesto_borrador: "Presupuesto en borrador",
  derivado: "Derivado a la agencia",
  commit_fallido: "El commit falló",
  en_curso: "En curso",
  esperando_cliente: "Espera la respuesta del cliente",
  presupuesto_enviado: "Presupuesto enviado",
  ultimo_pedido: "Último pedido",
};

export type ProjectAttention = {
  projectId: string;
  column: Column;
  /** El ítem que pone al proyecto en su columna. */
  item: AttItem | null;
  /** Todos los ítems abiertos del proyecto, del más urgente al menos. */
  items: AttItem[];
};

const short = (r: AttRequest) => r.summary?.trim() || r.raw_text;

function requestItem(r: AttRequest, kind: ItemKind, column: Column, action: Action): AttItem {
  return { kind, column, since: r.created_at, text: short(r), shortId: r.short_id, requestId: r.id, status: r.status, quoteId: null, action };
}

/** Un derivado sigue abierto si es reciente y no hubo un pedido publicado después en el proyecto. */
export function isOpenHandoff(r: AttRequest, projectRequests: AttRequest[], now: number): boolean {
  if (!HANDED_OFF.includes(r.status)) return false;
  const t = Date.parse(r.created_at);
  if (now - t > RECENT_MS) return false;
  return !projectRequests.some((o) => o.id !== r.id && o.status === "publicado" && Date.parse(o.created_at) > t);
}

/** Ítems abiertos de un proyecto, en orden de urgencia (columna por precedencia y, dentro, el más viejo primero). */
export function projectItems(
  projectId: string,
  data: { requests: AttRequest[]; quotes: AttQuote[]; versions: AttVersion[] },
  now: number,
): AttItem[] {
  const reqs = data.requests.filter((r) => r.project_id === projectId);
  const items: AttItem[] = [];
  for (const r of reqs) {
    // Solo lo delicado espera a la agencia; un pedido simple en esos estados sigue su curso sin ella.
    if (r.status === "esperando_agencia" || r.status === "agente_listo") {
      if (!isPendingAgency(r)) items.push(requestItem(r, "en_curso", "en_curso", "ver"));
      else if (r.status === "esperando_agencia") items.push(requestItem(r, "aprobar", "te_necesita", "aprobar"));
      else items.push(requestItem(r, "agente_listo", "te_necesita", "ver"));
    } else if (isOpenHandoff(r, reqs, now)) items.push(requestItem(r, "derivado", "te_necesita", "ver"));
    else if (IN_PROGRESS.includes(r.status)) items.push(requestItem(r, "en_curso", "en_curso", "ver"));
    else if (r.status === "esperando_cliente") items.push(requestItem(r, "esperando_cliente", "esperando_cliente", "ver"));
  }
  for (const q of data.quotes) {
    if (q.project_id !== projectId) continue;
    const base = { since: q.created_at, text: q.title, shortId: q.request_short_id, requestId: null, status: null, quoteId: q.id };
    if (q.status === "borrador") items.push({ ...base, kind: "presupuesto_borrador", column: "te_necesita", action: "presupuesto" });
    else if (q.status === "enviado") items.push({ ...base, kind: "presupuesto_enviado", column: "esperando_cliente", action: "presupuesto" });
  }
  for (const v of data.versions) {
    if (v.project_id !== projectId || v.status !== "viva" || !v.git_error || v.git_commit_sha) continue;
    items.push({
      kind: "commit_fallido", column: "te_necesita", since: v.created_at, text: v.git_error, shortId: v.request_short_id,
      requestId: null, status: null, quoteId: null, action: "ver",
    });
  }
  return items.sort((a, b) => PRECEDENCE.indexOf(a.column) - PRECEDENCE.indexOf(b.column) || Date.parse(a.since) - Date.parse(b.since));
}

/** Columna de un proyecto y el ítem que lo pone ahí. En "Al día" el ítem es su último pedido, si hay. */
export function classifyProject(
  projectId: string,
  data: { requests: AttRequest[]; quotes: AttQuote[]; versions: AttVersion[] },
  now: number,
): ProjectAttention {
  const items = projectItems(projectId, data, now);
  if (items[0]) return { projectId, column: items[0].column, item: items[0], items };
  const last = data.requests
    .filter((r) => r.project_id === projectId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return { projectId, column: "al_dia", item: last ? requestItem(last, "ultimo_pedido", "al_dia", "ver") : null, items: [] };
}

/** Tablero completo: cada proyecto en una sola columna, ordenado dentro de ella. */
export function buildBoard(
  projectIds: string[],
  data: { requests: AttRequest[]; quotes: AttQuote[]; versions: AttVersion[] },
  now: number,
): Record<Column, ProjectAttention[]> {
  const board: Record<Column, ProjectAttention[]> = { te_necesita: [], esperando_cliente: [], en_curso: [], al_dia: [] };
  for (const id of projectIds) {
    const p = classifyProject(id, data, now);
    board[p.column].push(p);
  }
  const at = (p: ProjectAttention) => (p.item ? Date.parse(p.item.since) : 0);
  // Lo que espera a la agencia o al cliente: el más viejo arriba. En curso y al día: lo más reciente arriba.
  board.te_necesita.sort((a, b) => at(a) - at(b));
  board.esperando_cliente.sort((a, b) => at(a) - at(b));
  board.en_curso.sort((a, b) => at(b) - at(a));
  board.al_dia.sort((a, b) => at(b) - at(a));
  return board;
}
