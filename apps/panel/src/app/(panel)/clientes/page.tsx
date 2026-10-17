import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { HealthBadge } from "@/components/health-badge";
import { NotConfigured } from "@/components/not-configured";
import { QuotaMeter } from "@/components/quota-meter";
import { Chip, EmptyState, Mono, Notice, PageHeader, SampleBadge, Surface } from "@/components/ui-dale";
import { getClientsOverview, type ClientsOverview } from "@/lib/agency";
import { NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { relative } from "@/lib/labels";

export const metadata: Metadata = { title: "Clientes" };

const GRID = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_150px_96px_110px_96px]";

export default async function ClientesPage() {
  let data: ClientsOverview;
  try {
    data = await getClientsOverview();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  const { rows, unlinked, clientsReady, now } = data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        subtitle="Plan, consumo del mes y cómo viene cada uno. Lo urgente arriba."
        right={dataMode() === "ejemplo" && <SampleBadge />}
      />
      {!clientsReady && (
        <Notice>
          Falta aplicar la migración <code className="font-mono">0003_clients.sql</code> en Supabase. Hasta entonces no hay clientes: los proyectos aparecen abajo.
        </Notice>
      )}
      {clientsReady && rows.length === 0 ? (
        <EmptyState icon={<Users />} title="Todavía no hay clientes">
          Corré <code className="font-mono">pnpm seed</code> para crear el de la panadería y dos de ejemplo.
        </EmptyState>
      ) : (
        rows.length > 0 && (
          <Surface className="overflow-hidden">
            <div className={`label-xs hidden gap-4 border-b border-line bg-surface-2 px-5 py-2.5 md:grid ${GRID}`}>
              <span>Cliente</span>
              <span>Proyectos</span>
              <span>Plan</span>
              <span>Cambios del mes</span>
              <span className="text-right">IA del mes</span>
              <span>Último pedido</span>
              <span>Salud</span>
            </div>
            <ul>
              {rows.map((r) => (
                <li key={r.client.id} className="relative border-b border-line last:border-0 hover:bg-white/[0.03]">
                  <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5 md:items-center ${GRID}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {/* El link cubre toda la fila; la salud queda por encima para su tooltip. */}
                        <Link href={`/clientes/${r.client.id}`} className="truncate text-sm font-medium after:absolute after:inset-0">
                          {r.client.name}
                        </Link>
                        {r.client.is_sample && <Chip className="h-4 px-1 text-[10px]">ejemplo</Chip>}
                      </div>
                      {r.client.contact_name && <div className="truncate text-xs text-muted-foreground">{r.client.contact_name}</div>}
                    </div>
                    <div className="relative z-10 col-start-2 row-start-1 justify-self-end md:hidden">
                      <HealthBadge health={r.health} />
                    </div>
                    <div className="col-span-2 truncate text-sm text-muted-foreground md:col-span-1">
                      {r.projects.length ? r.projects.map((p) => p.name).join(", ") : "Sin proyectos"}
                    </div>
                    <div className="min-w-0 text-sm">
                      <div className="truncate">{r.client.plan_name}</div>
                      <div className="text-xs text-muted-foreground tnum">USD {Number(r.client.monthly_fee_usd).toLocaleString("es-UY")}/mes</div>
                    </div>
                    <QuotaMeter used={r.usedThisMonth} quota={r.client.monthly_quota} />
                    <Mono className="text-xs text-muted-foreground md:text-right md:text-sm">USD {r.costThisMonth.toFixed(2)}</Mono>
                    <span className="text-xs text-muted-foreground tnum md:text-sm">{r.lastRequestAt ? relative(r.lastRequestAt, now) : "Hace más de 60 días"}</span>
                    <div className="relative z-10 hidden md:block">
                      <HealthBadge health={r.health} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Surface>
        )
      )}
      {unlinked.length > 0 && (
        <Surface className="p-5">
          <h2 className="label-xs">Proyectos sin cliente</h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {unlinked.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span>{p.name}</span>
                <span className="text-muted-foreground">· {p.client_name}</span>
                {p.is_sample && <Chip className="h-4 px-1 text-[10px]">ejemplo</Chip>}
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
