import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, GitCommitHorizontal, GitPullRequest, Eye, Receipt } from "lucide-react";
import { CommandButton } from "@/components/command-button";
import { Journey } from "@/components/journey";
import { NotConfigured } from "@/components/not-configured";
import { ChangesDiff, GateReasons, OpsList, Phone } from "@/components/request-parts";
import { CategoryChip, Chip, Glass, Mono, PanelTitle, SampleBadge, StatusChip } from "@/components/ui-dale";
import { getRequestDetail, NotConfiguredError } from "@/lib/data";
import { dataMode, env } from "@/lib/env";
import { buildJourney } from "@/lib/journey";
import { STEP_LABEL, clock, dateTime, ms, usd } from "@/lib/labels";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/historial/[shortId]">): Promise<Metadata> {
  const { shortId } = await params;
  return { title: `Pedido #${shortId}` };
}

const REVERTIBLE = new Set(["publicado"]);

export default async function PedidoPage({ params }: PageProps<"/historial/[shortId]">) {
  const { shortId } = await params;
  let d;
  try {
    d = await getRequestDetail(decodeURIComponent(shortId));
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  if (!d) notFound();
  const { request: r, project, events, messages, approvals, versions, liveVersion, quote } = d;
  const nodes = buildJourney(r, events);
  const published = versions.find((v) => v.published_at);
  const gitError = versions.find((v) => v.git_error && !v.git_commit_sha);
  const usage = r.usage as { input_tokens?: number; output_tokens?: number } | null;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/historial" className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Historial
      </Link>
      <Glass hi className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Mono className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-sm text-cyan-neon">#{r.short_id}</Mono>
          <CategoryChip category={r.category} />
          <StatusChip status={r.status} />
          {r.lane && <Chip tone={r.lane === "codigo" ? "violet" : "muted"}>Carril de {r.lane === "codigo" ? "código" : "contenido"}</Chip>}
          <span className="text-sm text-muted-foreground">
            {project?.name} · {dateTime(r.created_at)}
          </span>
          {dataMode() === "ejemplo" && <SampleBadge className="ml-auto" />}
        </div>
        <h1 className="mt-3 text-2xl font-medium text-balance sm:text-3xl">“{r.raw_text}”</h1>
        {r.interpretation?.summary && <p className="mt-2 text-lg text-violet-neon">{r.interpretation.summary}</p>}
        <div className="mt-6">
          <Journey nodes={nodes} size="md" />
        </div>
        <div className="mt-5 flex flex-wrap gap-3 border-t border-white/[0.06] pt-4">
          {REVERTIBLE.has(r.status) && (
            <CommandButton type="revertir" requestId={r.id} variant="reject" confirm="¿Volver a como estaba antes de este pedido?">
              Revertir
            </CommandButton>
          )}
          {gitError && (
            <CommandButton type="reintentar_commit" requestId={r.id} payload={{ version_id: gitError.id }} variant="primary">
              <GitCommitHorizontal className="size-4" /> Reintentar commit
            </CommandButton>
          )}
          {(r.status === "esperando_agencia" || r.status === "agente_listo") && (
            <Link href="/aprobaciones" className="inline-flex h-10 items-center rounded-xl bg-amber-neon px-4 text-sm font-medium text-black">
              Ir a aprobar
            </Link>
          )}
        </div>
      </Glass>

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="h-[520px]">
          <Phone messages={messages} assistantName={`Asistente de ${env.agencyName}`} />
        </div>

        <div className="flex flex-col gap-5">
          <Glass className="flex flex-col gap-5 p-5">
            <section>
              <PanelTitle
                right={r.confidence != null && <Mono className="text-xs text-muted-foreground">confianza {(Number(r.confidence) * 100).toFixed(0)}%</Mono>}
              >
                Interpretación
              </PanelTitle>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                {r.interpretation ? (
                  <>
                    <div>
                      <span className="text-muted-foreground">Tipo: </span>
                      {r.interpretation.kind}
                      {r.interpretation.needsCode && <span className="text-violet-neon"> · necesita código</span>}
                    </div>
                    <OpsList request={r} content={liveVersion?.content} />
                    {r.interpretation.codeInstruction && (
                      <p className="rounded-xl border border-violet-neon/20 bg-violet-neon/5 p-3">{r.interpretation.codeInstruction}</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Sin interpretación: el pedido se decidió antes de llamar a la IA.</p>
                )}
              </div>
            </section>
            {!!r.changes?.length && (
              <section>
                <PanelTitle>Antes y después</PanelTitle>
                <div className="mt-3">
                  <ChangesDiff changes={r.changes} content={liveVersion?.content} />
                </div>
              </section>
            )}
            <section>
              <PanelTitle right={<Mono className="text-xs text-muted-foreground">reglas v{r.rules_version ?? "—"}</Mono>}>
                Gate {r.gate?.outcome && <span className="ml-1 text-foreground normal-case">· {r.gate.outcome}</span>}
              </PanelTitle>
              <div className="mt-3">
                <GateReasons request={r} />
                {!r.gate && <p className="text-sm text-muted-foreground">No pasó por el gate.</p>}
              </div>
            </section>
            {r.error && (
              <section>
                <PanelTitle>Error</PanelTitle>
                <p className="mt-2 font-mono text-sm text-rose-neon">{r.error}</p>
              </section>
            )}
          </Glass>
          {(r.ops || r.interpretation) && (
            <details className="glass rounded-2xl p-5 text-sm">
              <summary className="label-xs cursor-pointer">JSON del pedido</summary>
              <pre className="scrollbar-thin mt-3 max-h-96 overflow-auto font-mono text-xs text-muted-foreground">
                {JSON.stringify({ interpretation: r.interpretation, ops: r.ops, gate: r.gate, changes: r.changes }, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Glass className="p-5">
            <PanelTitle>Eventos</PanelTitle>
            <ol className="mt-3 flex flex-col">
              {events.length === 0 && <li className="text-sm text-muted-foreground">Sin eventos.</li>}
              {events
                .filter((e) => e.status !== "inicio" || !events.some((x) => x.step === e.step && x.status !== "inicio"))
                .map((e) => (
                  <li key={e.id} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-white/[0.04] py-1.5 text-sm last:border-0">
                    <Mono className="text-xs text-muted-foreground">{clock(e.at, true)}</Mono>
                    <span className={cn(e.status === "falla" && "text-rose-neon", e.status === "inicio" && "text-cyan-neon")}>
                      {STEP_LABEL[e.step] ?? e.step}
                      {e.status === "falla" && typeof e.detail?.error === "string" && <span className="block text-xs">{e.detail.error}</span>}
                    </span>
                    <Mono className="text-xs text-muted-foreground">{e.status === "inicio" ? "en curso" : ms(e.duration_ms)}</Mono>
                  </li>
                ))}
            </ol>
          </Glass>
          <Glass className="flex flex-col gap-3 p-5 text-sm">
            <PanelTitle>Aprobaciones y publicación</PanelTitle>
            {approvals.length === 0 && <p className="text-muted-foreground">Sin aprobaciones.</p>}
            {approvals.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2">
                <Chip tone={a.decision === "aprobado" ? "emerald" : "rose"}>{a.decision}</Chip>
                <span>
                  por {a.actor} vía {a.via}
                </span>
                <Mono className="ml-auto text-xs text-muted-foreground">{dateTime(a.at)}</Mono>
              </div>
            ))}
            {published && (
              <div className="flex items-center gap-2">
                <GitCommitHorizontal className="size-4 text-emerald-neon" />
                {published.git_commit_sha ? (
                  project ? (
                    <a
                      className="font-mono text-cyan-neon hover:underline"
                      href={`https://github.com/${project.repo_owner}/${project.repo_name}/commit/${published.git_commit_sha}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {published.git_commit_sha.slice(0, 7)}
                    </a>
                  ) : (
                    <Mono>{published.git_commit_sha.slice(0, 7)}</Mono>
                  )
                ) : (
                  <span className="text-rose-neon">Sin commit{published.git_error ? `: ${published.git_error}` : ""}</span>
                )}
                <Mono className="ml-auto text-xs text-muted-foreground">{dateTime(published.published_at)}</Mono>
              </div>
            )}
            {gitError && !published && <p className="text-rose-neon">Commit pendiente: {gitError.git_error}</p>}
            {r.pr_url && (
              <a href={r.pr_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-cyan-neon hover:underline">
                <GitPullRequest className="size-4" /> PR #{r.pr_number} <ExternalLink className="size-3" />
              </a>
            )}
            {r.preview_url && (
              <a href={r.preview_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-cyan-neon hover:underline">
                <Eye className="size-4" /> Vista previa <ExternalLink className="size-3" />
              </a>
            )}
            {quote && (
              <Link href="/presupuestos" className="flex items-center gap-2 text-violet-neon hover:underline">
                <Receipt className="size-4" /> Presupuesto: {quote.title} · {usd(quote.amount_usd, 0)}
              </Link>
            )}
          </Glass>
          <Glass className="grid grid-cols-3 gap-3 p-5">
            <div>
              <div className="label-xs">Costo</div>
              <Mono className="mt-1 block text-lg">${Number(r.cost_usd ?? 0).toFixed(4)}</Mono>
            </div>
            <div>
              <div className="label-xs">Entrada</div>
              <Mono className="mt-1 block text-lg">{usage?.input_tokens ?? "—"}</Mono>
            </div>
            <div>
              <div className="label-xs">Salida</div>
              <Mono className="mt-1 block text-lg">{usage?.output_tokens ?? "—"}</Mono>
            </div>
          </Glass>
        </div>
      </div>
    </div>
  );
}
