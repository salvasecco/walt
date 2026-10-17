import type { Metadata } from "next";
import { FolderGit2, Globe, GitBranch } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { Chip, EmptyState, Surface, Mono, PageHeader, SampleBadge } from "@/components/ui-walt";
import { getProjects, NotConfiguredError } from "@/lib/data";
import { dataMode, env } from "@/lib/env";
import { dateTime } from "@/lib/labels";
import { SEED_PROJECT_ID, type Project } from "@/lib/types";
import { ConnectRepo, InviteButton } from "./project-client";

const siteOf = (p: Project) => p.site_url || (p.id === SEED_PROJECT_ID ? env.demoSiteUrl : "");

export const metadata: Metadata = { title: "Proyectos" };

export default async function ProyectosPage() {
  let projects;
  try {
    projects = await getProjects();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Proyectos" subtitle="Cada web de un cliente es un proyecto conectado a su repo." right={dataMode() === "ejemplo" && <SampleBadge />} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex flex-col gap-3">
          {projects.length === 0 && (
            <EmptyState icon={<FolderGit2 className="size-5" />} title="Todavía no hay proyectos">
              Conectá el repo de la web de un cliente para empezar.
            </EmptyState>
          )}
          {projects.map((p) => (
            <Surface key={p.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{p.name}</h2>
                  <Chip tone={p.mode === "contenido" ? "muted" : "code"}>
                    Modo {p.mode === "contenido" ? "contenido" : "código"}
                  </Chip>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span>Cliente: {p.client_name}</span>
                  <a href={`https://github.com/${p.repo_owner}/${p.repo_name}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                    <GitBranch className="size-3.5" />
                    <Mono>
                      {p.repo_owner}/{p.repo_name}@{p.default_branch}
                    </Mono>
                  </a>
                  {siteOf(p) && (
                    <a href={siteOf(p)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                      <Globe className="size-3.5" />
                      {siteOf(p).replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  <span>Desde {dateTime(p.created_at)}</span>
                </div>
              </div>
              <InviteButton projectId={p.id} projectName={p.name} />
            </Surface>
          ))}
        </div>
        <ConnectRepo hasToken={!!env.githubToken} />
      </div>
    </div>
  );
}
