import { describe, expect, it } from "vitest";
import { checkoutDecision, PaymentsNotConfigured, paymentsEnabled, providerFor, providers } from "../src/lib/landing/payments";

describe("cobro de planes", () => {
  it("está apagado por defecto", () => {
    expect(paymentsEnabled({})).toBe(false);
    expect(checkoutDecision("UY", {})).toEqual({ kind: "off" });
  });

  it("Mercado Pago en Uruguay, Paddle en Brasil y nada en otros países", () => {
    expect(providerFor("uy")).toBe("mercadopago");
    expect(providerFor("BR")).toBe("paddle");
    expect(providerFor("AR")).toBeNull();
    expect(checkoutDecision("AR", { PAYMENTS_ENABLED: "1" })).toEqual({ kind: "no_provider", country: "AR" });
  });

  it("encendido sin credenciales dice qué falta, sin inventar un checkout", async () => {
    expect(checkoutDecision("UY", { PAYMENTS_ENABLED: "1" })).toEqual({ kind: "not_configured", provider: "mercadopago", missing: ["MERCADOPAGO_ACCESS_TOKEN"] });
    expect(checkoutDecision("BR", { PAYMENTS_ENABLED: "1", PADDLE_API_KEY: "k" })).toEqual({ kind: "not_configured", provider: "paddle", missing: ["PADDLE_PRICE_IDS"] });
    await expect(providers({}).mercadopago.createCheckout({ factoryId: "f", plan: "agencia", cycle: "mensual", country: "UY" })).rejects.toBeInstanceOf(PaymentsNotConfigured);
  });

  it("aun con credenciales, la llamada al proveedor no está conectada y lo dice", async () => {
    const env = { PAYMENTS_ENABLED: "1", MERCADOPAGO_ACCESS_TOKEN: "x" };
    const d = checkoutDecision("UY", env);
    expect(d.kind).toBe("ready");
    if (d.kind === "ready") {
      await expect(d.provider.createCheckout({ factoryId: "f", plan: "agencia", cycle: "mensual", country: "UY" })).rejects.toThrow(/todavía no está conectado/);
    }
  });
});
