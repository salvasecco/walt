"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authRealtime, supabaseBrowser, type RealtimeConfig } from "@/lib/supabase/browser";

const TABLES = ["requests", "quotes", "content_versions", "projects", "clients"] as const;

/**
 * Vuelve a pedir los datos del servidor cuando cambia algo en la base (realtime con la sesión del usuario o, sin
 * la migración 0004, con la clave anon).
 * Así el contador "Te necesita" del menú y el tablero de Atención se mueven solos.
 * Agrupa los cambios: un pedido que avanza varios pasos seguidos refresca una sola vez.
 */
export function LiveRefresh({ supabase, delayMs = 700 }: { supabase: RealtimeConfig | null; delayMs?: number }) {
  const router = useRouter();
  const url = supabase?.url;
  const anonKey = supabase?.anonKey;
  const auth = supabase?.auth ?? "anon";
  useEffect(() => {
    if (!url || !anonKey) return;
    const cfg = { url, anonKey, auth };
    const db = supabaseBrowser(cfg);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, delayMs);
    };
    let channel = db.channel("panel-atencion");
    for (const table of TABLES) channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    let cancelled = false;
    void authRealtime(db, cfg).then(() => {
      if (!cancelled) channel.subscribe();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [url, anonKey, auth, delayMs, router]);
  return null;
}
