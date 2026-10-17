"use client";

import Link from "next/link";
import { Check, Eye, Receipt, Send } from "lucide-react";
import { LayoutGroup, MotionConfig, motion } from "framer-motion";
import { CommandButton } from "@/components/command-button";
import { buttonVariants } from "@/components/ui/button";
import { Chip, DotLabel, IdTag, StatusChip } from "@/components/ui-walt";
import type { AttentionCard } from "@/lib/agency";
import { COLUMNS, COLUMN_LABEL, KIND_LABEL, type AttItem, type Column } from "@/lib/attention";
import { dateTime, relative, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

const COLUMN_TONE: Record<Column, Tone> = { te_necesita: "danger", esperando_cliente: "warn", en_curso: "info", al_dia: "ok" };

const COLUMN_HINT: Record<Column, string> = {
  te_necesita: "Esperan algo tuyo: aprobar, presupuestar o revisar.",
  esperando_cliente: "La pelota la tiene el cliente.",
  en_curso: "Walt está trabajando.",
  al_dia: "Nada pendiente.",
};

const SPRING = { type: "tween", duration: 0.22, ease: [0.2, 0, 0, 1] } as const;

export function AttentionBoard({ board, now }: { board: Record<Column, AttentionCard[]>; now: number }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <LayoutGroup>
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <section key={col} aria-labelledby={`col-${col}`} className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-surface/60 p-2.5">
              <header className="flex items-center justify-between gap-2 px-1 pt-0.5">
                <h2 id={`col-${col}`} className="flex items-center gap-2 text-sm font-medium">
                  <DotLabel tone={COLUMN_TONE[col]} className="border-0 bg-transparent px-0 text-sm">
                    {COLUMN_LABEL[col]}
                  </DotLabel>
                </h2>
                <span className="text-sm text-muted-foreground tnum">{board[col].length}</span>
              </header>
              <p className="px-1 text-xs text-faint">{COLUMN_HINT[col]}</p>
              <div className="flex flex-col gap-2">
                {board[col].map((card) => (
                  <ProjectCard key={card.projectId} card={card} now={now} />
                ))}
                {board[col].length === 0 && (
                  <motion.div layout className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-faint">
                    Vacío
                  </motion.div>
                )}
              </div>
            </section>
          ))}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

function ProjectCard({ card, now }: { card: AttentionCard; now: number }) {
  const { project, client, item, items, sample } = card;
  const clientName = client?.name ?? project.client_name;
  const more = items.length - 1;
  return (
    <motion.article
      layout
      layoutId={card.projectId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface-2 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {client ? (
              <Link href={`/clientes/${client.id}`} className="text-sm font-medium hover:underline hover:underline-offset-4">
                {clientName}
              </Link>
            ) : (
              <span className="text-sm font-medium">{clientName}</span>
            )}
            {sample && <Chip className="h-4 px-1 text-[10px]">ejemplo</Chip>}
          </div>
          {project.name !== clientName && <div className="truncate text-xs text-muted-foreground">{project.name}</div>}
        </div>
        {item && (
          <time dateTime={item.since} className="shrink-0 text-xs text-muted-foreground tnum" title={dateTime(item.since)}>
            {relative(item.since, now)}
          </time>
        )}
      </div>
      {item ? <ItemBody item={item} more={more} /> : <p className="text-xs text-faint">Sin pedidos en los últimos 7 días.</p>}
      {item && <Actions item={item} />}
    </motion.article>
  );
}

function ItemBody({ item, more }: { item: AttItem; more: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{KIND_LABEL[item.kind]}</div>
      <p className="line-clamp-2 text-sm text-foreground/90">{item.text}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.shortId && <IdTag id={item.shortId} />}
        {item.status && <StatusChip status={item.status} />}
        {more > 0 && <span className="text-xs text-faint">+{more} más</span>}
      </div>
    </div>
  );
}

const small = "h-8 px-2.5 text-[13px]";

function Actions({ item }: { item: AttItem }) {
  const view = item.shortId ? (
    <Link href={`/historial/${item.shortId}`} className={cn(buttonVariants({ variant: "outline" }), small)}>
      <Eye /> Ver
    </Link>
  ) : null;
  if (item.action === "aprobar" && item.requestId)
    return (
      <div className="flex flex-wrap gap-2">
        <CommandButton type="aprobar" requestId={item.requestId} variant="approve" className={small} confirm="¿Aprobar y publicar este cambio?">
          <Check className="size-4" /> Aprobar
        </CommandButton>
        {view}
      </div>
    );
  if (item.action === "presupuesto" && item.quoteId)
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/presupuestos#q-${item.quoteId}`}
          className={cn(buttonVariants({ variant: item.kind === "presupuesto_borrador" ? "default" : "outline" }), small)}
        >
          {item.kind === "presupuesto_borrador" ? <><Send /> Mandar presupuesto</> : <><Receipt /> Ver presupuesto</>}
        </Link>
      </div>
    );
  return view ? <div className="flex flex-wrap gap-2">{view}</div> : null;
}
