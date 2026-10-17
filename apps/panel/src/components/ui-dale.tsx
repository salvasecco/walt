import type { ReactNode } from "react";
import { AlertTriangle, Database, Inbox } from "lucide-react";
import { CATEGORY_LABEL, CATEGORY_TONE, STATUS_LABEL, STATUS_TONE, type Tone, toneChip, toneDot } from "@/lib/labels";
import type { Category, RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Tarjeta plana: superficie de nivel 1 con borde de 1px. */
export function Surface({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelTitle({ icon, children, right, className }: { icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="label-xs flex items-center gap-2 [&_svg]:size-3.5 [&_svg]:text-faint">
        {icon}
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Chip({ tone = "muted", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-md border px-1.5 text-[11px] leading-none font-medium whitespace-nowrap", toneChip[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", toneDot[tone])} />}
      {children}
    </span>
  );
}

/** Estado en neutro con un punto de color: el color queda para la categoría. */
export function DotLabel({ tone = "muted", children, className, pulse }: { tone?: Tone; children: ReactNode; className?: string; pulse?: boolean }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-1.5 text-[11px] leading-none font-medium whitespace-nowrap text-foreground/85", className)}>
      <span className="relative flex size-1.5">
        {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-50 [animation-duration:2s]", toneDot[tone])} />}
        <span className={cn("relative inline-flex size-1.5 rounded-full", toneDot[tone])} />
      </span>
      {children}
    </span>
  );
}

export function CategoryChip({ category, className }: { category: Category | null; className?: string }) {
  if (!category) return <Chip className={className}>Sin decidir</Chip>;
  return (
    <Chip tone={CATEGORY_TONE[category]} className={className}>
      {CATEGORY_LABEL[category]}
    </Chip>
  );
}

export function StatusChip({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <DotLabel tone={STATUS_TONE[status]} className={className}>
      {STATUS_LABEL[status]}
    </DotLabel>
  );
}

/** Id corto del pedido (#5FEQCP): monospace, gris. */
export function IdTag({ id, className }: { id: string; className?: string }) {
  return <span className={cn("inline-flex h-5 items-center rounded-md border border-line bg-surface-2 px-1.5 font-mono text-[11px] text-muted-foreground", className)}>#{id}</span>;
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex h-5 items-center gap-1.5 rounded-md border border-warn/30 bg-warn/10 px-1.5 text-[11px] font-medium tracking-wide text-warn uppercase", className)}
      title="No hay Supabase configurado: el panel muestra datos inventados para desarrollar. En producción nunca se muestran."
    >
      <Database className="size-3" />
      datos de ejemplo
    </span>
  );
}

export function EmptyState({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-14 text-center", className)}>
      <div className="grid size-10 place-items-center rounded-lg border border-line bg-surface-2 text-muted-foreground [&_svg]:size-4">{icon ?? <Inbox />}</div>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorState({ title = "Algo falló", children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-danger/25 bg-danger/[0.04] px-6 py-14 text-center">
      <div className="grid size-10 place-items-center rounded-lg border border-danger/30 text-danger">
        <AlertTriangle className="size-4" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-lg text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

/** Banda de aviso: borde fino del tono y fondo muy oscuro. */
export function Notice({ tone = "warn", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0", toneChip[tone], className)}>
      {icon}
      <div className="min-w-0 text-foreground/90">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono tnum", className)}>{children}</span>;
}
