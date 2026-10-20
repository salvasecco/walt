"use client";

import { Loader2, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { saveRules } from "@/app/rules-actions";
import { Chip, Mono, Notice, PanelTitle, Surface } from "@/components/ui-walt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OP_LABEL, POLICY_TONE, clock, dateTime, toneDot } from "@/lib/labels";
import { OP_TYPES, type EditableRules, type OpType, type Policy } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LinesField, NumField, Section } from "./fields";
import { Simulator } from "./simulator";

const POLICIES: { value: Policy; label: string }[] = [
  { value: "auto", label: "Simple" },
  { value: "agencia", label: "Delicado" },
  { value: "bloqueado", label: "Bloqueado" },
];

export type TemplateOption = { id: string; label: string; description: string; policy_text: string; config: EditableRules["config"] };
export type VersionItem = { id: string; version: number; created_at: string; created_by: string | null; editable: EditableRules };

/** Para comparar sin que cuenten las líneas vacías ni los espacios de más. */
function normalized(r: EditableRules) {
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  return JSON.stringify({
    ...r,
    policy_text: r.policy_text.trim(),
    config: {
      ...r.config,
      delicateGlobs: clean(r.config.delicateGlobs),
      protectedGlobs: clean(r.config.protectedGlobs),
      simpleGlobs: clean(r.config.simpleGlobs),
      alwaysNew: clean(r.config.alwaysNew),
    },
  });
}

