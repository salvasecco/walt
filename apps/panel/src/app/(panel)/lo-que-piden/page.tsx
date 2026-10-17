import type { Metadata } from "next";
import { BarChart3, Lightbulb, Repeat } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { StatTile } from "@/components/stat-tile";
import { EmptyState, Surface, PageHeader, PanelTitle, SampleBadge } from "@/components/ui-walt";
import { getInsightsData, NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { CATEGORY_LABEL, OP_LABEL, TZ } from "@/lib/labels";
import { CATEGORIES, OP_TYPES, type WaltRequest, type OpType, type Project } from "@/lib/types";
import { HBar } from "./charts";

export const metadata: Metadata = { title: "Lo que piden" };

const SUGGESTION: Partial<Record<OpType, (client: string, n: number) => string>> = {
  set_price: (c, n) => `${c} cambió precios ${n} veces: ofrecele un panel de precios.`,
  adjust_prices: (c, n) => `${c} ajustó precios en lote ${n} veces: ofrecele una lista de precios editable.`,
  set_availability: (c, n) => `${c} marcó productos sin stock ${n} veces: ofrecele un control de stock diario.`,
  set_banner: (c, n) => `${c} pidió ${n} carteles: ofrecele un calendario de promociones.`,
  set_hours: (c, n) => `${c} cambió horarios ${n} veces: ofrecele horarios especiales y feriados.`,
  set_text: (c, n) => `${c} cambió textos ${n} veces: quizás le sirve un editor de secciones.`,
};

function normalize(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+([.,]\d+)?/g, "#")
    .replace(/[^\w# ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function analyze(requests: WaltRequest[], projects: Project[]) {
  const byCat = CATEGORIES.map((c) => ({ name: CATEGORY_LABEL[c], value: requests.filter((r) => r.category === c).length })).filter((x) => x.value);
  const opCount = new Map<OpType, number>();
  const perProjectOp = new Map<string, number>();
  for (const r of requests) {
    const types = new Set((r.ops ?? r.interpretation?.ops ?? []).map((o) => o.type));
    for (const t of types) {
      opCount.set(t, (opCount.get(t) ?? 0) + 1);
      const k = `${r.project_id}|${t}`;
      perProjectOp.set(k, (perProjectOp.get(k) ?? 0) + 1);
    }
  }
  const byOp = OP_TYPES.map((t) => ({ name: OP_LABEL[t], value: opCount.get(t) ?? 0 })).filter((x) => x.value);
  const decided = requests.filter((r) => r.category);
  const auto = decided.filter((r) => r.category === "permitido" || r.category === "consulta" || r.category === "charla").length;
  const groups = new Map<string, WaltRequest[]>();
  for (const r of requests) {
    const k = `${r.project_id}|${normalize(r.raw_text)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const repeated = [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length).slice(0, 8);
  const suggestions = [...perProjectOp.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => {
      const [pid, t] = k.split("|") as [string, OpType];
      const client = projects.find((p) => p.id === pid)?.client_name ?? "Un cliente";
      return SUGGESTION[t]?.(client, n);
    })
    .filter((x): x is string => !!x)
    .slice(0, 5);
  const outOfScope = requests.filter((r) => r.category === "fuera_de_alcance");
  // Pedidos por día, últimos 30 días (día en America/Montevideo).
  const day = (t: number | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(t));
  const perDay = new Map<string, number>();
  for (const r of requests) perDay.set(day(r.created_at), (perDay.get(day(r.created_at)) ?? 0) + 1);
  const now = Date.now();
  const daily = Array.from({ length: 30 }, (_, i) => perDay.get(day(now - (29 - i) * 86_400_000)) ?? 0);
  return { byCat, byOp, daily, autoPct: decided.length ? Math.round((auto / decided.length) * 100) : 0, decided: decided.length, auto, repeated, suggestions, outOfScope };
}

export default async function LoQuePidenPage() {
  let data;
  try {
    data = await getInsightsData(30);
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  const { requests, projects } = data;
  const a = analyze(requests, projects);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Lo que piden" subtitle="Últimos 30 días. Qué piden tus clientes y qué podrías venderles." right={dataMode() === "ejemplo" && <SampleBadge />} />
      {requests.length === 0 ? (
        <EmptyState icon={<BarChart3 className="size-5" />} title="Todavía no hay pedidos para analizar" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatTile
              label="Resuelto automático"
              help="Pedidos con categoría permitido, consulta o charla, sobre los que tienen categoría."
              value={`${a.autoPct}%`}
              context={`${a.auto} de ${a.decided} sin intervención de la agencia`}
            />
            <StatTile
              label="Pedidos"
              value={requests.length}
              context={`En ${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}`}
              trend={a.daily}
              trendLabel="Pedidos por día, últimos 30 días"
            />
            <StatTile
              label="Funciones nuevas pedidas"
              help="Pedidos fuera de alcance: los que terminan en presupuesto."
              value={a.outOfScope.length}
              context={a.outOfScope.map((r) => r.raw_text).join(" · ") || "Ninguna"}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="p-4 sm:p-5">
              <PanelTitle>Pedidos por categoría</PanelTitle>
              <HBar data={a.byCat} unit="pedidos" />
            </Surface>
            <Surface className="p-4 sm:p-5">
              <PanelTitle>Pedidos por tipo de cambio</PanelTitle>
              {a.byOp.length ? <HBar data={a.byOp} unit="pedidos" /> : <p className="mt-4 text-sm text-muted-foreground">Sin operaciones todavía.</p>}
            </Surface>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="p-4 sm:p-5">
              <PanelTitle icon={<Lightbulb />}>Sugerencias</PanelTitle>
              <ul className="mt-3 flex flex-col gap-2">
                {a.suggestions.length === 0 && <li className="text-sm text-muted-foreground">Todavía no hay patrones claros. Aparecen cuando un cliente repite un tipo de cambio 3 veces o más.</li>}
                {a.suggestions.map((s) => (
                  <li key={s} className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm">
                    {s}
                  </li>
                ))}
              </ul>
            </Surface>
            <Surface className="p-4 sm:p-5">
              <PanelTitle icon={<Repeat />}>Pedidos repetidos</PanelTitle>
              <ul className="mt-3 flex flex-col gap-2">
                {a.repeated.length === 0 && <li className="text-sm text-muted-foreground">Ningún pedido se repitió igual.</li>}
                {a.repeated.map((g) => (
                  <li key={g[0].id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm">
                    <span className="truncate">“{g[0].raw_text}”</span>
                    <span className="shrink-0 text-muted-foreground tnum">×{g.length}</span>
                  </li>
                ))}
              </ul>
            </Surface>
          </div>
          <details className="rounded-xl border border-line bg-surface p-5 text-sm">
            <summary className="label-xs cursor-pointer">Ver como tabla</summary>
            <table className="mt-3 w-full text-left">
              <tbody>
                {[...a.byCat, ...a.byOp].map((r) => (
                  <tr key={r.name} className="border-b border-line last:border-0">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right tnum">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
