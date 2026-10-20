import { LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/auth-actions";
import { AgencySwitcher } from "@/components/agency-switcher";
import { Logo } from "@/components/logo";
import { LiveRefresh } from "@/components/live-refresh";
import { Nav } from "@/components/nav";
import { SampleBadge } from "@/components/ui-walt";
import { getNeedCount } from "@/lib/agency";
import { dataMode, publicSupabase } from "@/lib/env";
import { ROLE_LABEL } from "@/lib/roles";
import { buildSample } from "@/lib/sample";
import { agencyNameOf, getScope, inScope, type Scope } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { AGENCY_WAIT_STATUSES, categoryVariants, isPendingAgency } from "@/lib/taxonomy";

// Datos en vivo: nunca se prerenderiza.
export const dynamic = "force-dynamic";

async function pendingCount(scope: Scope): Promise<number> {
  const mode = dataMode();
  if (mode === "ejemplo") return buildSample().requests.filter(isPendingAgency).length;
  if (mode === "sin_configurar") return 0;
  try {
    const q = supabaseAdmin()
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", [...AGENCY_WAIT_STATUSES])
      .in("category", categoryVariants("delicado"));
    const { count } = await inScope(q, scope);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const mode = dataMode();
  const scope = await getScope();
  const { viewer } = scope;
  const [pending, need] = await Promise.all([pendingCount(scope), getNeedCount()]);
  const badges = { "/atencion": need, "/aprobaciones": pending };
  const canLogout = viewer.kind !== "open";
  const supabase = publicSupabase();
  // Con usuarios, el realtime va con la sesión de cada uno (RLS de la 0004); antes, con la clave anon como hasta ahora.
  const realtime = supabase && { ...supabase, auth: viewer.kind === "user" ? ("user" as const) : ("anon" as const) };
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {mode === "supabase" && <LiveRefresh supabase={realtime} />}
      <div className="hidden border-r border-line bg-sidebar lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-7 px-3 py-5">
          <Logo className="px-2" />
          <Nav variant="side" badges={badges} />
          <div className="mt-auto flex flex-col gap-3 border-t border-line px-2 pt-4">
            {mode === "ejemplo" && <SampleBadge className="self-start" />}
            {viewer.memberships.length > 1 ? (
              <AgencySwitcher current={viewer.factory?.id ?? ""} options={viewer.memberships.map((m) => ({ id: m.factory_id, name: m.factory.name }))} />
            ) : (
              <div className="text-[11px] text-muted-foreground">
                Agencia
                <div className="mt-0.5 truncate text-sm font-medium text-foreground">{agencyNameOf(viewer)}</div>
              </div>
            )}
            {viewer.kind === "user" && (
              <div className="min-w-0 text-[11px] text-muted-foreground">
                <div className="truncate text-foreground/85" title={viewer.email ?? undefined}>
                  {viewer.email}
                </div>
                {ROLE_LABEL[viewer.role]}
              </div>
            )}
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
          <div className="flex items-center justify-between gap-3">
            <Logo />
            <div className="flex min-w-0 items-center gap-2">
              {mode === "ejemplo" && <SampleBadge />}
              {viewer.memberships.length > 1 && (
                <AgencySwitcher compact current={viewer.factory?.id ?? ""} options={viewer.memberships.map((m) => ({ id: m.factory_id, name: m.factory.name }))} />
              )}
            </div>
          </div>
          <Nav variant="top" badges={badges} />
        </header>
        {viewer.tenancy === "legacy" && (
          <div className="border-b border-line bg-surface px-4 py-2 text-xs text-muted-foreground sm:px-6 lg:px-8">
            Modo de una sola agencia con la contraseña del panel: los usuarios, roles y la separación por agencia llegan al aplicar la migración 0004.
          </div>
        )}
        {viewer.emergency && (
          <div className="border-b border-warn/25 bg-warn/10 px-4 py-2 text-xs text-foreground/90 sm:px-6 lg:px-8">
            Acceso de emergencia: la base ya es multi-agencia y todavía no hay usuarios.{" "}
            <Link href="/equipo" className="underline underline-offset-4">
              Creá el dueño de la agencia
            </Link>{" "}
            y entrá con su mail.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
