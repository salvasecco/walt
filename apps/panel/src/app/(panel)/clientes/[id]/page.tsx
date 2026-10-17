import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderGit2, MessageSquare, Receipt } from "lucide-react";
import { HealthBadge } from "@/components/health-badge";
import { NotConfigured } from "@/components/not-configured";
import { QuotaMeter } from "@/components/quota-meter";
import { CategoryChip, Chip, DotLabel, IdTag, Mono, PanelTitle, SampleBadge, StatusChip, Surface } from "@/components/ui-dale";
import { getClientDetail, type ClientDetail } from "@/lib/agency";
import { COLUMN_LABEL, KIND_LABEL } from "@/lib/attention";
import { NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { dateTime, relative } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { UsageCharts } from "./usage-chart";

export const metadata: Metadata = { title: "Cliente" };

const QUOTE_TONE = { borrador: "warn", enviado: "info", aceptado: "ok", rechazado: "danger" } as const;
const COLUMN_TONE = { te_necesita: "danger", esperando_cliente: "warn", en_curso: "info", al_dia: "ok" } as const;

export default async function ClientePage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d: ClientDetail | null;
  try {
    d = await getClientDetail(id);
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  if (!d) notFound();
  const { client, now } = d;
  const history = d.requests.slice(0, 40);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/clientes" className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{client.name}</h1>
            {client.is_sample && <Chip>ejemplo</Chip>}
            <HealthBadge health={d.health} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.contact_name ? `${client.contact_name} · ` : ""}Cliente desde {dateTime(client.created_at)}
          </p>
        </div>
        {dataMode() === "ejemplo" && <SampleBadge />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Surface className="flex flex-col gap-1 p-4">
          <span className="label-xs">Plan</span>
          <span className="text-lg font-semibold">{client.plan_name}</span>
          <span className="text-xs text-muted-foreground tnum">USD {Number(client.monthly_fee_usd).toLocaleString("es-UY")} por mes</span>
        </Surface>
        <Surface className="flex flex-col gap-1 p-4">
          <span className="label-xs">Cambios del mes</span>
          <QuotaMeter used={d.usedThisMonth} quota={client.monthly_quota} className="[&>span:first-child]:text-lg [&>span:first-child]:font-semibold" />
        </Surface>
        <Surface className="flex flex-col gap-1 p-4">
          <span className="label-xs">IA del mes</span>
          <span className="text-lg font-semibold tnum">USD {d.costThisMonth.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">Suma del costo de sus pedidos</span>
        </Surface>
        <Surface className="flex flex-col gap-1 p-4">
          <span className="label-xs">Último pedido</span>
          <span className="text-lg font-semibold tnum">{d.lastRequestAt ? relative(d.lastRequestAt, now) : "—"}</span>
          <span className="text-xs text-muted-foreground">{d.lastRequestAt ? dateTime(d.lastRequestAt) : "Sin pedidos en 6 meses"}</span>
        </Surface>
      </div>

      {client.notes && <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted-foreground">{client.notes}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Surface className="p-5">
            <PanelTitle icon={<FolderGit2 />}>Proyectos</PanelTitle>
            {d.projects.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Este cliente todavía no tiene proyectos.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {d.attention.map((a) => (
                  <li key={a.projectId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {a.project.name}
                        {a.project.is_sample && <Chip className="h-4 px-1 text-[10px]">ejemplo</Chip>}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {a.project.repo_owner}/{a.project.repo_name} · modo {a.project.mode}
                        {a.project.site_url ? ` · ${a.project.site_url.replace(/^https?:\/\//, "")}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <DotLabel tone={COLUMN_TONE[a.column]}>{COLUMN_LABEL[a.column]}</DotLabel>
                      {a.item && a.column !== "al_dia" && <span className="text-xs text-muted-foreground">{KIND_LABEL[a.item.kind]}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface className="p-5">
            <PanelTitle>Consumo</PanelTitle>
            <div className="mt-4">
              <UsageCharts usage={d.usage} quota={client.monthly_quota} />
            </div>
            <table className="mt-5 w-full text-sm">
              <caption className="sr-only">Consumo por mes</caption>
              <thead>
                <tr className="label-xs border-b border-line text-left">
                  <th className="py-2 font-medium">Mes</th>
                  <th className="py-2 text-right font-medium">Pedidos</th>
                  <th className="py-2 text-right font-medium">Cambios</th>
                  <th className="py-2 text-right font-medium">IA</th>
                </tr>
              </thead>
              <tbody>
                {[...d.usage].reverse().map((m) => (
                  <tr key={m.month} className="border-b border-line last:border-0">
                    <td className="py-1.5 text-muted-foreground tnum">{m.month}</td>
                    <td className="py-1.5 text-right tnum">{m.requests}</td>
                    <td className={cn("py-1.5 text-right tnum", m.changes > client.monthly_quota && "text-danger")}>{m.changes}</td>
                    <td className="py-1.5 text-right font-mono text-xs tnum">USD {m.cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>

          <Surface className="overflow-hidden">
            <div className="p-5 pb-3">
              <PanelTitle right={<span className="text-xs text-muted-foreground">Últimos 6 meses</span>}>Historial de pedidos</PanelTitle>
            </div>
            {history.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">Sin pedidos.</p>
            ) : (
              <ul className="border-t border-line">
                {history.map((r) => (
                  <li key={r.id} className="border-b border-line last:border-0">
                    <Link
                      href={`/historial/${r.short_id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-5 py-2.5 transition-colors hover:bg-white/[0.03] sm:grid-cols-[72px_minmax(0,1fr)_auto_auto_88px]"
                    >
                      <Mono className="hidden text-xs text-muted-foreground sm:block">#{r.short_id}</Mono>
                      <span className="min-w-0">
                        <span className="line-clamp-1 text-sm">{r.raw_text}</span>
                        {r.summary && <span className="line-clamp-1 text-xs text-muted-foreground">{r.summary}</span>}
                      </span>
                      <span className="hidden sm:block">
                        <CategoryChip category={r.category} />
                      </span>
                      <StatusChip status={r.status} />
                      <span className="col-span-2 text-xs text-muted-foreground tnum sm:col-span-1 sm:text-right">{dateTime(r.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Surface className="flex flex-col p-5">
            <PanelTitle icon={<MessageSquare />}>Conversación</PanelTitle>
            {d.messages.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Sin mensajes todavía.</p>
            ) : (
              // Al revés y con flex-col-reverse: arranca scrolleado abajo, en lo más nuevo.
              <ol className="scrollbar-thin mt-3 flex max-h-[560px] flex-col-reverse gap-2 overflow-y-auto pr-1">
                {[...d.messages].reverse().map((m) => (
                  <li key={m.id} className={cn("flex flex-col gap-0.5", m.direction === "entrada" ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-xl px-3 py-2 text-sm leading-snug",
                        m.direction === "entrada" ? "rounded-br-sm bg-[#2a2a30]" : "rounded-bl-sm border border-line bg-surface-2",
                      )}
                    >
                      <span className="break-words whitespace-pre-wrap">{m.text ?? "(sin texto)"}</span>
                    </div>
                    <span className="px-1 text-[11px] text-faint tnum">
                      {m.direction === "entrada" ? (m.contact_name ?? "Cliente") : "Dale"}
                      {d.projects.length > 1 && m.project_name ? ` · ${m.project_name}` : ""} · {dateTime(m.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Surface>

          <Surface className="p-5">
            <PanelTitle icon={<Receipt />}>Presupuestos</PanelTitle>
            {d.quotes.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Sin presupuestos.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {d.quotes.map((q) => (
                  <li key={q.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/presupuestos#q-${q.id}`} className="text-sm font-medium hover:underline hover:underline-offset-4">
                        {q.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Chip tone={QUOTE_TONE[q.status]}>{q.status}</Chip>
                        {q.short_id && <IdTag id={q.short_id} />}
                        <span>{dateTime(q.created_at)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm tnum">
                      {q.amount_usd != null ? `USD ${Number(q.amount_usd).toLocaleString("es-UY")}` : "—"}
                      <div className="text-xs text-muted-foreground">{q.eta_days ? `${q.eta_days} días` : ""}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
}
