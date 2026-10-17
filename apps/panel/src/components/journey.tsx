"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Brain,
  Camera,
  Check,
  CircleDashed,
  FileText,
  GitCommitHorizontal,
  GitPullRequest,
  Globe,
  Hourglass,
  Inbox,
  type LucideIcon,
  MessageCircleReply,
  Rocket,
  Scale,
  Send,
  ShieldCheck,
  Undo2,
  UserCheck,
  Users,
  X,
  Receipt,
  LifeBuoy,
  Eye,
} from "lucide-react";
import { STEP_LABEL, ms } from "@/lib/labels";
import type { JourneyNode, NodeState } from "@/lib/journey";
import { cn } from "@/lib/utils";

const ICON: Record<string, LucideIcon> = {
  recibido: Inbox,
  interpretado: Brain,
  decidido: Scale,
  gate: ShieldCheck,
  borrador: FileText,
  captura: Camera,
  enviado: Send,
  aprobado_cliente: UserCheck,
  aprobado_agencia: Users,
  publicado: Rocket,
  commit: GitCommitHorizontal,
  revertido: Undo2,
  derivado: LifeBuoy,
  agente_inicio: Bot,
  agente_pr: GitPullRequest,
  agente_preview: Eye,
  presupuesto: Receipt,
  respondido: MessageCircleReply,
  publicando: Globe,
};

const RING: Record<NodeState, string> = {
  pendiente: "border-white/10 bg-white/[0.02] text-white/25",
  omitido: "border-white/5 bg-transparent text-white/15",
  activo: "border-cyan-neon bg-cyan-neon/15 text-cyan-neon shadow-[0_0_24px_-2px_rgba(34,211,238,0.7)]",
  esperando: "border-amber-neon/80 bg-amber-neon/10 text-amber-neon shadow-[0_0_24px_-4px_rgba(251,191,36,0.6)]",
  ok: "border-emerald-neon/70 bg-emerald-neon/10 text-emerald-neon",
  falla: "border-rose-neon bg-rose-neon/15 text-rose-neon shadow-[0_0_24px_-4px_rgba(251,113,133,0.7)]",
};

const AI_STEPS = new Set(["interpretado", "presupuesto", "respondido", "agente_inicio"]);

type Props = {
  nodes: JourneyNode[];
  size?: "lg" | "md" | "sm";
  className?: string;
};

/** Recorrido de pasos de un pedido. Cada nodo se enciende con un pulso cuando llega su evento. */
export function Journey({ nodes, size = "md", className }: Props) {
  const reduce = useReducedMotion();
  const dim = size === "lg" ? "size-14" : size === "md" ? "size-11" : "size-8";
  const icon = size === "lg" ? "size-6" : size === "md" ? "size-5" : "size-4";
  const label = size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-[10px]";
  const doneCount = nodes.filter((n) => n.state === "ok").length;

  return (
    <div className={cn("scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1", className)} role="list" aria-label={`Recorrido: ${doneCount} de ${nodes.length} pasos`}>
      <div className="flex w-full min-w-max items-start">
        {nodes.map((n, i) => {
          const Icon = n.state === "falla" ? X : n.state === "esperando" ? Hourglass : (ICON[n.step] ?? CircleDashed);
          const isAI = AI_STEPS.has(n.step) && n.state === "ok";
          const next = nodes[i + 1];
          const lineOn = n.state === "ok" && next && next.state !== "pendiente" && next.state !== "omitido";
          return (
            <div key={n.step} role="listitem" className={cn("flex items-start", next && "flex-1")}>
              <div className={cn("flex flex-col items-center gap-2", size === "lg" ? "w-[92px]" : size === "md" ? "w-[76px]" : "w-[58px]")}>
                <div className="relative">
                  <AnimatePresence>
                    {(n.state === "ok" || n.state === "falla") && !reduce && (
                      <motion.span
                        key={`${n.step}-${n.state}-${n.at}`}
                        className={cn("absolute inset-0 rounded-full", n.state === "falla" ? "bg-rose-neon/40" : "bg-emerald-neon/40")}
                        initial={{ scale: 1, opacity: 0.8 }}
                        animate={{ scale: 2.2, opacity: 0 }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                      />
                    )}
                  </AnimatePresence>
                  {(n.state === "activo" || n.state === "esperando") && !reduce && (
                    <motion.span
                      className={cn("absolute inset-0 rounded-full", n.state === "activo" ? "bg-cyan-neon/30" : "bg-amber-neon/25")}
                      animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}
                  <motion.div
                    layout={false}
                    initial={false}
                    animate={{ scale: n.state === "ok" || n.state === "activo" ? 1 : 0.94 }}
                    className={cn(
                      "relative grid place-items-center rounded-full border transition-colors duration-500",
                      dim,
                      RING[n.state],
                      isAI && "border-violet-neon/70 bg-violet-neon/10 text-violet-neon",
                    )}
                  >
                    {n.state === "ok" && size !== "sm" && !isAI ? (
                      <Icon className={icon} strokeWidth={1.8} />
                    ) : (
                      <Icon className={cn(icon, n.state === "activo" && "animate-pulse")} strokeWidth={1.8} />
                    )}
                    {n.state === "ok" && size !== "sm" && (
                      <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-emerald-neon text-[#05060A]">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </motion.div>
                </div>
                <div className="flex flex-col items-center gap-0.5 text-center">
                  <span
                    className={cn(
                      "leading-tight font-medium",
                      label,
                      n.state === "pendiente" || n.state === "omitido" ? "text-white/30" : "text-foreground",
                      n.state === "falla" && "text-rose-neon",
                      n.state === "esperando" && "text-amber-neon",
                    )}
                  >
                    {STEP_LABEL[n.step] ?? n.step}
                  </span>
                  <span className={cn("font-mono tnum text-muted-foreground", size === "lg" ? "text-xs" : "text-[10px]")}>
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
                <div className={cn("relative h-0.5 min-w-3 flex-1 rounded-full bg-white/10", size === "lg" ? "mt-7" : size === "md" ? "mt-[22px]" : "mt-4")}>
                  <motion.div
                    className="absolute inset-y-0 left-0"
                    initial={false}
                    animate={{ width: lineOn ? "100%" : "0%" }}
                    transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
                    style={{ background: "linear-gradient(90deg, #34D399, #22D3EE)", boxShadow: "0 0 8px rgba(34,211,238,0.6)" }}
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
