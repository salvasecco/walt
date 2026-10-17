"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";
import { STEP_LABEL, ms } from "@/lib/labels";
import type { JourneyNode, NodeState } from "@/lib/journey";
import { cn } from "@/lib/utils";

const NODE: Record<NodeState, string> = {
  pendiente: "border-line-strong bg-surface",
  omitido: "border-dashed border-line bg-transparent",
  activo: "border-info/70 bg-info/10",
  esperando: "border-warn/70 bg-warn/10",
  ok: "border-ok/45 bg-ok/10 text-ok",
  falla: "border-danger/60 bg-danger/10 text-danger",
};

const PULSE: Partial<Record<NodeState, string>> = { activo: "bg-info", esperando: "bg-warn" };

type Props = {
  nodes: JourneyNode[];
  size?: "lg" | "md" | "sm";
  className?: string;
};

/** Recorrido de pasos de un pedido: stepper horizontal compacto. Cada nodo se enciende cuando llega su evento. */
export function Journey({ nodes, size = "md", className }: Props) {
  const reduce = useReducedMotion();
  const dim = size === "lg" ? "size-[22px]" : size === "md" ? "size-5" : "size-4";
  const glyph = size === "sm" ? "size-2.5" : "size-3";
  const col = size === "lg" ? "w-[88px]" : size === "md" ? "w-[76px]" : "w-[58px]";
  const label = size === "lg" ? "text-[13px]" : size === "md" ? "text-xs" : "text-[10px]";
  const lineTop = size === "lg" ? "mt-[11px]" : size === "md" ? "mt-[10px]" : "mt-2";
  const doneCount = nodes.filter((n) => n.state === "ok").length;

  return (
    <div className={cn("scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1", className)} role="list" aria-label={`Recorrido: ${doneCount} de ${nodes.length} pasos`}>
      <div className="flex w-full min-w-max items-start">
        {nodes.map((n, i) => {
          const next = nodes[i + 1];
          const lineOn = n.state === "ok" && next && next.state !== "pendiente" && next.state !== "omitido";
          const muted = n.state === "pendiente" || n.state === "omitido";
          return (
            <div key={n.step} role="listitem" className={cn("flex items-start", next && "flex-1")}>
              <div className={cn("flex flex-col items-center gap-2", col)}>
                <motion.div
                  key={n.state}
                  initial={reduce ? false : { scale: 0.75, opacity: 0.4 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={cn("relative grid place-items-center rounded-full border transition-colors duration-200", dim, NODE[n.state])}
                >
                  {n.state === "ok" && <Check className={glyph} strokeWidth={2.5} />}
                  {n.state === "falla" && <X className={glyph} strokeWidth={2.5} />}
                  {PULSE[n.state] && (
                    <span className="relative flex size-1.5">
                      {!reduce && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60 [animation-duration:1.6s]", PULSE[n.state])} />}
                      <span className={cn("relative inline-flex size-1.5 rounded-full", PULSE[n.state])} />
                    </span>
                  )}
                </motion.div>
                <div className="flex flex-col items-center gap-0.5 text-center">
                  <span
                    className={cn(
                      "leading-tight font-medium",
                      label,
                      muted ? "text-faint" : "text-foreground/90",
                      n.state === "omitido" && "opacity-60",
                      n.state === "falla" && "text-danger",
                    )}
                  >
                    {STEP_LABEL[n.step] ?? n.step}
                  </span>
                  <span className={cn("font-mono tnum", size === "lg" ? "text-[11px]" : "text-[10px]", n.state === "activo" ? "text-info" : n.state === "esperando" ? "text-warn" : "text-faint")}>
                    {n.state === "ok" || n.state === "falla"
                      ? ms(n.durationMs)
                      : n.state === "activo"
                        ? "en curso"
                        : n.state === "esperando"
                          ? "esperando"
                          : " "}
                  </span>
                </div>
              </div>
              {next && (
                <div className={cn("relative h-px min-w-3 flex-1 bg-line-strong", lineTop)}>
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-ok/60"
                    initial={false}
                    animate={{ width: lineOn ? "100%" : "0%" }}
                    transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
