"use client";

import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveQuote } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, IdTag, Surface } from "@/components/ui-dale";
import { Button } from "@/components/ui/button";
import type { QuoteRow } from "@/lib/data";
import { dateTime } from "@/lib/labels";

const TONE = { borrador: "warn", enviado: "info", aceptado: "ok", rechazado: "danger" } as const;

export function QuoteCard({ row }: { row: QuoteRow }) {
  const { quote: q, request, project } = row;
  const [f, setF] = useState({ title: q.title, description: q.description ?? "", amount_usd: Number(q.amount_usd ?? 0), eta_days: Number(q.eta_days ?? 0) });
  const [pending, start] = useTransition();
  const router = useRouter();
  const editable = q.status === "borrador";
  const save = (send: boolean) =>
    start(async () => {
      const r = await saveQuote(q.id, f, send);
      if (!r.ok) return void toast.error(r.error);
      if (r.demo) return void toast.warning(r.message);
      toast.success(r.message ?? "Listo");
      router.refresh();
    });
  return (
    <Surface id={`q-${q.id}`} className="flex scroll-mt-24 flex-col gap-4 p-5 target:border-foreground/40">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={TONE[q.status]}>
          {q.status}
        </Chip>
        <span className="text-sm text-muted-foreground">
          {project?.client_name ?? "Cliente"} · {dateTime(q.created_at)}
        </span>
        {request && (
          <Link href={`/historial/${request.short_id}`} className="ml-auto transition-opacity hover:opacity-80">
            <IdTag id={request.short_id} />
          </Link>
        )}
      </div>
      {request && <p className="text-sm text-muted-foreground">Pidió: “{request.raw_text}”</p>}
      <label className="flex flex-col gap-1.5">
        <span className="label-xs">Título</span>
        <Input value={f.title} disabled={!editable} onChange={(e) => setF({ ...f, title: e.target.value })} className="h-9" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label-xs">Descripción</span>
        <Textarea value={f.description} disabled={!editable} rows={4} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label-xs">Monto (USD)</span>
          <Input type="number" min={1} value={f.amount_usd} disabled={!editable} onChange={(e) => setF({ ...f, amount_usd: Number(e.target.value) })} className="h-9 text-base font-semibold tnum" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-xs">Días</span>
          <Input type="number" min={1} value={f.eta_days} disabled={!editable} onChange={(e) => setF({ ...f, eta_days: Number(e.target.value) })} className="h-9 text-base font-semibold tnum" />
        </label>
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="button" size="lg" className="px-3.5" disabled={pending} onClick={() => save(true)}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Enviar al cliente
          </Button>
          <Button type="button" variant="outline" size="lg" className="px-3.5" disabled={pending} onClick={() => save(false)}>
            Guardar borrador
          </Button>
        </div>
      )}
    </Surface>
  );
}
