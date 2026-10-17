import type { ReactNode } from "react";
import { AlertTriangle, Database, Inbox } from "lucide-react";
import { CATEGORY_LABEL, CATEGORY_TONE, STATUS_LABEL, STATUS_TONE, type Tone, toneChip } from "@/lib/labels";
import type { Category, RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Glass({ className, hi, children, ...rest }: { className?: string; hi?: boolean; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass rounded-2xl", hi && "glass-hi", className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelTitle({ icon, children, right, className }: { icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="label-xs flex items-center gap-2">
        {icon}
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Chip({ tone = "muted", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", toneChip[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function CategoryChip({ category, className }: { category: Category | null; className?: string }) {
  if (!category) return <Chip className={className}>Sin decidir</Chip>;
  return (
    <Chip tone={CATEGORY_TONE[category]} className={className} dot>
      {CATEGORY_LABEL[category]}
    </Chip>
  );
}

export function StatusChip({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <Chip tone={STATUS_TONE[status]} className={className}>
      {STATUS_LABEL[status]}
    </Chip>
  );
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-amber-neon/50 bg-amber-neon/10 px-2 py-1 font-mono text-[11px] font-semibold tracking-wider text-amber-neon uppercase",
        className,
      )}
      title="No hay Supabase configurado: el panel muestra datos inventados para desarrollar. En producción nunca se muestran."
    >
      <Database className="size-3.5" />
      datos de ejemplo
    </span>
  );
}

export function EmptyState({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center", className)}>
      <div className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-base font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorState({ title = "Algo falló", children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-neon/30 bg-rose-neon/5 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full border border-rose-neon/40 text-rose-neon">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-base font-medium">{title}</p>
      {children && <div className="max-w-lg text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono tnum", className)}>{children}</span>;
}
