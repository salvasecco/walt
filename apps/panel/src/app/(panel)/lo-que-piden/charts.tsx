"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Barras horizontales de una sola serie: un solo color, etiqueta directa del valor y tooltip. */
export function HBar({ data, unit }: { data: { name: string; value: number }[]; unit: string }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <div className="mt-4" style={{ height: Math.max(140, sorted.length * 40 + 10) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" dataKey="value" hide allowDecimals={false} domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="name" width={170} tickLine={false} axisLine={false} tick={{ fill: "#a1a1aa", fontSize: 13 }} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ededed", fontSize: 12 }}
            itemStyle={{ color: "#ededed" }}
            formatter={(v) => [`${v} ${unit}`, ""]}
            separator=""
          />
          <Bar dataKey="value" fill="var(--walt-info)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive animationDuration={250}>
            <LabelList dataKey="value" position="right" fill="#ededed" fontSize={12} className="tnum" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
