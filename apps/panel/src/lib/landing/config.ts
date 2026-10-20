// Todo lo que la landing dice en números vive acá: precios, cupos, tipos de cambio, la beta y el contacto.
// Cambiar un precio es editar este archivo (docs/LANDING.md §11). Los precios son la propuesta de
// docs/NEGOCIO.md §1, rotulados «precios de lanzamiento, en beta».

export type PlanId = "freelancer" | "agencia" | "estudio";
export type Cycle = "mensual" | "anual";

export interface Plan {
  id: PlanId;
  name: string;
  /** USD por mes, pagando mes a mes. */
  monthly: number;
  /** USD por mes, pagando el año (2 meses menos). */
  yearlyPerMonth: number;
  projects: number;
  seats: number;
  /** Cambios de código o delicados incluidos por mes. */
  codeChanges: number;
  /** USD por cada proyecto activo por encima de los incluidos. */
  extraProject: number;
  /** Para quién es, en una línea. */
  forWhom: string;
  /** Lo que incluye además de lo común a todos. */
  includes: string[];
  /** Lo que llega más adelante (se muestra como «Próximamente»). */
  soon: string[];
  highlight?: boolean;
}

export const PLANS: readonly Plan[] = [
  {
    id: "freelancer",
    name: "Freelancer",
    monthly: 29,
    yearlyPerMonth: 24,
    projects: 3,
    seats: 1,
    codeChanges: 15,
    extraProject: 10,
    forWhom: "Para quien mantiene pocos proyectos y no quiere ser el soporte de nadie a las 11 de la noche.",
    includes: ["3 proyectos activos", "1 persona", "15 cambios de código por mes", "Proyecto extra: USD 10"],
    soon: ["WhatsApp: USD 15 por número"],
  },
  {
    id: "agencia",
    name: "Agencia",
    monthly: 99,
    yearlyPerMonth: 82,
    projects: 10,
    seats: 5,
    codeChanges: 60,
    extraProject: 8,
    forWhom: "Para una agencia con varios clientes en mantenimiento y un equipo chico.",
    includes: ["10 proyectos activos", "5 personas", "60 cambios de código por mes", "Proyecto extra: USD 8"],
    soon: ["1 número de WhatsApp incluido"],
    highlight: true,
  },
  {
    id: "estudio",
    name: "Estudio",
    monthly: 249,
    yearlyPerMonth: 207,
    projects: 30,
    seats: 15,
    codeChanges: 200,
    extraProject: 6,
    forWhom: "Para un estudio con una cartera grande y varios equipos.",
    includes: ["30 proyectos activos", "15 personas", "200 cambios de código por mes", "Proyecto extra: USD 6"],
    soon: ["3 números de WhatsApp incluidos"],
  },
];

/** Lo que tienen todos los planes. */
export const ALL_PLANS_INCLUDE = [
  "Cambios de contenido y consultas sin límite (uso razonable)",
  "Reglas por proyecto, simulador y aprobaciones con el diff a la vista",
  "Presupuestos con link de seña",
  "Marca blanca: tus clientes hablan con el asistente de tu agencia",
] as const;

export const PRICING_TERMS = {
  label: "Precios de lanzamiento, en beta",
  extraCodeChangeUsd: 1,
  /** Sobre lo que la agencia cobra por Walt a sus clientes (extras, presupuestos, señas). */
  commissionOwnPct: 5,
  /** Sobre las oportunidades que trae Walt (R3): se muestra como «Próximamente». */
  commissionOpportunitiesPct: 10,
  trialDays: 14,
  betaFreeMonths: 3,
  betaAgencies: "3 a 5",
} as const;

/**
 * Tipos de cambio fijos y fechados, solo para mostrar la calculadora en otra moneda (aproximado).
 * USD→UYU: Banco Central del Uruguay, dólar billete, 19/10/2026 (40,125).
 * USD→BRL: Banco Central do Brasil, PTAX de venta, 19/10/2026 (5,0564).
 */
export const CURRENCIES = {
  USD: { code: "USD", label: "Dólares", perUsd: 1, locale: "es-UY", source: null },
  UYU: { code: "UYU", label: "Pesos uruguayos", perUsd: 40.13, locale: "es-UY", source: "BCU, 19/10/2026" },
  BRL: { code: "BRL", label: "Reales", perUsd: 5.06, locale: "pt-BR", source: "Banco Central do Brasil (PTAX), 19/10/2026" },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;

/**
 * Contacto público: vacío hasta que Salva lo confirme (docs/LANDING.md §14). Con un mail cargado, el pie
 * lo muestra; sin él, el pie no muestra ningún dato personal.
 */
export const PUBLIC_CONTACT: { email: string | null; phone: string | null } = { email: null, phone: null };

/** Nombres del equipo de build 101: vacío hasta que el equipo confirme que se publiquen. */
export const TEAM: readonly string[] = [];

export function planById(id: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}

export function isCycle(v: string | null | undefined): v is Cycle {
  return v === "mensual" || v === "anual";
}
