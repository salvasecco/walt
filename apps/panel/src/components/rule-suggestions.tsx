"use client";

import { Lightbulb, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyRuleSuggestion } from "@/app/learning-actions";
import { Chip, PanelTitle, Surface } from "@/components/ui-walt";
import { Button } from "@/components/ui/button";
import type { RuleSuggestion } from "@/lib/suggestions";

export type SuggestionItem = Pick<RuleSuggestion, "id" | "projectId" | "kind" | "text" | "count" | "requests"> & { projectName?: string };

/** Sugerencias de reglas a partir de los reetiquetados: «¿Lo agrego a las reglas?» crea una versión nueva. */
export function RuleSuggestions({ items, canApply, ready, className }: { items: SuggestionItem[]; canApply: boolean; ready: boolean; className?: string }) {
  return (
    <Surface className={className ?? "flex flex-col gap-3 p-5"}>
      <PanelTitle icon={<Lightbulb />} right={items.length > 0 && <span className="text-xs text-muted-foreground tnum">{items.length}</span>}>
        Sugerencias de reglas
      </PanelTitle>
      {!ready ? (
        <p className="text-sm text-muted-foreground">Llegan con la migración 0004: salen de los pedidos que la agencia reetiqueta.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay patrones. Cuando reetiquetes 3 pedidos parecidos (por ejemplo, que tocaban la misma carpeta), Walt te propone la regla.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <SuggestionRow key={s.id} s={s} canApply={canApply} />
          ))}
        </ul>
      )}
    </Surface>
  );
}

function SuggestionRow({ s, canApply }: { s: SuggestionItem; canApply: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();
  return (
    <li className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface-2 p-3.5">
      {s.projectName && <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{s.projectName}</span>}
      <p className="text-sm leading-snug">{s.text}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {s.requests.map((r) => (
          <Link key={r.shortId} href={`/historial/${r.shortId}`} title={r.text} className="transition-opacity hover:opacity-80">
            <Chip className="font-mono">#{r.shortId}</Chip>
          </Link>
        ))}
      </div>
      {canApply ? (
        <Button
          type="button"
          size="sm"
          variant={done ? "outline" : "default"}
          disabled={pending || done}
          className="self-start"
          onClick={() =>
            start(async () => {
              const r = await applyRuleSuggestion(s.projectId, s.id);
              if (!r.ok) return void toast.error(r.error);
              if (r.demo) return void toast.warning(r.message);
              setDone(true);
              toast.success(r.message ?? "Listo");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} {done ? "Agregada" : "Agregar a las reglas"}
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Un admin o el dueño la puede agregar.</span>
      )}
    </li>
  );
}
