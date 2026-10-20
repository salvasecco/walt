import { NextResponse } from "next/server";
import { isCycle, planById } from "@/lib/landing/config";
import { checkoutDecision, PaymentsNotConfigured } from "@/lib/landing/payments";
import { getViewer } from "@/lib/session";

// Pagar el plan elegido en la landing. Apagado (PAYMENTS_ENABLED): vuelve al panel sin cobrar nada.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = new URL("/atencion", url.origin);
  const viewer = await getViewer();
  if (!viewer || viewer.kind !== "user" || !viewer.factory) return NextResponse.redirect(new URL("/entrar", url.origin));
  const plan = planById(url.searchParams.get("plan"));
  const cycleParam = url.searchParams.get("ciclo");
  const cycle = isCycle(cycleParam) ? cycleParam : "mensual";
  const decision = checkoutDecision(url.searchParams.get("pais") ?? "UY");
  if (!plan || decision.kind !== "ready") return NextResponse.redirect(back);
  try {
    const { url: checkout } = await decision.provider.createCheckout({ factoryId: viewer.factory.id, plan: plan.id, cycle, country: url.searchParams.get("pais") ?? "UY" });
    return NextResponse.redirect(checkout);
  } catch (e) {
    if (e instanceof PaymentsNotConfigured) return NextResponse.redirect(back);
    throw e;
  }
}
