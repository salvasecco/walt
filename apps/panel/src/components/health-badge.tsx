"use client";

import { DotLabel } from "@/components/ui-dale";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HEALTH_LABEL, HEALTH_RULE, type Health } from "@/lib/client-health";
import type { Tone } from "@/lib/labels";

const TONE: Record<Health["level"], Tone> = { verde: "ok", ambar: "warn", rojo: "danger" };

/** Salud del cliente con un punto de color; el tooltip dice por qué y la regla completa. */
export function HealthBadge({ health }: { health: Health }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className="cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />}>
        <DotLabel tone={TONE[health.level]}>{HEALTH_LABEL[health.level]}</DotLabel>
      </TooltipTrigger>
      <TooltipContent className="flex max-w-xs flex-col items-start gap-1.5 py-2 text-left">
        {health.reasons.length > 0 ? (
          <ul className="flex flex-col gap-0.5 font-medium">
            {health.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <span className="font-medium">Nada pendiente, cupo holgado y actividad reciente.</span>
        )}
        <span className="flex flex-col gap-0.5 opacity-70">
          {HEALTH_RULE.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
