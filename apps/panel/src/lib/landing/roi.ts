// La cuenta de la calculadora de la landing (docs/LANDING.md §10). Sin cajas negras: la página muestra estas
// mismas fórmulas. Funciones puras, con pruebas en test/landing-roi.test.ts.

import { PLANS, PRICING_TERMS, type Cycle, type Plan } from "./config";

export interface RoiInputs {
  /** Clientes activos (un proyecto por cliente). */
  clients: number;
  /** Pedidos de cambio por cliente por mes. */
  requestsPerClient: number;
  /** Porcentaje de los pedidos que es simple (Walt lo resuelve sin el equipo). */
  simplePct: number;
  /** Minutos por pedido a mano: atender, cambiar, publicar y retomar el foco. */
  minutesPerRequest: number;
  /** Costo por hora del equipo, en USD. */
  hourlyCost: number;
  /** Lo que cobra hoy por cliente de mantenimiento, en USD por mes. */
  maintenancePrice: number;
  /** Porcentaje de los pedidos que podría cobrar como extra. */
  extraPct: number;
  /** Precio de cada extra, en USD. */
  extraPrice: number;
}

export type InputKey = keyof RoiInputs;

/** Valores por defecto: supuestos, salvo el costo por hora (Clutch, agencias de Uruguay; docs/LANDING.md §10). */
export const DEFAULT_INPUTS: RoiInputs = {
  clients: 10,
  requestsPerClient: 5,
  simplePct: 60,
  minutesPerRequest: 20,
  hourlyCost: 25,
  maintenancePrice: 60,
  extraPct: 10,
  extraPrice: 30,
};

export const LIMITS: Record<InputKey, { min: number; max: number; step: number }> = {
  clients: { min: 1, max: 100, step: 1 },
  requestsPerClient: { min: 1, max: 60, step: 1 },
  simplePct: { min: 0, max: 100, step: 5 },
  minutesPerRequest: { min: 5, max: 180, step: 5 },
  hourlyCost: { min: 5, max: 200, step: 1 },
  maintenancePrice: { min: 0, max: 1000, step: 5 },
  extraPct: { min: 0, max: 50, step: 1 },
  extraPrice: { min: 0, max: 500, step: 5 },
};

/** Claves cortas para compartir el resultado por link (sin datos personales). */
const URL_KEYS: Record<InputKey, string> = {
  clients: "c",
  requestsPerClient: "p",
  simplePct: "s",
  minutesPerRequest: "m",
  hourlyCost: "h",
  maintenancePrice: "mp",
  extraPct: "e",
  extraPrice: "ep",
};

export interface PlanChoice {
  plan: Plan;
  /** USD por mes: el plan más los proyectos extra. */
  monthlyCost: number;
  extraProjects: number;
}

export interface RoiResult {
  requestsPerMonth: number;
  simpleRequests: number;
  hoursSaved: number;
  moneySaved: number;
  /** Lo que se cobraría como extra, antes de la comisión de Walt. */
  extraGross: number;
  commission: number;
  /** Ingreso extra después de la comisión de Walt. */
  extraNet: number;
  choice: PlanChoice;
  /** Ahorro más ingreso extra, menos el plan. Puede ser negativo. */
  net: number;
  /** Retorno: neto sobre el costo del plan (1 = recupera una vez lo que paga). */
  roi: number;
  /** En cuántos días el beneficio paga el plan del mes. null si no hay beneficio. */
  paybackDays: number | null;
  /** Lo que la agencia factura hoy de mantenimiento (clientes × precio). */
  maintenanceRevenue: number;
}

export function clampInput(key: InputKey, value: number): number {
  const { min, max } = LIMITS[key];
  if (!Number.isFinite(value)) return DEFAULT_INPUTS[key];
  return Math.min(max, Math.max(min, value));
}

