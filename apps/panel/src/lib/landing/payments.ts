// Cobro de los planes: armado y apagado (docs/LANDING.md §11). Hoy no hay entidad legal ni cuentas de
// Mercado Pago o Paddle: con PAYMENTS_ENABLED distinto de "1" nada de esto se muestra ni se llama.
// Nunca hay un checkout falso: sin credenciales, el flujo dice que el cobro no está habilitado.

import type { Cycle, PlanId } from "./config";

export type ProviderId = "mercadopago" | "paddle";

export interface CheckoutRequest {
  factoryId: string;
  plan: PlanId;
  cycle: Cycle;
  /** País de la agencia (ISO 3166-1 alfa-2). Define el proveedor. */
  country: string;
}

export interface CheckoutProvider {
  id: ProviderId;
  /** Variables que tienen que existir para cobrar con este proveedor. */
  requiredEnv: readonly string[];
  /** Crea el pago y devuelve la URL del proveedor. Se completa cuando exista la cuenta (R2). */
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
}

export class PaymentsNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentsNotConfigured";
  }
}

type Env = Record<string, string | undefined>;

export function paymentsEnabled(env: Env = process.env): boolean {
  return env.PAYMENTS_ENABLED === "1";
}

/** Mercado Pago en Uruguay; Paddle en Brasil (docs/NEGOCIO.md §1: Stripe no admite Uruguay). */
export function providerFor(country: string): ProviderId | null {
  const c = country.trim().toUpperCase();
  if (c === "UY") return "mercadopago";
  if (c === "BR") return "paddle";
  return null;
}

function missing(provider: CheckoutProvider, env: Env): string[] {
  return provider.requiredEnv.filter((k) => !env[k]);
}

function notConnected(id: ProviderId, env: Env, required: readonly string[]): CheckoutProvider["createCheckout"] {
  return async () => {
    const lacking = required.filter((k) => !env[k]);
    throw new PaymentsNotConfigured(
      lacking.length
        ? `El cobro con ${id} no está configurado: faltan ${lacking.join(", ")}.`
        : `El cobro con ${id} todavía no está conectado: se conecta y se prueba con la cuenta de prueba del proveedor (R2).`,
    );
  };
}

export function providers(env: Env = process.env): Record<ProviderId, CheckoutProvider> {
  const mpEnv = ["MERCADOPAGO_ACCESS_TOKEN"] as const;
  const paddleEnv = ["PADDLE_API_KEY", "PADDLE_PRICE_IDS"] as const;
  return {
    mercadopago: { id: "mercadopago", requiredEnv: mpEnv, createCheckout: notConnected("mercadopago", env, mpEnv) },
    paddle: { id: "paddle", requiredEnv: paddleEnv, createCheckout: notConnected("paddle", env, paddleEnv) },
  };
}

export type CheckoutDecision =
  | { kind: "off" }
  | { kind: "no_provider"; country: string }
  | { kind: "not_configured"; provider: ProviderId; missing: string[] }
  | { kind: "ready"; provider: CheckoutProvider };

/** Qué pasa si una agencia quiere pagar hoy. Con el cobro apagado, siempre "off". */
export function checkoutDecision(country: string, env: Env = process.env): CheckoutDecision {
  if (!paymentsEnabled(env)) return { kind: "off" };
  const id = providerFor(country);
  if (!id) return { kind: "no_provider", country };
  const provider = providers(env)[id];
  const lacking = missing(provider, env);
  if (lacking.length) return { kind: "not_configured", provider: id, missing: lacking };
  return { kind: "ready", provider };
}
