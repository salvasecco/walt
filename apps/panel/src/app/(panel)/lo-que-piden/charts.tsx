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
          <YAxis type="category" dataKey="name" width={170} tickLine={false} axisLine={false} tick={{ fill: "#C8CEDB", fontSize: 13 }} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#0C0F18", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#E6E9F2" }}
            itemStyle={{ color: "#E6E9F2" }}
            formatter={(v) => [`${v} ${unit}`, ""]}
            separator=""
          />
          <Bar dataKey="value" fill="#22D3EE" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive>
            <LabelList dataKey="value" position="right" fill="#E6E9F2" fontSize={13} fontFamily="var(--font-geist-mono)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
