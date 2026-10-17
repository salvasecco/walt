"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const TABLES = ["requests", "quotes", "content_versions", "projects", "clients"] as const;

/**
 * Vuelve a pedir los datos del servidor cuando cambia algo en la base (realtime con la clave anon).
 * Así el contador "Te necesita" del menú y el tablero de Atención se mueven solos.
 * Agrupa los cambios: un pedido que avanza varios pasos seguidos refresca una sola vez.
 */
export function LiveRefresh({ supabase, delayMs = 700 }: { supabase: { url: string; anonKey: string } | null; delayMs?: number }) {
  const router = useRouter();
  const url = supabase?.url;
  const anonKey = supabase?.anonKey;
  useEffect(() => {
    if (!url || !anonKey) return;
    const db = supabaseBrowser(url, anonKey);
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
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [url, anonKey, delayMs, router]);
  return null;
}
