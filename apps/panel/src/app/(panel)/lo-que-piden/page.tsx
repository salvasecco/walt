import type { Metadata } from "next";
import { BarChart3, Lightbulb, Repeat } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { EmptyState, Glass, Mono, PageHeader, PanelTitle, SampleBadge } from "@/components/ui-dale";
import { getInsightsData, NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { CATEGORY_LABEL, OP_LABEL } from "@/lib/labels";
import { CATEGORIES, OP_TYPES, type DaleRequest, type OpType, type Project } from "@/lib/types";
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

function analyze(requests: DaleRequest[], projects: Project[]) {
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
  const groups = new Map<string, DaleRequest[]>();
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
  return { byCat, byOp, autoPct: decided.length ? Math.round((auto / decided.length) * 100) : 0, decided: decided.length, auto, repeated, suggestions, outOfScope };
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
            <Glass className="p-5">
              <div className="label-xs">Resuelto automático</div>
              <div className="mt-2 font-mono text-5xl font-semibold text-emerald-neon tnum">{a.autoPct}%</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {a.auto} de {a.decided} pedidos sin intervención de la agencia
              </p>
            </Glass>
            <Glass className="p-5">
              <div className="label-xs">Pedidos</div>
              <div className="mt-2 font-mono text-5xl font-semibold tnum">{requests.length}</div>
              <p className="mt-1 text-sm text-muted-foreground">en {projects.length} proyectos</p>
            </Glass>
            <Glass className="p-5">
              <div className="label-xs">Funciones nuevas pedidas</div>
              <div className="mt-2 font-mono text-5xl font-semibold text-violet-neon tnum">{a.outOfScope.length}</div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.outOfScope.map((r) => r.raw_text).join(" · ") || "Ninguna"}</p>
            </Glass>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Glass className="p-5">
              <PanelTitle>Pedidos por categoría</PanelTitle>
              <HBar data={a.byCat} unit="pedidos" />
            </Glass>
            <Glass className="p-5">
              <PanelTitle>Pedidos por tipo de cambio</PanelTitle>
              {a.byOp.length ? <HBar data={a.byOp} unit="pedidos" /> : <p className="mt-4 text-sm text-muted-foreground">Sin operaciones todavía.</p>}
            </Glass>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Glass className="p-5">
              <PanelTitle icon={<Lightbulb className="size-3.5 text-amber-neon" />}>Sugerencias</PanelTitle>
              <ul className="mt-3 flex flex-col gap-2">
                {a.suggestions.length === 0 && <li className="text-sm text-muted-foreground">Todavía no hay patrones claros. Aparecen cuando un cliente repite un tipo de cambio 3 veces o más.</li>}
                {a.suggestions.map((s) => (
                  <li key={s} className="rounded-xl border border-amber-neon/25 bg-amber-neon/5 px-4 py-3 text-base">
                    {s}
                  </li>
                ))}
              </ul>
            </Glass>
            <Glass className="p-5">
              <PanelTitle icon={<Repeat className="size-3.5 text-cyan-neon" />}>Pedidos repetidos</PanelTitle>
              <ul className="mt-3 flex flex-col gap-2">
                {a.repeated.length === 0 && <li className="text-sm text-muted-foreground">Ningún pedido se repitió igual.</li>}
                {a.repeated.map((g) => (
                  <li key={g[0].id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-4 py-2.5 text-sm">
                    <span className="truncate">“{g[0].raw_text}”</span>
                    <Mono className="shrink-0 text-cyan-neon">×{g.length}</Mono>
                  </li>
                ))}
              </ul>
            </Glass>
          </div>
          <details className="glass rounded-2xl p-5 text-sm">
            <summary className="label-xs cursor-pointer">Ver como tabla</summary>
            <table className="mt-3 w-full text-left">
              <tbody>
                {[...a.byCat, ...a.byOp].map((r) => (
                  <tr key={r.name} className="border-b border-white/[0.04]">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right font-mono tnum">{r.value}</td>
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
