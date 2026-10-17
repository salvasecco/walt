import { LogOut } from "lucide-react";
import { logout } from "@/app/actions";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { SampleBadge } from "@/components/ui-dale";
import { authMode } from "@/lib/auth";
import { dataMode, env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSample } from "@/lib/sample";

// Datos en vivo: nunca se prerenderiza.
export const dynamic = "force-dynamic";

async function pendingCount(): Promise<number> {
  const mode = dataMode();
  if (mode === "ejemplo") return buildSample().requests.filter((r) => r.status === "esperando_agencia" || r.status === "agente_listo").length;
  if (mode === "sin_configurar") return 0;
  try {
    const { count } = await supabaseAdmin()
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["esperando_agencia", "agente_listo"]);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const mode = dataMode();
  const pending = await pendingCount();
  const badges = { "/aprobaciones": pending };
  const canLogout = authMode() === "password";
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <div className="hidden border-r border-line bg-sidebar lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-7 px-3 py-5">
          <Logo className="px-2" />
          <Nav variant="side" badges={badges} />
          <div className="mt-auto flex flex-col gap-3 border-t border-line px-2 pt-4">
            {mode === "ejemplo" && <SampleBadge className="self-start" />}
            <div className="text-[11px] text-muted-foreground">
              Agencia
              <div className="mt-0.5 truncate text-sm font-medium text-foreground">{env.agencyName}</div>
            </div>
            {canLogout && (
              <form action={logout}>
                <button className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                  <LogOut className="size-3.5" /> Salir
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex flex-col gap-3 border-b border-line bg-background px-4 pt-3 pb-2 lg:hidden">
          <div className="flex items-center justify-between">
            <Logo />
            {mode === "ejemplo" && <SampleBadge />}
          </div>
          <Nav variant="top" badges={badges} />
        </header>
        <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
