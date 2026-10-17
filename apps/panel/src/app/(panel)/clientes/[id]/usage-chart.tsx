"use client";

import { useState } from "react";
import type { MonthUsage } from "@/lib/client-health";
import { cn } from "@/lib/utils";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const monthLabel = (key: string) => MONTHS[Number(key.slice(5)) - 1] ?? key;

const W = 320;
const H = 140;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

/**
 * Barras por mes de una sola serie (sin leyenda: el título la nombra), con tooltip al pasar
 * y, si se pasa `reference`, una línea punteada (el cupo). Una medida por gráfico: nunca dos ejes.
 */
function Bars({
  title,
  data,
  value,
  format,
  reference,
  referenceLabel,
  barClass,
}: {
  title: string;
  data: MonthUsage[];
  value: (m: MonthUsage) => number;
  format: (n: number) => string;
  reference?: number;
  referenceLabel?: string;
  barClass: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1e-9, reference ?? 0, ...data.map(value)) * 1.1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const barW = Math.min(28, slot - 8);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const current = data[data.length - 1];
  const shown = hover != null ? data[hover] : current;
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="label-xs">{title}</span>
        {shown && (
          <span className="text-sm tnum">
            {format(value(shown))} <span className="text-xs text-muted-foreground">{monthLabel(shown.month)}</span>
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}: ${data.map((m) => `${monthLabel(m.month)} ${format(value(m))}`).join(", ")}`}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="stroke-line-strong" strokeWidth={1} />
        {reference != null && reference > 0 && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(reference)} y2={y(reference)} className="stroke-warn/60" strokeWidth={1} strokeDasharray="3 3" />
            <text x={W - PAD.right} y={y(reference) - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {referenceLabel}
            </text>
          </g>
        )}
        {data.map((m, i) => {
          const v = value(m);
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const top = y(v);
          const h = Math.max(0, y(0) - top);
          const r = Math.min(4, h);
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Área de hover más grande que la barra. */}
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`}
                  className={cn(barClass, "transition-opacity", hover != null && hover !== i && "opacity-40")}
                />
              )}
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" className={cn("text-[10px]", i === data.length - 1 ? "fill-foreground" : "fill-muted-foreground")}>
                {monthLabel(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function UsageCharts({ usage, quota }: { usage: MonthUsage[]; quota: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Bars title="Cambios por mes" data={usage} value={(m) => m.changes} format={(n) => String(n)} reference={quota} referenceLabel={`cupo ${quota}`} barClass="fill-foreground/70" />
      <Bars title="Costo de IA por mes" data={usage} value={(m) => m.cost} format={(n) => `USD ${n.toFixed(2)}`} barClass="fill-code/80" />
    </div>
  );
}
