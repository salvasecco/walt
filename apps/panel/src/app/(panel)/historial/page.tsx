import type { Metadata } from "next";
import Link from "next/link";
import { History, Search } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { CategoryChip, EmptyState, Glass, Mono, PageHeader, SampleBadge, StatusChip } from "@/components/ui-dale";
import { getRequests, NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { CATEGORY_LABEL, STATUS_LABEL, dateTime } from "@/lib/labels";
import { CATEGORIES, STATUSES, type Category, type RequestStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Historial" };

const selectCls = "h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground outline-none focus:border-cyan-neon/60";

export default async function HistorialPage({ searchParams }: PageProps<"/historial">) {
  const sp = await searchParams;
  const category = typeof sp.categoria === "string" && (CATEGORIES as readonly string[]).includes(sp.categoria) ? (sp.categoria as Category) : undefined;
  const status = typeof sp.estado === "string" && (STATUSES as readonly string[]).includes(sp.estado) ? (sp.estado as RequestStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  let data;
  try {
    data = await getRequests({ category, status, q });
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  const { rows, projects } = data;
  const filtered = !!(category || status || q);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Historial" subtitle="Todos los pedidos, con su recorrido completo." right={dataMode() === "ejemplo" && <SampleBadge />} />
      <form className="flex flex-wrap items-center gap-2" role="search">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Buscar texto o #id" className={`${selectCls} w-full pl-9`} />
        </div>
        <select name="categoria" defaultValue={category ?? ""} className={selectCls} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={status ?? ""} className={selectCls} aria-label="Estado">
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-xl bg-cyan-neon px-4 text-sm font-medium text-[#031016]">Filtrar</button>
        {filtered && (
          <Link href="/historial" className="px-2 text-sm text-muted-foreground hover:text-foreground">
            Limpiar
          </Link>
        )}
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title={filtered ? "Ningún pedido con esos filtros" : "Todavía no hay pedidos"}>
          {filtered ? "Probá con otros filtros." : "Cuando un cliente escriba por Telegram, el pedido queda acá."}
        </EmptyState>
      ) : (
        <Glass className="overflow-hidden">
          <div className="hidden grid-cols-[90px_minmax(0,1fr)_150px_170px_130px_90px] gap-4 border-b border-white/[0.06] px-5 py-3 label-xs md:grid">
            <span>Pedido</span>
            <span>Texto</span>
            <span>Categoría</span>
            <span>Estado</span>
            <span>Cuándo</span>
            <span className="text-right">Costo</span>
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="border-b border-white/[0.04] last:border-0">
                <Link
                  href={`/historial/${r.short_id}`}
                  className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-white/[0.03] md:grid-cols-[90px_minmax(0,1fr)_150px_170px_130px_90px] md:items-center"
                >
                  <Mono className="text-sm text-cyan-neon">#{r.short_id}</Mono>
                  <span className="col-span-2 min-w-0 md:col-span-1">
                    <span className="line-clamp-1 text-sm">{r.raw_text}</span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {projects.find((p) => p.id === r.project_id)?.name} {r.interpretation?.summary ? `· ${r.interpretation.summary}` : ""}
                    </span>
                  </span>
                  <span className="col-start-2 row-start-1 justify-self-end md:col-auto md:row-auto md:justify-self-start">
                    <CategoryChip category={r.category} />
                  </span>
                  <span>
                    <StatusChip status={r.status} />
                  </span>
                  <Mono className="text-xs text-muted-foreground md:text-sm">{dateTime(r.created_at)}</Mono>
                  <Mono className="hidden text-right text-sm text-muted-foreground md:block">${Number(r.cost_usd ?? 0).toFixed(3)}</Mono>
                </Link>
              </li>
            ))}
          </ul>
        </Glass>
      )}
    </div>
  );
}
