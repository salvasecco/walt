import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeRedirect } from "@/lib/redirect";
import { createAgency, membershipsOf } from "@/lib/session";
import { supabaseUser } from "@/lib/supabase/ssr";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Vuelta de los mails de Supabase Auth (confirmar la cuenta, link para entrar, invitación al equipo).
 * Acepta `?code=` (PKCE, mismo navegador) y `?token_hash=&type=` (plantilla de mail recomendada para SSR).
 * Si la cuenta se registró con una agencia y todavía no la tiene, la crea con el usuario como dueño.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const next = safeRedirect(sp.get("next"));
  const supabase = await supabaseUser();
  const code = sp.get("code");
  const tokenHash = sp.get("token_hash");
  const type = sp.get("type") as EmailOtpType | null;
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type && OTP_TYPES.includes(type)) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  if (!ok) redirect("/entrar?error=link");

  // El mismo cliente que acaba de iniciar la sesión: la tiene aunque las cookies todavía no estén en este pedido.
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const agency = user?.user_metadata?.agency_name;
  if (user && typeof agency === "string" && agency.trim() && !(await membershipsOf(user.id, supabase)).length) {
    try {
      await createAgency(user.id, agency);
    } catch {
      // Si falla, al entrar se le pide que cree la agencia (/registro/agencia).
    }
  }
  redirect(next);
}
