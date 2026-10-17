"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, CheckCheck, FolderGit2, History, type LucideIcon, Receipt, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: "/" | "/aprobaciones" | "/historial" | "/proyectos" | "/reglas" | "/lo-que-piden" | "/presupuestos"; label: string; icon: LucideIcon };

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operación",
    items: [
      { href: "/", label: "En vivo", icon: Activity },
      { href: "/aprobaciones", label: "Aprobaciones", icon: CheckCheck },
      { href: "/historial", label: "Historial", icon: History },
    ],
  },
  {
    title: "Configuración",
    items: [
      { href: "/proyectos", label: "Proyectos", icon: FolderGit2 },
      { href: "/reglas", label: "Reglas", icon: SlidersHorizontal },
    ],
  },
  {
    title: "Negocio",
    items: [
      { href: "/lo-que-piden", label: "Lo que piden", icon: BarChart3 },
      { href: "/presupuestos", label: "Presupuestos", icon: Receipt },
    ],
  },
];

export const NAV = NAV_SECTIONS.flatMap((s) => s.items);

function Count({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md border border-warn/30 bg-warn/10 px-1 text-[11px] font-medium text-warn tnum", className)}>
      {n}
    </span>
  );
}

export function Nav({ badges = {}, variant }: { badges?: Record<string, number>; variant: "side" | "top" }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  if (variant === "top")
    return (
      <nav className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4" aria-label="Pantallas">
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors",
              active(href) ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {!!badges[href] && <Count n={badges[href]} />}
          </Link>
        ))}
      </nav>
    );
  return (
    <nav className="flex flex-col gap-5" aria-label="Pantallas">
      {NAV_SECTIONS.map((s) => (
        <div key={s.title} className="flex flex-col gap-0.5">
          <div className="px-2 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">{s.title}</div>
          {s.items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                active(href) ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="flex-1 truncate">{label}</span>
              {!!badges[href] && <Count n={badges[href]} />}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
