import { describe, expect, it } from "vitest";
import { sanitizeEvent } from "../src/lib/landing/events";

describe("sanitizeEvent", () => {
  it("acepta los eventos conocidos con etiquetas cortas", () => {
    expect(sanitizeEvent({ event: "cta_click", props: { cta: "beta", section: "hero" } })).toEqual({
      event: "cta_click",
      props: { cta: "beta", section: "hero" },
    });
    expect(sanitizeEvent({ event: "calc_used", props: { plan: "agencia", roi: "1x-3x", currency: "UYU" } })?.props).toEqual({
      plan: "agencia",
      roi: "1x-3x",
      currency: "UYU",
    });
  });

  it("descarta eventos desconocidos y cualquier dato que no sea una etiqueta permitida", () => {
    expect(sanitizeEvent({ event: "pageview" })).toBeNull();
    expect(sanitizeEvent(null)).toBeNull();
    expect(sanitizeEvent("cta_click")).toBeNull();
    const e = sanitizeEvent({ event: "signup_started", props: { plan: "agencia", email: "a@b.com", section: "Precios con espacios", clients: 25 } });
    expect(e?.props).toEqual({ plan: "agencia" });
  });
});
