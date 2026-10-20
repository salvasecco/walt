import type { Metadata } from "next";
import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { StatTile } from "@/components/stat-tile";
import { CategoryChip, EmptyState, Mono, Notice, PageHeader, PanelTitle, SampleBadge, Surface } from "@/components/ui-walt";
import { getAiView } from "@/lib/ai";
import { dataMode } from "@/lib/env";
import { dateTime } from "@/lib/labels";
import { can } from "@/lib/roles";
import { getScope } from "@/lib/session";
import { AgencyMode, ProjectModes } from "./ai-client";

export const metadata: Metadata = { title: "IA y costos" };

const usd = (n: number | null, digits = 3) => (n == null ? "—" : `USD ${n.toFixed(digits)}`);

export default async function IaPage() {
  if (dataMode() === "sin_configurar") return <NotConfigured />;
  const [view, { viewer }] = await Promise.all([getAiView(), getScope()]);
  const canEdit = can(viewer.role, "configurar");
  const names = new Map(view.projects.map((p) => [p.project.id, p.project.name]));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="IA y costos"
        subtitle="Cómo paga la IA tu agencia, con excepciones por proyecto, y cuánto cuesta cada pedido."
        right={dataMode() === "ejemplo" && <SampleBadge />}
      />
      {!view.ready && (
        <Notice tone="info" icon={<BrainCircuit />}>
          Elegir el modo de IA necesita la migración 0004 (ai_settings, billetera y movimientos). Mientras tanto la IA la pone Walt y el costo de cada pedido ya se ve abajo.
        </Notice>
      )}

      <AgencyMode agency={view.agency} wallet={view.wallet} movements={view.movements} canEdit={canEdit && view.ready} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Gasto del mes" help="Suma del costo de IA (cost_usd) de los pedidos de este mes, hora de Montevideo." value={usd(view.month.cost, 2)} context={`Desde el ${dateTime(view.month.since)}`} />
        <StatTile
          label="Costo por pedido"
          help="Gasto de IA del mes dividido por los pedidos del mes."
          value={usd(view.month.perRequest)}
          context={view.month.requests ? `${view.month.requests} pedidos este mes` : "Sin pedidos este mes"}
        />
        <StatTile
          label="Modo de la agencia"
          help="Sin modo elegido, la IA la pone Walt. Cada proyecto puede usar otro."
          value={<span className="text-xl sm:text-2xl">{view.agency ? { byok: "Tu clave", credits: "Créditos", claude_code: "Claude Code" }[view.agency.mode] : "Clave de Walt"}</span>}
          context={`${view.projects.filter((p) => p.setting).length} ${view.projects.filter((p) => p.setting).length === 1 ? "proyecto con excepción" : "proyectos con excepción"}`}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Surface className="self-start overflow-hidden">
          <div className="border-b border-line px-5 py-3">
            <PanelTitle>Por proyecto</PanelTitle>
          </div>
          {view.projects.length === 0 ? (
            <EmptyState className="m-5" title="Todavía no hay proyectos" />
          ) : (
            <ProjectModes
              rows={view.projects.map((p) => ({
                id: p.project.id,
                name: p.project.name,
                setting: p.setting,
                effective: p.effective,
                month: p.month,
              }))}
              agencyMode={view.agency?.mode ?? "platform"}
              agencyHasKey={!!view.agency?.hasKey}
              canEdit={canEdit && view.ready}
            />
          )}
        </Surface>

        <Surface className="self-start overflow-hidden">
          <div className="border-b border-line px-5 py-3">
            <PanelTitle right={<span className="text-xs text-muted-foreground">este mes</span>}>Costo de cada pedido</PanelTitle>
          </div>
          {view.recent.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Sin pedidos con costo este mes.</p>
          ) : (
            <ul>
              {view.recent.map((r) => (
                <li key={r.id} className="border-b border-line last:border-0">
                  <Link href={`/historial/${r.short_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-2.5 transition-colors hover:bg-white/[0.03]">
                    <span className="min-w-0">
                      <span className="line-clamp-1 text-sm">{r.raw_text}</span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {names.get(r.project_id)} · {dateTime(r.created_at)}
                        {r.model ? ` · ${r.model}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <CategoryChip category={r.category} className="hidden sm:inline-flex" />
                      <Mono className="text-xs">{usd(r.cost_usd, 4)}</Mono>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
    </div>
  );
}
