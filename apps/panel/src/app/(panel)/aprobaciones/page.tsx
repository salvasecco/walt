import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck, ExternalLink, GitPullRequest, Eye } from "lucide-react";
import { CodeDiff } from "@/components/code-diff";
import { CommandButton } from "@/components/command-button";
import { NotConfigured } from "@/components/not-configured";
import { PreviewFrame } from "@/components/preview-frame";
import { ChangesDiff, GateReasons, OpsList } from "@/components/request-parts";
import { CategoryChip, Chip, EmptyState, IdTag, Surface, PageHeader, PanelTitle, SampleBadge, StatusChip } from "@/components/ui-walt";
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
      <PageHeader
        title="Aprobaciones"
        subtitle="Solo lo delicado: base de datos, auth, backend, pagos, secretos, infraestructura o dependencias. Al aprobar, el cliente recibe la vista previa y lo publica él; rechazar le avisa."
        right={sample && <SampleBadge />}
      />
      {items.length === 0 ? (
        <EmptyState icon={<CheckCheck className="size-5" />} title="Nada esperando">
          Lo simple se publica con el «Dale» del cliente, sin pasar por acá. Cuando algo delicado necesite tu visto bueno, aparece acá y en tu Telegram.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {items.map(({ request: r, project, liveVersion, screenshot, code: review }) => {
            const code = r.lane === "codigo";
            const agentReady = r.status === "agente_listo";
            return (
              <Surface key={r.id} className="grid gap-6 p-4 sm:p-5 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
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
                      <Link href={`/historial/${r.short_id}`} className="transition-opacity hover:opacity-80">
                        <IdTag id={r.short_id} />
                      </Link>
                      <CategoryChip category={r.category} />
                      <StatusChip status={r.status} />
                      {code && <Chip tone="code">Carril de código</Chip>}
                      <span className="text-xs text-muted-foreground sm:text-sm">
                        {project?.client_name ?? "Cliente"} · {relative(r.created_at)}
                      </span>
                    </div>
                    <p className="mt-3 text-lg font-medium sm:text-xl">“{r.raw_text}”</p>
                    {r.interpretation?.summary && <p className="mt-1 text-sm text-muted-foreground">{r.interpretation.summary}</p>}
                  </div>
                  <section>
                    <PanelTitle>Por qué es delicado</PanelTitle>
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
                  {code && review && (
                    <section>
                      <PanelTitle
                        right={
                          <span className="text-xs text-muted-foreground">
                            {review.files.length} {review.files.length === 1 ? "archivo" : "archivos"}
                          </span>
                        }
                      >
                        Los cambios en el código
                      </PanelTitle>
                      <CodeDiff diff={review.diff} className="mt-2" />
                    </section>
                  )}
                  {code && (
                    <section className="flex flex-wrap gap-3">
                      {r.interpretation?.codeInstruction && (
                        <p className="w-full rounded-lg border border-line bg-surface-2 p-3 text-sm">
                          <span className="label-xs mb-1 block">Ficha para el agente</span>
                          {r.interpretation.codeInstruction}
                        </p>
                      )}
                      {r.pr_url && (
                        <a href={r.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-foreground underline-offset-4 hover:underline">
                          <GitPullRequest className="size-4" /> Ver PR #{r.pr_number} <ExternalLink className="size-3" />
                        </a>
                      )}
                      {r.preview_url && (
                        <a href={r.preview_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-foreground underline-offset-4 hover:underline">
                          <Eye className="size-4" /> Ver vista previa <ExternalLink className="size-3" />
                        </a>
                      )}
                    </section>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-4">
                    {agentReady ? (
                      <>
                        <CommandButton type="aprobar" requestId={r.id} variant="approve">
                          Aprobar
                        </CommandButton>
                        <CommandButton type="rechazar" requestId={r.id} variant="reject" confirm="¿Rechazar el cambio? Se cierra el PR y se le avisa al cliente.">
                          Rechazar
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
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
