"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, CheckCheck, FolderGit2, History, Receipt, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "En vivo", icon: Activity },
  { href: "/aprobaciones", label: "Aprobaciones", icon: CheckCheck },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/proyectos", label: "Proyectos", icon: FolderGit2 },
  { href: "/reglas", label: "Reglas", icon: SlidersHorizontal },
  { href: "/lo-que-piden", label: "Lo que piden", icon: BarChart3 },
  { href: "/presupuestos", label: "Presupuestos", icon: Receipt },
] as const;

export function Nav({ badges = {}, variant }: { badges?: Record<string, number>; variant: "side" | "top" }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  if (variant === "top")
    return (
      <nav className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 pb-1" aria-label="Pantallas">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
              active(href) ? "border-cyan-neon/50 bg-cyan-neon/10 text-cyan-neon" : "border-white/10 text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
            {!!badges[href] && <span className="rounded-full bg-amber-neon px-1.5 font-mono text-[10px] font-bold text-black">{badges[href]}</span>}
          </Link>
        ))}
      </nav>
    );
  return (
    <nav className="flex flex-col gap-1" aria-label="Pantallas">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
            active(href) ? "bg-cyan-neon/10 text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
          )}
        >
          {active(href) && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-cyan-neon shadow-[0_0_12px_rgba(34,211,238,0.9)]" />}
          <Icon className={cn("size-[18px]", active(href) && "text-cyan-neon")} />
          <span className="flex-1">{label}</span>
          {!!badges[href] && (
            <span className="rounded-full bg-amber-neon/90 px-2 py-0.5 font-mono text-[11px] font-bold text-black tnum">{badges[href]}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