export function RulesWorkbench({
  project,
  initial,
  versions,
  templates,
  alwaysDelicate,
  structured,
  canEdit,
  roleLabel,
  aside,
}: {
  project: { id: string; name: string; mode: "contenido" | "codigo" };
  initial: EditableRules;
  versions: VersionItem[];
  templates: TemplateOption[];
  alwaysDelicate: readonly string[];
  structured: boolean;
  canEdit: boolean;
  roleLabel: string;
  /** Sugerencias de reglas (vienen del servidor). */
  aside?: ReactNode;
}) {
  const [v, setV] = useState<EditableRules>(initial);
  const [saved, setSaved] = useState({ version: versions[0]?.version ?? 0, at: versions[0]?.created_at ?? null });
  const [template, setTemplate] = useState(initial.config.template);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = useMemo(() => normalized(v) !== normalized(initial), [v, initial]);
  const lockR1 = !canEdit || !structured;
  const priceWarn = v.config.priceWarnPct ?? v.limits.maxPriceChangePct;

  const setConfig = (patch: Partial<EditableRules["config"]>) => setV((s) => ({ ...s, config: { ...s.config, ...patch } }));
  const setPolicy = (t: OpType, p: Policy) => setV((s) => ({ ...s, policies: { ...s.policies, [t]: p } }));
  const setLimit = (k: keyof EditableRules["limits"], n: number) => setV((s) => ({ ...s, limits: { ...s.limits, [k]: n } }));
  const chosen = templates.find((t) => t.id === template);

  const loadTemplate = () => {
    if (!chosen) return;
    if ((v.policy_text.trim() || v.config.delicateGlobs.length) && !window.confirm(`Reemplaza la política y las zonas del código por las de ${chosen.label}. Los límites y lo que se aprueba por tipo de cambio quedan igual. ¿Seguimos?`)) return;
    setV((s) => ({
      ...s,
      policy_text: chosen.policy_text,
      config: { ...structuredClone(chosen.config), priceWarnPct: s.config.priceWarnPct, depositPct: s.config.depositPct },
    }));
    toast.message(`Plantilla ${chosen.label} cargada: revisala y guardá.`);
  };

  const save = () =>
    start(async () => {
      const r = await saveRules(project.id, v);
      if (!r.ok) return void toast.error(r.error);
      if (r.demo) return void toast.warning(r.message);
      setSaved({ version: r.data!.version, at: r.data!.at });
      toast.success(r.message ?? `Versión ${r.data!.version}, vigente desde ${clock(r.data!.at)}`);
      router.refresh();
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <Surface className="flex min-w-0 flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">
              versión {saved.version || "—"}
              {saved.at && <span className="font-normal text-muted-foreground">, vigente desde {dateTime(saved.at)}</span>}
            </div>
            <p className="text-sm text-muted-foreground">Guardar crea una versión nueva; el worker la usa desde el próximo pedido.</p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {dirty && (
                <Button type="button" variant="outline" size="lg" onClick={() => setV(initial)} disabled={pending}>
                  <RotateCcw /> Descartar
                </Button>
              )}
              <Button type="button" size="lg" className="px-3.5" disabled={!dirty || pending} onClick={save}>
                {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar versión nueva
              </Button>
            </div>
          )}
        </div>
        {!canEdit && (
          <Notice tone="info">
            Con el rol {roleLabel} podés usar el simulador, pero no cambiar las reglas.
          </Notice>
        )}
        {!structured && (
          <Notice tone="warn">
            La política en texto, las zonas del código, lo que siempre es algo nuevo y las advertencias se guardan con la migración 0004. Mientras tanto el simulador ya las usa.
          </Notice>
        )}

        <Section
          title="Plantilla del stack"
          description="Para arrancar: carga una política y zonas delicadas típicas de ese stack. Después las ajustás."
          right={chosen && chosen.id === v.config.template ? <Chip tone="muted">en uso</Chip> : null}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              aria-label="Plantilla"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              disabled={!canEdit}
              className="h-9 rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50 sm:w-64"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="lg" onClick={loadTemplate} disabled={!canEdit}>
              Cargar plantilla
            </Button>
          </div>
          {chosen && <p className="-mt-1 text-xs text-muted-foreground">{chosen.description}</p>}
        </Section>

        <Section
          title="Política de la agencia"
          description="En tus palabras: qué es simple, qué es delicado y qué es algo nuevo en este proyecto. Entra al prompt del agente de decisión."
          right={<span className="text-xs text-muted-foreground tnum">{v.policy_text.length}/8000</span>}
        >
          <Textarea
            aria-label="Política de la agencia"
            rows={6}
            maxLength={8000}
            value={v.policy_text}
            disabled={lockR1}
            onChange={(e) => setV((s) => ({ ...s, policy_text: e.target.value }))}
            placeholder="Es simple todo lo visible… Es delicado lo que toca la base de datos… Es algo nuevo integrar pagos…"
            className="field-sizing-fixed resize-y bg-surface text-sm leading-relaxed"
          />
        </Section>

        <Section
          title="Zonas del código"
          description="Globs de rutas, uno por línea. Después de que el agente arma el cambio, el código mira el diff: si toca una zona delicada, el pedido sube a delicado. Nunca baja solo."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <LinesField
              id="delicate"
              label="Delicadas"
              value={v.config.delicateGlobs}
              onChange={(x) => setConfig({ delicateGlobs: x })}
              disabled={lockR1}
              placeholder={"app/api/**\nsupabase/**"}
              hint="Las revisa la agencia antes de publicar."
            />
            <LinesField
              id="protected"
              label="Protegidas"
              value={v.config.protectedGlobs}
              onChange={(x) => setConfig({ protectedGlobs: x })}
              disabled={lockR1}
              placeholder={"content/legal/**"}
              hint="El agente no puede ni leerlas ni tocarlas."
            />
            <LinesField
              id="simple"
              label="Simples"
              value={v.config.simpleGlobs}
              onChange={(x) => setConfig({ simpleGlobs: x })}
              disabled={lockR1}
              placeholder={"app/api/contacto/**"}
              hint="Excepciones a las delicadas (nunca a las de siempre)."
            />
          </div>
          <details className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Siempre delicado, en cualquier proyecto <span className="text-xs text-faint tnum">({alwaysDelicate.length})</span>
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">Base de datos, secretos y .env, dependencias, CI, infraestructura, login y permisos. No se puede apagar.</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {alwaysDelicate.map((g) => (
                <Mono key={g} className="rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {g}
                </Mono>
              ))}
            </div>
          </details>
        </Section>

        <Section title="Siempre es algo nuevo" description="Pedidos que van a presupuesto aunque parezcan chicos. Uno por línea, en tus palabras: van al prompt de decisión.">
          <LinesField
            id="always-new"
            label="Pedidos"
            mono={false}
            rows={4}
            value={v.config.alwaysNew}
            onChange={(x) => setConfig({ alwaysNew: x })}
            disabled={lockR1}
            placeholder={"integrar Mercado Pago\nun sistema de turnos"}
          />
        </Section>

        <Section title="Advertencias en la vista previa" description="No mandan nada a la agencia: el cliente las ve junto al «¿Así?» antes de darle el OK.">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField
              label="Cambio de precio"
              suffix="%"
              hint="Si un precio cambia más que esto, la vista previa lo avisa («la masa madre baja de $220 a $95»)."
              value={priceWarn}
              min={1}
              max={1000}
              disabled={lockR1}
              onChange={(n) => setV((s) => ({ ...s, config: { ...s.config, priceWarnPct: n }, limits: { ...s.limits, maxPriceChangePct: n } }))}
            />
            <NumField
              label="Seña de los presupuestos"
              suffix="%"
              hint="Lo que el cliente paga con el link al aceptar algo nuevo."
              value={v.config.depositPct ?? 50}
              min={0}
              max={100}
              disabled={lockR1}
              onChange={(n) => setConfig({ depositPct: n })}
            />
          </div>
        </Section>

        <Section title="Por tipo de cambio de contenido" description="Delicado: lo aprueba la agencia antes que el cliente. Bloqueado: no se hace nunca.">
          <ul className="flex flex-col overflow-hidden rounded-lg border border-line">
            {OP_TYPES.map((t) => (
              <li key={t} className="flex flex-col gap-2 border-b border-line bg-surface-2 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">{OP_LABEL[t]}</div>
                  <code className="font-mono text-[11px] text-faint">{t}</code>
                </div>
                <div role="radiogroup" aria-label={OP_LABEL[t]} className="flex gap-0.5 self-start rounded-lg border border-line bg-surface p-0.5 sm:self-auto">
                  {POLICIES.map((p) => {
                    const on = v.policies[t] === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={!canEdit}
                        onClick={() => setPolicy(t, p.value)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                          on ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {on && <span className={cn("size-1.5 rounded-full", toneDot[POLICY_TONE[p.value]])} />}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Límites">
          <div className="grid gap-3 sm:grid-cols-3">
            <NumField label="Cupo del mes" suffix="cambios" hint="Cambios simples publicados por mes; pasado el cupo, lo aprueba la agencia." value={v.limits.monthlyQuota} min={0} max={100000} disabled={!canEdit} onChange={(n) => setLimit("monthlyQuota", n)} />
            <NumField
              label="Confianza mínima"
              suffix="%"
              hint="Con menos, el cliente ve «revisalo bien» o Walt le pregunta."
              value={Math.round(v.limits.minConfidence * 100)}
              min={0}
              max={100}
              disabled={!canEdit}
              onChange={(n) => setLimit("minConfidence", n / 100)}
            />
            <NumField label="Operaciones por pedido" suffix="máx." hint="Con más, la vista previa lo avisa." value={v.limits.maxOpsPerRequest} min={1} max={500} disabled={!canEdit} onChange={(n) => setLimit("maxOpsPerRequest", n)} />
          </div>
        </Section>
      </Surface>

      <div className="flex min-w-0 flex-col gap-6">
        <Simulator projectId={project.id} rules={v} />
        {aside}
        <Surface className="p-5">
          <PanelTitle>Versiones</PanelTitle>
          <ol className="mt-3 flex flex-col">
            {versions.length === 0 && <li className="text-sm text-muted-foreground">Sin versiones: se usan las reglas por defecto.</li>}
            {versions.map((x, i) => (
              <li key={x.id} className="flex items-start justify-between gap-3 border-b border-line py-2.5 text-sm last:border-0">
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                    versión {x.version} {i === 0 && <Chip tone="ok">vigente</Chip>}
                    {x.editable.policy_text && <Chip>con política</Chip>}
                  </span>
                  <Mono className="mt-1 block truncate text-xs text-muted-foreground">
                    {dateTime(x.created_at)} · {x.created_by ?? "—"} · {templates.find((t) => t.id === x.editable.config.template)?.label ?? x.editable.config.template}
                  </Mono>
                </div>
                {i > 0 && canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setV(structuredClone(x.editable));
                      toast.message(`Versión ${x.version} cargada en el editor: guardala para volver a usarla.`);
                    }}
                    className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Cargar
                  </button>
                )}
              </li>
            ))}
          </ol>
        </Surface>
      </div>
    </div>
  );
}
