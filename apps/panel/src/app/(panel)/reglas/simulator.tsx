"use client";

import { AlertTriangle, ArrowRight, FlaskConical, HelpCircle, Loader2, MessageCircleQuestion, Route, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { checkPaths, simulateRules } from "@/app/rules-actions";
import { CategoryChip, Chip, Mono, PanelTitle, Surface } from "@/components/ui-walt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_HELP } from "@/lib/labels";
import type { SimulationResult } from "@/lib/simulate";
import type { EditableRules } from "@/lib/types";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "subí los panes a 95",
  "agregá un formulario para reservar tortas",
  "guardá cada reserva en la base de datos",
  "quiero cobrar las reservas con Mercado Pago",
];

type PathCheck = { path: string; zone: string; glob: string | null; reason: string };

const ZONE: Record<string, { label: string; tone: "danger" | "warn" | "ok" }> = {
  protegido: { label: "protegido", tone: "danger" },
  base: { label: "siempre delicado", tone: "warn" },
  agencia: { label: "delicado", tone: "warn" },
  simple: { label: "simple", tone: "ok" },
};

/** Simulador: cómo clasificaría Walt un pedido con las reglas en edición, sin guardar nada ni mandar mensajes. */
export function Simulator({ projectId, rules }: { projectId: string; rules: EditableRules }) {
  const [text, setText] = useState("");
  const [paths, setPaths] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [checked, setChecked] = useState<PathCheck[] | null>(null);
  const [pending, start] = useTransition();
  const pathList = paths.split("\n").map((p) => p.trim()).filter(Boolean);

  const run = (t = text) =>
    start(async () => {
      setChecked(null);
      const r = await simulateRules({ projectId, text: t, rules, paths: pathList });
      if (!r.ok) return void toast.error(r.error);
      setResult(r.data!);
    });

  const onlyPaths = () =>
    start(async () => {
      const r = await checkPaths({ paths: pathList, rules });
      if (!r.ok) return void toast.error(r.error);
      setResult(null);
      setChecked(r.data!);
    });

  return (
    <Surface className="flex flex-col gap-4 p-4 sm:p-5">
      <PanelTitle icon={<FlaskConical />} right={<span className="text-xs text-muted-foreground">con las reglas en edición</span>}>
        Simulador
      </PanelTitle>
      <p className="-mt-1 text-sm text-muted-foreground">Pegá un pedido como lo mandaría el cliente y mirá cómo lo clasificaría Walt y por qué. No se guarda nada ni se le escribe a nadie.</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run();
        }}
      >
        <label htmlFor="sim-text" className="sr-only">
          Pedido
        </label>
        <Textarea
          id="sim-text"
          rows={3}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej.: subí los panes a 95"
          className="field-sizing-fixed resize-y bg-surface text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button
              key={x}
              type="button"
              disabled={pending}
              onClick={() => {
                setText(x);
                run(x);
              }}
              className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {x}
            </button>
          ))}
        </div>
        <details className="group rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <Route className="size-3.5" /> Archivos que tocaría el cambio <span className="text-xs text-faint">(opcional)</span>
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">Uno por línea. Es la mitad determinística de la doble clasificación: si el diff toca una zona delicada, el pedido sube a delicado.</p>
          <Textarea
            aria-label="Archivos que tocaría el cambio, uno por línea"
            rows={3}
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
            placeholder={"app/api/reservas/route.ts\ncomponents/Footer.tsx"}
            spellCheck={false}
            className="field-sizing-fixed mt-2 resize-y bg-surface font-mono text-xs md:text-xs"
          />
          <Button type="button" variant="outline" size="sm" className="mt-2" disabled={pending || !pathList.length} onClick={onlyPaths}>
            Ver solo las rutas
          </Button>
        </details>
        <Button type="submit" size="lg" disabled={pending || !text.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          {pending ? "Clasificando…" : "Simular"}
        </Button>
      </form>
      <div aria-live="polite" className="flex flex-col gap-4">
        {result && <SimulationCard r={result} />}
        {checked && <PathsList items={checked} />}
      </div>
    </Surface>
  );
}

