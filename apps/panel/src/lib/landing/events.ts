// Eventos de conversión de la landing (docs/LANDING.md §12): qué botón, qué sección, qué plan, el tramo del
// retorno. Nunca IP, mail, nombres ni valores que la persona escribió. Funciones puras: test/landing-events.test.ts.

export const LANDING_EVENTS = ["cta_click", "calc_used", "calc_shared", "signup_started", "signup_completed"] as const;
export type LandingEvent = (typeof LANDING_EVENTS)[number];

/** Las únicas propiedades que se guardan, y sus valores posibles (etiquetas cortas). */
const ALLOWED_PROPS: Record<string, RegExp> = {
  cta: /^(beta|calcular|plan|registro|demo)$/,
  section: /^[a-z0-9-]{1,24}$/,
  plan: /^(freelancer|agencia|estudio)$/,
  cycle: /^(mensual|anual)$/,
  roi: /^(negativo|hasta-1x|1x-3x|3x-10x|mas-10x)$/,
  currency: /^(USD|UYU|BRL)$/,
  audience: /^(agencias|freelancers)$/,
};

export interface CleanEvent {
  event: LandingEvent;
  props: Record<string, string>;
}

/** Valida un evento que llega de afuera. Lo que no está en la lista se descarta en silencio. */
export function sanitizeEvent(input: unknown): CleanEvent | null {
  if (!input || typeof input !== "object") return null;
  const { event, props } = input as { event?: unknown; props?: unknown };
  if (typeof event !== "string" || !(LANDING_EVENTS as readonly string[]).includes(event)) return null;
  const clean: Record<string, string> = {};
  if (props && typeof props === "object" && !Array.isArray(props)) {
    for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
      const rule = ALLOWED_PROPS[k];
      if (rule && typeof v === "string" && rule.test(v)) clean[k] = v;
    }
  }
  return { event: event as LandingEvent, props: clean };
}
