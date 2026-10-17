import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck, ExternalLink, GitPullRequest, Eye } from "lucide-react";
import { CommandButton } from "@/components/command-button";
import { NotConfigured } from "@/components/not-configured";
import { PreviewFrame } from "@/components/preview-frame";
import { ChangesDiff, GateReasons, OpsList } from "@/components/request-parts";
import { CategoryChip, Chip, EmptyState, Glass, Mono, PageHeader, PanelTitle, SampleBadge, StatusChip } from "@/components/ui-dale";
import { getPendingApprovals, NotConfiguredError } from "@/lib/data";
import { dataMode, env } from "@/lib/env";
import { relative } from "@/lib/labels";
import { SEED_PROJECT_ID } from "@/lib/types";

export const metadata: Metadata = { title: "Aprobaciones" };

export default async function AprobacionesPage() {
  let items;
  try {
    items = await getPendingApprovals();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  const sample = dataMode() === "ejemplo";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Aprobaciones" subtitle="Lo que las reglas mandan a la agencia. Aprobar publica; rechazar le avisa al cliente." right={sample && <SampleBadge />} />
      {items.length === 0 ? (
        <EmptyState icon={<CheckCheck className="size-5" />} title="Nada esperando">
          Cuando un pedido necesite tu visto bueno, aparece acá y en tu Telegram.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {items.map(({ request: r, project, liveVersion, screenshot }) => {
            const code = r.lane === "codigo";
            const agentReady = r.status === "agente_listo";
            return (
              <Glass key={r.id} hi className="grid gap-6 p-5 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
                <PreviewFrame
                  request={r}
                  siteUrl={project?.site_url || (r.project_id === SEED_PROJECT_ID ? env.demoSiteUrl : "") || null}
                  liveVersion={liveVersion}
                  screenshot={screenshot}
                  sample={sample}
                  className="h-[420px] md:h-[460px]"
                />
                <div className="flex min-w-0 flex-col gap-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/historial/${r.short_id}`}>
                        <Mono className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-sm text-cyan-neon">#{r.short_id}</Mono>
                      </Link>
                      <CategoryChip category={r.category} />
                      <StatusChip status={r.status} />
                      {code && <Chip tone="violet">Carril de código</Chip>}
                      <span className="text-sm text-muted-foreground">
                        {project?.client_name ?? "Cliente"} · {relative(r.created_at)}
                      </span>
                    </div>
                    <p className="mt-3 text-xl font-medium">“{r.raw_text}”</p>
                    {r.interpretation?.summary && <p className="mt-1 text-violet-neon">{r.interpretation.summary}</p>}
                  </div>
                  <section>
                    <PanelTitle>Por qué lo tenés que aprobar</PanelTitle>
                    <div className="mt-2">
                      <GateReasons request={r} />
                    </div>
                  </section>
                  {!!(r.ops ?? r.interpretation?.ops)?.length && (
                    <section>
                      <PanelTitle>Lo que va a hacer</PanelTitle>
                      <div className="mt-2">
                        <OpsList request={r} content={liveVersion?.content} />
                      </div>
                    </section>
                  )}
                  {!!r.changes?.length && (
                    <section>
                      <PanelTitle>Antes y después</PanelTitle>
                      <div className="mt-2">
                        <ChangesDiff changes={r.changes} content={liveVersion?.content} />
                      </div>
                    </section>
                  )}
                  {code && (
                    <section className="flex flex-wrap gap-3">
                      {r.interpretation?.codeInstruction && (
                        <p className="w-full rounded-xl border border-violet-neon/20 bg-violet-neon/5 p-3 text-sm">
                          <span className="label-xs mb-1 block text-violet-neon">Ficha para el agente</span>
                          {r.interpretation.codeInstruction}
                        </p>
                      )}
                      {r.pr_url && (
                        <a href={r.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-neon hover:underline">
                          <GitPullRequest className="size-4" /> Ver PR #{r.pr_number} <ExternalLink className="size-3" />
                        </a>
                      )}
                      {r.preview_url && (
                        <a href={r.preview_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-neon hover:underline">
                          <Eye className="size-4" /> Ver vista previa <ExternalLink className="size-3" />
                        </a>
                      )}
                    </section>
                  )}
                  <div className="mt-auto flex flex-wrap gap-3 border-t border-white/[0.06] pt-4">
                    {agentReady ? (
                      <>
                        <CommandButton type="publicar" requestId={r.id} variant="approve">
                          Publicar
                        </CommandButton>
                        <CommandButton type="rechazar" requestId={r.id} variant="reject" confirm="¿Descartar el cambio del agente?">
                          Descartar
                        </CommandButton>
                      </>
                    ) : (
                      <>
                        <CommandButton type="aprobar" requestId={r.id} variant="approve">
                          {code ? "Aprobar y hacer" : "Aprobar"}
                        </CommandButton>
                        <CommandButton type="rechazar" requestId={r.id} variant="reject" confirm="¿Rechazar el pedido? Se le avisa al cliente.">
                          Rechazar
                        </CommandButton>
                      </>
                    )}
                  </div>
                </div>
              </Glass>
            );
          })}
        </div>
      )}
    </div>
  );
}
