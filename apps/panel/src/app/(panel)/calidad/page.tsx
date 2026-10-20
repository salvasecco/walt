import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gauge, Tags } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { RuleSuggestions } from "@/components/rule-suggestions";
import { StatTile } from "@/components/stat-tile";
import { CategoryChip, EmptyState, Notice, PageHeader, PanelTitle, SampleBadge, Surface } from "@/components/ui-walt";
import { NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { ms } from "@/lib/labels";
import { getLearningData, suggestionsFrom } from "@/lib/learning";
import type { Quality, Ratio } from "@/lib/quality";
import { getQualityView } from "@/lib/quality-data";
import { can } from "@/lib/roles";
import { getScope } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calidad" };

const PERIODS = [7, 30, 90] as const;

const pct = (r: Ratio | { value: number | null }) => (r.value == null ? "—" : `${Math.round(r.value * 100)}%`);
const money = (n: number | null, digits = 3) => (n == null ? "—" : `USD ${n.toFixed(digits)}`);

export default async function CalidadPage({ searchParams }: PageProps<"/calidad">) {
  const sp = await searchParams;
  const days = PERIODS.find((d) => String(d) === sp.dias) ?? 30;
  if (dataMode() === "sin_configurar") return <NotConfigured />;
  let view, learning;
  try {
    [view, learning] = await Promise.all([getQualityView(days), getLearningData()]);
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  const { viewer, projects } = await getScope();
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const suggestions = suggestionsFrom(learning).map(({ id, projectId, kind, text, count, requests }) => ({ id, projectId, kind, text, count, requests, projectName: names.get(projectId) }));
  const q = view.overall;
  const ready = view.labelsReady;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calidad"
        subtitle={`Qué tan bien clasifica Walt y cuánto resuelve solo, con los datos de tu agencia. Últimos ${days} días.`}
        right={
          <>
            {dataMode() === "ejemplo" && <SampleBadge />}
            <nav aria-label="Período" className="flex gap-0.5 rounded-lg border border-line bg-surface p-0.5">
              {PERIODS.map((d) => (
                <Link
                  key={d}
                  href={`/calidad?dias=${d}`}
                  aria-current={d === days ? "page" : undefined}
                  className={cn("rounded-md px-2.5 py-1 text-xs tnum transition-colors", d === days ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {d} días
                </Link>
              ))}
            </nav>
          </>
        }
      />
      {!ready && (
        <Notice tone="info" icon={<Tags />}>
          La precisión sale de los reetiquetados de la agencia, que llegan con la migración 0004. El resto ya se calcula con los datos de hoy.
        </Notice>
      )}
      {q.requests === 0 ? (
        <EmptyState icon={<Gauge className="size-5" />} title={`Sin pedidos en los últimos ${days} días`}>
          Las métricas aparecen con los primeros pedidos de tus clientes.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              label="Precisión"
              help="1 − reetiquetados / decididos. Decididos: simple, delicado, algo nuevo, consulta o bloqueado. Un reetiquetado es un pedido que la agencia cambió de tipo."
              value={ready ? pct(q.precision) : "—"}
              context={ready ? `${q.precision.num} reetiquetados de ${q.precision.den} decididos` : "Falta la migración 0004"}
            />
            <StatTile
              label="Aprobados al primer intento"
              help="Pedidos nuevos (no correcciones) cuya primera respuesta del cliente a la vista previa fue «Dale»."
              value={pct(q.firstTry)}
              context={q.firstTry.den ? `${q.firstTry.num} de ${q.firstTry.den} con vista previa` : "Sin respuestas del cliente"}
            />
            <StatTile
              label="«No era eso»"
              help="Respuestas «No era eso» sobre todas las respuestas del cliente a una vista previa."
              value={pct(q.notThat)}
              context={q.notThat.den ? `${q.notThat.num} de ${q.notThat.den} respuestas` : "Sin respuestas del cliente"}
            />
            <StatTile
              label="Tiempo hasta publicar"
              help="Mediana desde que llega el pedido hasta que se publica (evento publicado), con su percentil 90."
              value={q.publish.median == null ? "—" : ms(q.publish.median)}
              context={q.publish.count ? `p90 ${ms(q.publish.p90)} · ${q.publish.count} publicados` : "Nada publicado"}
            />
            <StatTile
              label="Costo por pedido"
              help="Costo de IA (cost_usd) de los pedidos del período, dividido por la cantidad de pedidos."
              value={money(q.cost.perRequest)}
              context={`${money(q.cost.total, 2)} en ${q.requests} pedidos`}
            />
            <StatTile
              label="Escalamientos"
              help="Pedidos delicados o derivados (los que tuvo que mirar una persona de la agencia) sobre los que tienen categoría."
              value={pct(q.escalations)}
              context={`${q.escalations.num} de ${q.escalations.den} · ${q.agencyRejections} ${q.agencyRejections === 1 ? "rechazo" : "rechazos"} de la agencia`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="flex flex-col gap-4 p-4 sm:p-5">
              <PanelTitle icon={<Tags />}>Reetiquetados</PanelTitle>
              {ready && q.simpleToDelicate > 0 && (
                <Notice tone="warn">
                  <span className="font-medium">El error caro:</span> {q.simpleToDelicate} {q.simpleToDelicate === 1 ? "pedido salió simple y era delicado" : "pedidos salieron simples y eran delicados"}. Las sugerencias de reglas apuntan a que no se repita.
                </Notice>
              )}
              {!ready ? (
                <p className="text-sm text-muted-foreground">Llegan con la migración 0004.</p>
              ) : q.transitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ningún pedido reetiquetado en el período. Se reetiqueta desde el detalle de cada pedido («¿Estuvo bien clasificado?»).</p>
              ) : (
                <ul className="flex flex-col">
                  {q.transitions.map((t) => (
                    <li key={`${t.from}-${t.to}`} className="flex items-center gap-2 border-b border-line py-2 text-sm last:border-0">
                      <CategoryChip category={t.from} />
                      <ArrowRight className="size-3.5 text-faint" />
                      <CategoryChip category={t.to} />
                      <span className="ml-auto text-muted-foreground tnum">×{t.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/historial" className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Ver los pedidos en Historial
              </Link>
            </Surface>
            <RuleSuggestions items={suggestions} canApply={can(viewer.role, "configurar")} ready={learning.ready} />
          </div>

          {view.perProject.length > 1 && <PerProject rows={view.perProject} ready={ready} />}
        </>
      )}
    </div>
  );
}

function PerProject({ rows, ready }: { rows: { project: { id: string; name: string }; quality: Quality }[]; ready: boolean }) {
  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-line px-5 py-3">
        <PanelTitle>Por proyecto</PanelTitle>
      </div>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="label-xs border-b border-line bg-surface-2">
            <tr>
              <th className="px-5 py-2.5 font-medium">Proyecto</th>
              <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
              <th className="px-3 py-2.5 text-right font-medium">Precisión</th>
              <th className="px-3 py-2.5 text-right font-medium">1.er intento</th>
              <th className="px-3 py-2.5 text-right font-medium">A publicado</th>
              <th className="px-3 py-2.5 text-right font-medium">Costo/pedido</th>
              <th className="px-5 py-2.5 text-right font-medium">Escalamientos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project, quality: q }) => (
              <tr key={project.id} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5">
                  <Link href={`/reglas?proyecto=${project.id}`} className="underline-offset-4 hover:underline">
                    {project.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tnum">{q.requests}</td>
                <td className="px-3 py-2.5 text-right tnum">{ready ? pct(q.precision) : "—"}</td>
                <td className="px-3 py-2.5 text-right tnum">{pct(q.firstTry)}</td>
                <td className="px-3 py-2.5 text-right tnum">{q.publish.median == null ? "—" : ms(q.publish.median)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs tnum">{money(q.cost.perRequest)}</td>
                <td className="px-5 py-2.5 text-right tnum">{pct(q.escalations)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
