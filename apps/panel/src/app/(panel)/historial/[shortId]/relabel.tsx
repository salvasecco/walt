"use client";

import { ArrowRight, Loader2, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { relabelRequest } from "@/app/learning-actions";
import { CategoryChip, Mono, Notice, PanelTitle, Surface } from "@/components/ui-walt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_HELP, CATEGORY_LABEL, CATEGORY_TONE, dateTime, toneDot } from "@/lib/labels";
import { LABEL_CATEGORIES, type LabelCategory } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

export type LabelItem = { id: string; from_category: string | null; to_category: string; reason: string | null; actor_email: string | null; created_at: string };

/** «¿Estuvo bien clasificado?» en el detalle del pedido: la señal más valiosa del producto (brief §2). */
export function Relabel({
  requestId,
  decided,
  labels,
  ready,
  sample,
}: {
  requestId: string;
  /** Lo que decidió Walt (ya con el nombre nuevo). */
  decided: string | null;
  labels: LabelItem[];
  ready: boolean;
  sample: boolean;
}) {
  const current = (labels.at(-1)?.to_category ?? decided) as LabelCategory | null;
  const [to, setTo] = useState<LabelCategory | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () =>
    to &&
    start(async () => {
      const r = await relabelRequest(requestId, to, reason);
      if (!r.ok) return void toast.error(r.error);
      if (r.demo) return void toast.warning(r.message);
      toast.success(r.message ?? "Listo");
      setTo(null);
      setReason("");
      router.refresh();
    });
  return (
    <Surface className="flex flex-col gap-4 p-5">
      <PanelTitle icon={<Tags />}>¿Estuvo bien clasificado?</PanelTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Walt dijo</span>
        <CategoryChip category={decided} />
        {labels.length > 0 && (
          <>
            <ArrowRight className="size-3.5 text-faint" />
            <span className="text-muted-foreground">la agencia</span>
            <CategoryChip category={labels.at(-1)!.to_category} />
          </>
        )}
      </div>
      {!ready ? (
        <Notice tone="info">Reetiquetar necesita la migración 0004 (tabla request_labels).</Notice>
      ) : (
        <>
          <p className="-mt-1 text-sm text-muted-foreground">Si no, elegí el tipo correcto. Walt lo usa como ejemplo en los próximos pedidos de tu agencia y te propone reglas cuando se repite.</p>
          <div role="radiogroup" aria-label="Tipo correcto" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {LABEL_CATEGORIES.map((c) => {
              const on = to === c;
              const isCurrent = current === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={isCurrent || pending}
                  title={CATEGORY_HELP[c]}
                  onClick={() => setTo(c)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed",
                    on ? "border-line-strong bg-white/[0.07] text-foreground" : "border-line bg-surface-2 text-muted-foreground hover:text-foreground",
                    isCurrent && "opacity-50",
                  )}
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", toneDot[CATEGORY_TONE[c]])} />
                  <span className="min-w-0 truncate">{CATEGORY_LABEL[c]}</span>
                  {isCurrent && <span className="ml-auto text-[10px] tracking-wide text-faint uppercase">actual</span>}
                </button>
              );
            })}
          </div>
          {to && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="relabel-reason" className="sr-only">
                Motivo
              </label>
              <Input
                id="relabel-reason"
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo (opcional): por ejemplo, toca la API"
                className="h-9 flex-1"
              />
              <Button type="button" size="lg" onClick={save} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Marcar como {CATEGORY_LABEL[to].toLowerCase()}
              </Button>
            </div>
          )}
          {sample && <p className="text-xs text-muted-foreground">Con datos de ejemplo no se guarda.</p>}
        </>
      )}
      {labels.length > 0 && (
        <ol className="flex flex-col border-t border-line pt-3">
          {[...labels].reverse().map((l) => (
            <li key={l.id} className="flex flex-col gap-0.5 py-1.5 text-sm">
              <span className="flex flex-wrap items-center gap-1.5">
                <CategoryChip category={l.from_category} />
                <ArrowRight className="size-3 text-faint" />
                <CategoryChip category={l.to_category} />
                {l.reason && <span className="text-muted-foreground">· {l.reason}</span>}
              </span>
              <Mono className="text-[11px] text-muted-foreground">
                {dateTime(l.created_at)} · {l.actor_email ?? "agencia"}
              </Mono>
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