/** El plan más barato que cubre esa cantidad de proyectos, contando los proyectos extra de cada uno. */
export function choosePlan(projects: number, cycle: Cycle = "mensual", plans: readonly Plan[] = PLANS): PlanChoice {
  let best: PlanChoice | null = null;
  for (const plan of plans) {
    const base = cycle === "anual" ? plan.yearlyPerMonth : plan.monthly;
    const extraProjects = Math.max(0, projects - plan.projects);
    const monthlyCost = base + extraProjects * plan.extraProject;
    // A igual costo, el que incluye más (menos proyectos extra: más asientos y cambios de código).
    const better = !best || monthlyCost < best.monthlyCost || (monthlyCost === best.monthlyCost && extraProjects < best.extraProjects);
    if (better) best = { plan, monthlyCost, extraProjects };
  }
  if (!best) throw new Error("No hay planes configurados");
  return best;
}

export function computeRoi(raw: RoiInputs, cycle: Cycle = "mensual"): RoiResult {
  const i = normalizeInputs(raw);
  const requestsPerMonth = i.clients * i.requestsPerClient;
  const simpleRequests = (requestsPerMonth * i.simplePct) / 100;
  const hoursSaved = (simpleRequests * i.minutesPerRequest) / 60;
  const moneySaved = hoursSaved * i.hourlyCost;
  const extraGross = ((requestsPerMonth * i.extraPct) / 100) * i.extraPrice;
  const commission = (extraGross * PRICING_TERMS.commissionOwnPct) / 100;
  const extraNet = extraGross - commission;
  const choice = choosePlan(i.clients, cycle);
  const benefit = moneySaved + extraNet;
  const net = benefit - choice.monthlyCost;
  const roi = choice.monthlyCost > 0 ? net / choice.monthlyCost : 0;
  const paybackDays = benefit > 0 ? Math.max(1, Math.ceil((choice.monthlyCost / benefit) * 30)) : null;
  return {
    requestsPerMonth,
    simpleRequests,
    hoursSaved,
    moneySaved,
    extraGross,
    commission,
    extraNet,
    choice,
    net,
    roi,
    paybackDays,
    maintenanceRevenue: i.clients * i.maintenancePrice,
  };
}

export function normalizeInputs(raw: Partial<RoiInputs>): RoiInputs {
  const out = { ...DEFAULT_INPUTS };
  for (const key of Object.keys(DEFAULT_INPUTS) as InputKey[]) {
    const v = raw[key];
    if (typeof v === "number") out[key] = clampInput(key, v);
  }
  return out;
}

/** Plata redondeada sin exagerar: a múltiplos de 5, o de 10 por encima de 1.000. Respeta el signo. */
export function roundMoney(value: number): number {
  const step = Math.abs(value) >= 1000 ? 10 : 5;
  const r = Math.round(value / step) * step;
  return Object.is(r, -0) ? 0 : r;
}

/** Horas enteras; menos de una hora se muestra como 0. */
export function roundHours(value: number): number {
  return Math.round(value);
}

/** Tramo del retorno para medir el uso de la calculadora sin guardar los valores. */
export function roiBucket(roi: number): "negativo" | "hasta-1x" | "1x-3x" | "3x-10x" | "mas-10x" {
  if (roi < 0) return "negativo";
  if (roi < 1) return "hasta-1x";
  if (roi < 3) return "1x-3x";
  if (roi < 10) return "3x-10x";
  return "mas-10x";
}

export function encodeInputs(inputs: RoiInputs, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(URL_KEYS) as InputKey[]) {
    if (inputs[key] !== DEFAULT_INPUTS[key]) params.set(URL_KEYS[key], String(inputs[key]));
  }
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
  return params.toString();
}

/** Lee los valores de un link compartido; lo que falta o no es un número queda en su valor por defecto. */
export function decodeInputs(params: URLSearchParams): RoiInputs {
  const out = { ...DEFAULT_INPUTS };
  for (const key of Object.keys(URL_KEYS) as InputKey[]) {
    const raw = params.get(URL_KEYS[key]);
    if (raw === null || raw.trim() === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = clampInput(key, n);
  }
  return out;
}
