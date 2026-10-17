"use client";

import type { ReactNode } from "react";
import { Surface } from "@/components/ui-walt";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Indicador plano: etiqueta chica en mayúsculas, número grande en sans, línea de contexto en gris
 * y, si hay datos, una sparkline fina gris con el último punto en color.
 */
export function StatTile({
  label,
  help,
  value,
  context,
  trend,
  trendLabel,
  className,
}: {
  label: string;
  help?: string;
  value: ReactNode;
  context?: ReactNode;
  trend?: number[];
  trendLabel?: string;
  className?: string;
}) {
  const showTrend = !!trend && trend.length >= 2 && trend.some((v) => v > 0);
  return (
    <Surface className={cn("flex flex-col gap-1 p-4 sm:p-5", className)}>
      <div className="flex items-center gap-1.5">
        <span className="label-xs truncate">{label}</span>
        {help && (
          <Tooltip>
            <TooltipTrigger className="text-faint transition-colors hover:text-muted-foreground" aria-label={`Qué es: ${label}`}>
              <HelpCircle className="size-3" />
            </TooltipTrigger>
            <TooltipContent className="max-w-60">{help}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="text-2xl leading-tight font-semibold tracking-tight whitespace-nowrap tnum sm:text-4xl">{value}</div>
      <div className="flex min-h-9 items-end justify-between gap-3">
        {context && <div className="min-w-0 truncate pb-0.5 text-xs text-muted-foreground sm:text-[13px]">{context}</div>}
        {showTrend && <Sparkline data={trend!} label={trendLabel} />}
      </div>
    </Surface>
  );
}

const W = 80;
const H = 36;
const PAD = 4;

/** Sparkline fina en SVG plano (sin librería de gráficos: es un trazo y un punto). */
function Sparkline({ data, label }: { data: number[]; label?: string }) {
  const max = Math.max(...data) || 1;
  const step = (W - PAD * 2) / (data.length - 1);
  const pts = data.map((v, i) => [PAD + i * step, H - PAD - (v / max) * (H - PAD * 2)] as const);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="hidden shrink-0 sm:block" role="img" aria-label={label}>
      {label && <title>{label}</title>}
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--walt-faint)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} fill="var(--walt-info)" stroke="var(--walt-surface)" strokeWidth={1.5} />
    </svg>
  );
}
