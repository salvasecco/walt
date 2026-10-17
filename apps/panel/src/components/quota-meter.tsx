import { cn } from "@/lib/utils";

/** Cambios usados del cupo del mes: número y una barra fina. Ámbar desde el 80%, rojo al pasarse. */
export function QuotaMeter({ used, quota, className }: { used: number; quota: number; className?: string }) {
  const pct = quota > 0 ? Math.min(1, used / quota) : used > 0 ? 1 : 0;
  const over = used > quota;
  const tone = over ? "bg-danger" : quota > 0 && used / quota >= 0.8 ? "bg-warn" : "bg-foreground/50";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm tnum">
        {used} <span className="text-muted-foreground">de {quota}</span>
      </span>
      <span
        className="h-1 w-full max-w-32 overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-valuenow={used}
        aria-label={`${used} de ${quota} cambios del mes`}
      >
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${pct * 100}%` }} />
      </span>
    </div>
  );
}
