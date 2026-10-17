"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveRules } from "@/app/actions";
import { Glass, PanelTitle } from "@/components/ui-dale";
import { OP_LABEL, POLICY_LABEL, clock, toneChip, POLICY_TONE } from "@/lib/labels";
import { OP_TYPES, type OpType, type Policy, type Rules } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLICIES: Policy[] = ["auto", "agencia", "bloqueado"];

type Value = Pick<Rules, "policies" | "limits">;

export function RulesForm({ projectId, initial, version, since }: { projectId: string; initial: Value; version: number; since: string | null }) {
  const [v, setV] = useState<Value>(initial);
  const [ver, setVer] = useState({ version, since });
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  const setPolicy = (t: OpType, p: Policy) => setV((s) => ({ ...s, policies: { ...s.policies, [t]: p } }));
  const setLimit = (k: keyof Value["limits"], n: number) => setV((s) => ({ ...s, limits: { ...s.limits, [k]: n } }));

  return (
    <Glass hi className="flex flex-col gap-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">
            versión {ver.version || "—"}
            {ver.since && <span className="font-normal text-muted-foreground">, vigente desde {clock(ver.since)}</span>}
          </div>
          <p className="text-sm text-muted-foreground">Guardar crea una versión nueva. Las anteriores quedan en el historial.</p>
        </div>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await saveRules(projectId, v.policies as Record<OpType, Policy>, v.limits);
              if (!r.ok) return void toast.error(r.error);
              if (r.demo) return void toast.warning(r.message);
              setVer({ version: r.data!.version, since: r.data!.at });
              toast.success(`Versión ${r.data!.version}, vigente desde ${clock(r.data!.at)}`);
              router.refresh();
            })
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-neon px-4 text-sm font-medium text-[#031016] disabled:opacity-40"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar versión nueva
        </button>
      </div>

      <section>
        <PanelTitle>Por tipo de cambio</PanelTitle>
        <ul className="mt-3 flex flex-col gap-2">
          {OP_TYPES.map((t) => (
            <li key={t} className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">{OP_LABEL[t]}</div>
                <code className="font-mono text-xs text-muted-foreground">{t}</code>
              </div>
              <div role="radiogroup" aria-label={OP_LABEL[t]} className="flex gap-1 rounded-xl border border-white/10 p-1">
                {POLICIES.map((p) => {
                  const on = v.policies[t] === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPolicy(t, p)}
                      className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition", on ? toneChip[POLICY_TONE[p]] : "border-transparent text-muted-foreground hover:text-foreground")}
                    >
                      {POLICY_LABEL[p]}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <PanelTitle>Límites</PanelTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <NumField label="Cambio de precio máximo" suffix="%" hint="Más que esto lo aprueba la agencia" value={v.limits.maxPriceChangePct} min={1} max={100} onChange={(n) => setLimit("maxPriceChangePct", n)} />
          <NumField label="Cupo del mes" suffix="cambios" hint="Cambios automáticos publicados por mes" value={v.limits.monthlyQuota} min={0} max={100000} onChange={(n) => setLimit("monthlyQuota", n)} />
          <NumField label="Confianza mínima" suffix="%" hint="Con menos, el pedido va a la agencia" value={Math.round(v.limits.minConfidence * 100)} min={0} max={100} onChange={(n) => setLimit("minConfidence", n / 100)} />
          <NumField label="Operaciones por pedido" suffix="máx." hint="Tope de operaciones en un solo pedido" value={v.limits.maxOpsPerRequest} min={1} max={500} onChange={(n) => setLimit("maxOpsPerRequest", n)} />
        </div>
      </section>
    </Glass>
  );
}

function NumField({ label, suffix, hint, value, min, max, onChange }: { label: string; suffix: string; hint: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-baseline gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 rounded-lg border border-white/10 bg-transparent px-2 py-1 font-mono text-2xl tnum outline-none focus:border-cyan-neon/60"
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}
