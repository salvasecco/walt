import "server-only";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { CleanEvent } from "./events";

/**
 * Guarda un evento ya validado. Si la tabla no existe (falta la migración 0007) o no hay base, no hace nada:
 * medir nunca rompe la landing ni el registro.
 */
export async function recordLandingEvent(e: CleanEvent): Promise<void> {
  if (!env.supabaseUrl || !env.supabaseServiceKey) return;
  try {
    await supabaseAdmin().from("landing_events").insert({ event: e.event, props: e.props });
  } catch {
    // ignore: medir es lo menos importante
  }
}
