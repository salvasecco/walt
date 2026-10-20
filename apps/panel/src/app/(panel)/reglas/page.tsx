import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { RuleSuggestions } from "@/components/rule-suggestions";
import { EmptyState, PageHeader, SampleBadge } from "@/components/ui-walt";
import { getProjects, NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { can, ROLE_LABEL } from "@/lib/roles";
import { getLearningData, suggestionsFrom } from "@/lib/learning";
import { getRulesView } from "@/lib/rules";
import { getScope } from "@/lib/session";
import { cn } from "@/lib/utils";
import { RulesWorkbench } from "./workbench";

export const metadata: Metadata = { title: "Reglas" };
// El simulador llama al modelo (hasta ~45 s): las acciones de esta pantalla necesitan más que el default.
export const maxDuration = 60;

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
  const [view, { viewer }, learning] = await Promise.all([getRulesView(project.id), getScope(), getLearningData([project.id])]);
  const suggestions = suggestionsFrom(learning);
  const canEdit = can(viewer.role, "configurar");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reglas"
        subtitle="Qué es simple, qué es delicado y qué es algo nuevo en cada proyecto. El worker lee la última versión en cada pedido."
        right={dataMode() === "ejemplo" && <SampleBadge />}
      />
      {projects.length > 1 && (
        <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-1 rounded-lg border border-line bg-surface p-1" role="tablist" aria-label="Proyecto">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/reglas?proyecto=${p.id}`}
                role="tab"
                aria-selected={p.id === project.id}
                className={cn(
                  "rounded-md px-3 py-1 text-sm whitespace-nowrap transition-colors",
                  p.id === project.id ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}
      <RulesWorkbench
        key={`${project.id}-${view.versions[0]?.version ?? 0}`}
        project={{ id: project.id, name: project.name, mode: project.mode }}
        initial={view.current}
        versions={view.versions.map((v) => ({ id: v.id, version: v.version, created_at: v.created_at, created_by: v.created_by, editable: v.editable }))}
        templates={view.templates}
        alwaysDelicate={view.alwaysDelicate}
        structured={view.structured}
        canEdit={canEdit}
        roleLabel={ROLE_LABEL[viewer.role]}
        aside={
          <RuleSuggestions
            items={suggestions.map(({ id, projectId, kind, text, count, requests }) => ({ id, projectId, kind, text, count, requests }))}
            canApply={canEdit}
            ready={learning.ready}
          />
        }
      />
    </div>
  );
}
