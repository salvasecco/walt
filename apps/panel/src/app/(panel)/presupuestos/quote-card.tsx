"use client";

import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveQuote } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, Glass, Mono } from "@/components/ui-dale";
import type { QuoteRow } from "@/lib/data";
import { dateTime } from "@/lib/labels";

const TONE = { borrador: "amber", enviado: "cyan", aceptado: "emerald", rechazado: "rose" } as const;

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
    <Glass hi={editable} className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={TONE[q.status]} dot>
          {q.status}
        </Chip>
        <span className="text-sm text-muted-foreground">
          {project?.client_name ?? "Cliente"} · {dateTime(q.created_at)}
        </span>
        {request && (
          <Link href={`/historial/${request.short_id}`} className="ml-auto">
            <Mono className="text-sm text-cyan-neon">#{request.short_id}</Mono>
          </Link>
        )}
      </div>
      {request && <p className="text-sm text-muted-foreground">Pidió: “{request.raw_text}”</p>}
      <label className="flex flex-col gap-1.5">
        <span className="label-xs">Título</span>
        <Input value={f.title} disabled={!editable} onChange={(e) => setF({ ...f, title: e.target.value })} className="h-10 text-base" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label-xs">Descripción</span>
        <Textarea value={f.description} disabled={!editable} rows={4} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label-xs">Monto (USD)</span>
          <Input type="number" min={1} value={f.amount_usd} disabled={!editable} onChange={(e) => setF({ ...f, amount_usd: Number(e.target.value) })} className="h-10 font-mono text-lg" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-xs">Días</span>
          <Input type="number" min={1} value={f.eta_days} disabled={!editable} onChange={(e) => setF({ ...f, eta_days: Number(e.target.value) })} className="h-10 font-mono text-lg" />
        </label>
      </div>
      {editable && (
        <div className="flex flex-wrap gap-3 border-t border-white/[0.06] pt-4">
          <button type="button" disabled={pending} onClick={() => save(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-neon px-4 text-sm font-medium text-[#031016] disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar al cliente
          </button>
          <button type="button" disabled={pending} onClick={() => save(false)} className="h-10 rounded-xl border border-white/15 px-4 text-sm hover:bg-white/5 disabled:opacity-50">
            Guardar borrador
          </button>
        </div>
      )}
    </Glass>
  );
}
