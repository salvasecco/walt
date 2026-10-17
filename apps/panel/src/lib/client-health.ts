// Salud de un cliente y consumo del mes. Funciones puras para poder probarlas.
import type { RequestStatus } from "./types";

export type HealthLevel = "verde" | "ambar" | "rojo";

export const HEALTH_LABEL: Record<HealthLevel, string> = { verde: "Bien", ambar: "Atento", rojo: "Urgente" };

/** La regla, tal cual se muestra en el tooltip. */
export const HEALTH_RULE = [
  "Rojo: algo en “Te necesita” hace más de 24 h, o se pasó del cupo del mes.",
  "Ámbar: algo en “Te necesita”, usó el 80% del cupo o más, o no pidió nada en 30 días.",
  "Verde: el resto.",
];

const DAY = 86_400_000;

export type HealthInput = {
  /** Cupo mensual de cambios; null si el cliente no tiene plan cargado. */
  quota: number | null;
  usedThisMonth: number;
  /** Desde cuándo está cada cosa que lo pone en "Te necesita". */
  needsSince: string[];
  lastRequestAt: string | null;
  now: number;
};

export type Health = { level: HealthLevel; reasons: string[] };

export function clientHealth({ quota, usedThisMonth, needsSince, lastRequestAt, now }: HealthInput): Health {
  const red: string[] = [];
  const amber: string[] = [];
  const oldest = needsSince.length ? Math.min(...needsSince.map((s) => Date.parse(s))) : null;
  if (oldest != null) {
    if (now - oldest > DAY) red.push("Hay algo esperándote hace más de 24 h");
    else amber.push(needsSince.length === 1 ? "Hay algo esperándote" : `Hay ${needsSince.length} cosas esperándote`);
  }
  if (quota != null) {
    if (usedThisMonth > quota) red.push(`Se pasó del cupo: ${usedThisMonth} de ${quota}`);
    else if (quota === 0 ? usedThisMonth > 0 : usedThisMonth / quota >= 0.8) amber.push(`Usó ${usedThisMonth} de ${quota} cambios del mes`);
  }
  if (!lastRequestAt || now - Date.parse(lastRequestAt) > 30 * DAY) amber.push("No pidió nada en 30 días");
  if (red.length) return { level: "rojo", reasons: [...red, ...amber] };
  if (amber.length) return { level: "ambar", reasons: amber };
  return { level: "verde", reasons: [] };
}

// ── Consumo ───────────────────────────────────────────────────────────────

export const TZ = "America/Montevideo";

const monthFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });

/** "2026-10" para una fecha, en hora de Montevideo. */
export function monthKey(iso: string | number | Date): string {
  const parts = monthFmt.formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/** Las últimas `n` claves de mes, de la más vieja a la actual. */
export function lastMonths(now: number, n: number): string[] {
  const [y, m] = monthKey(now).split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export type UsageRequest = {
  status: RequestStatus;
  lane: "contenido" | "codigo" | null;
  cost_usd: number | null;
  created_at: string;
};

/** Un pedido gasta un cambio del cupo si se publicó (aunque después se haya vuelto atrás), por contenido o por código. */
export function countsAsChange(r: Pick<UsageRequest, "status" | "lane">): boolean {
  return (r.status === "publicado" || r.status === "revertido") && (r.lane === "contenido" || r.lane === "codigo");
}

export type MonthUsage = { month: string; changes: number; cost: number; requests: number };

/** Cambios, costo de IA y pedidos por mes (mes del pedido en hora de Montevideo). */
export function usageByMonth(requests: UsageRequest[], months: string[]): MonthUsage[] {
  const map = new Map(months.map((m) => [m, { month: m, changes: 0, cost: 0, requests: 0 }]));
  for (const r of requests) {
    const row = map.get(monthKey(r.created_at));
    if (!row) continue;
    row.requests++;
    row.cost += Number(r.cost_usd ?? 0);
    if (countsAsChange(r)) row.changes++;
  }
  return [...map.values()];
}
