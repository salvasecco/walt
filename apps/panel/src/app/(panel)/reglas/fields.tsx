"use client";

import type { ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Lista de una línea por ítem (globs o descripciones), con contador. Guarda el texto tal cual; se limpia al guardar. */
export function LinesField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
  mono = true,
  rows = 5,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
  rows?: number;
}) {
  const count = value.filter((x) => x.trim()).length;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-xs text-muted-foreground tnum">{count}</span>
      </div>
      <Textarea
        id={id}
        rows={rows}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={!mono}
        className={cn("field-sizing-fixed max-h-64 resize-y bg-surface", mono ? "font-mono text-xs leading-5 md:text-xs" : "text-sm")}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NumField({
  label,
  suffix,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  suffix: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2 p-4">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-baseline gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 rounded-md border border-input bg-surface px-2 py-1 text-xl font-semibold tnum outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

/** Sección del formulario: título chico, una línea de explicación y el contenido. */
export function Section({ title, description, right, children, className }: { title: string; description?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 border-t border-line pt-5 first:border-0 first:pt-0", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
