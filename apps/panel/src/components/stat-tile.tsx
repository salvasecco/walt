"use client";

import type { ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Surface } from "@/components/ui-dale";
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
      <div className="text-3xl leading-tight font-semibold tracking-tight whitespace-nowrap tnum sm:text-4xl">{value}</div>
      <div className="flex min-h-9 items-end justify-between gap-3">
        {context && <div className="min-w-0 truncate pb-0.5 text-xs text-muted-foreground sm:text-[13px]">{context}</div>}
        {showTrend && <Sparkline data={trend!} label={trendLabel} />}
      </div>
    </Surface>
  );
}

function Sparkline({ data, label }: { data: number[]; label?: string }) {
  const points = data.map((v, i) => ({ i, v }));
  const last = points.length - 1;
  return (
    <div className="h-9 w-24 shrink-0 sm:w-28" role="img" aria-label={label} title={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={[0, "dataMax"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke="var(--dale-faint)"
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === last && p.cx != null && p.cy != null ? (
                <circle key="last" cx={p.cx} cy={p.cy} r={2.5} fill="var(--dale-info)" stroke="var(--dale-surface)" strokeWidth={1.5} />
              ) : (
                <g key={p.index} />
              )
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