function SimulationCard({ r }: { r: SimulationResult }) {
  const ReasonIcon = r.category === "bloqueado" ? ShieldX : r.category === "delicado" || r.category === "derivado" ? ShieldAlert : ShieldCheck;
  const reasonTone = r.category === "bloqueado" ? "text-danger" : r.category === "delicado" || r.category === "derivado" ? "text-warn" : "text-ok";
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip category={r.category} className="h-6 px-2 text-xs" />
        {r.lane && <Chip tone={r.lane === "codigo" ? "code" : "muted"}>Carril de {r.lane === "codigo" ? "código" : "contenido"}</Chip>}
        {r.raisedByPaths && <Chip tone="warn">subió por las rutas</Chip>}
        <span className="ml-auto text-xs text-muted-foreground tnum">Confianza {Math.round(r.confidence * 100)}%</span>
      </div>
      <div>
        <p className="text-sm font-medium">{r.summary}</p>
        {r.why && <p className="mt-1 text-sm text-muted-foreground">La IA: “{r.why}”</p>}
      </div>

      <Block title="Por qué">
        <ul className="flex flex-col gap-1.5">
          {(r.reasons.length ? r.reasons : [CATEGORY_HELP[r.category]]).map((x) => (
            <li key={x} className="flex items-start gap-2 text-sm">
              <ReasonIcon className={cn("mt-0.5 size-4 shrink-0", reasonTone)} />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </Block>

      {r.clarify && (
        <Block title="Qué haría">
          <p className="flex items-start gap-2 text-sm">
            <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-info" />
            <span>{r.question ? `Le preguntaría al cliente: “${r.question}”` : "Le pediría al cliente que lo explique mejor, con opciones."}</span>
          </p>
        </Block>
      )}

      {r.ops.length > 0 && (
        <Block title="Lo que haría">
          <ul className="flex flex-col gap-1">
            {r.ops.map((x, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-faint" />
                {x}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {r.needsCode && r.codeInstruction && (
        <Block title="Ficha para el agente">
          <p className="text-sm">{r.codeInstruction}</p>
        </Block>
      )}

      {r.changes.length > 0 && (
        <Block title="Antes y después">
          <ul className="flex flex-col gap-1">
            {r.changes.map((c, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className="truncate text-muted-foreground">{c.label}</span>
                <span className="flex items-center gap-1.5 tnum">
                  <span className="text-muted-foreground line-through decoration-danger/60">{c.before}</span>
                  <ArrowRight className="size-3 text-faint" />
                  <span className="font-medium text-ok">{c.after}</span>
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {r.warnings.length > 0 && (
        <Block title="Advertencias en la vista previa">
          <ul className="flex flex-col gap-1.5">
            {r.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {r.paths.length > 0 && <PathsList items={r.paths.map((p) => ({ path: p.path, zone: p.zone, glob: p.glob, reason: p.reason }))} />}

      {r.notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {r.notes.map((n) => (
            <li key={n} className="flex items-start gap-1.5">
              <HelpCircle className="mt-0.5 size-3 shrink-0" />
              {n}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 font-mono text-[11px] text-faint tnum">
        <span>{r.provider === "fake" ? "IA de prueba" : r.model}</span>
        <span>USD {r.costUsd.toFixed(4)}</span>
        <span>{(r.ms / 1000).toFixed(1)} s</span>
        <span>
          {r.examples} {r.examples === 1 ? "ejemplo reetiquetado" : "ejemplos reetiquetados"}
        </span>
        <span>contrato: {r.contract === "repo" ? "del repo" : r.contract === "ejemplo" ? "de ejemplo" : "sin contrato"}</span>
      </div>
    </div>
  );
}

function PathsList({ items }: { items: PathCheck[] }) {
  return (
    <Block title="Rutas">
      <ul className="flex flex-col gap-1.5">
        {items.map((p) => {
          const z = ZONE[p.zone] ?? ZONE.agencia;
          return (
            <li key={p.path} className="flex flex-col gap-0.5 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <Mono className="text-xs break-all">{p.path}</Mono>
                <Chip tone={z.tone}>{z.label}</Chip>
              </span>
              <span className="text-xs text-muted-foreground">{p.reason}</span>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="label-xs">{title}</h3>
      {children}
    </section>
  );
}
