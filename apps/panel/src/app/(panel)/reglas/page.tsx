import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { EmptyState, Glass, Mono, PageHeader, PanelTitle, SampleBadge } from "@/components/ui-dale";
import { getProjects, getRules, NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { DEFAULT_RULES } from "@/lib/sample";
import { dateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { RulesForm } from "./rules-form";

export const metadata: Metadata = { title: "Reglas" };

export default async function ReglasPage({ searchParams }: PageProps<"/reglas">) {
  const sp = await searchParams;
  let projects;
  try {
    projects = await getProjects();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  if (!projects.length)
    return (
      <EmptyState icon={<SlidersHorizontal className="size-5" />} title="No hay proyectos">
        Conectá un repo en Proyectos y después definí sus reglas acá.
      </EmptyState>
    );
  const project = projects.find((p) => p.id === sp.proyecto) ?? projects[0];
  const versions = await getRules(project.id);
  const current = versions[0];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reglas"
        subtitle="Qué se publica solo, qué pasa por la agencia y qué no se hace nunca. El worker lee la última versión en cada pedido."
        right={dataMode() === "ejemplo" && <SampleBadge />}
      />
      {projects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/reglas?proyecto=${p.id}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm",
                p.id === project.id ? "border-cyan-neon/50 bg-cyan-neon/10 text-cyan-neon" : "border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <RulesForm
          key={`${project.id}-${current?.version ?? 0}`}
          projectId={project.id}
          initial={current ? { policies: { ...DEFAULT_RULES.policies, ...current.policies }, limits: { ...DEFAULT_RULES.limits, ...current.limits } } : DEFAULT_RULES}
          version={current?.version ?? 0}
          since={current?.created_at ?? null}
        />
        <Glass className="self-start p-5">
          <PanelTitle>Versiones</PanelTitle>
          <ol className="mt-3 flex flex-col">
            {versions.length === 0 && <li className="text-sm text-muted-foreground">Sin versiones: se usan las reglas por defecto.</li>}
            {versions.map((v, i) => (
              <li key={v.id} className="flex items-center justify-between border-b border-white/[0.04] py-2 text-sm last:border-0">
                <span className={cn(i === 0 && "text-cyan-neon")}>
                  versión {v.version} {i === 0 && "· vigente"}
                </span>
                <Mono className="text-xs text-muted-foreground">
                  {dateTime(v.created_at)} · {v.created_by ?? "—"}
                </Mono>
              </li>
            ))}
          </ol>
        </Glass>
      </div>
    </div>
  );
}
