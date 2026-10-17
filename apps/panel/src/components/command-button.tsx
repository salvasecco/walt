"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { sendCommand } from "@/app/actions";
import type { CommandType } from "@/lib/types";
import { cn } from "@/lib/utils";

const VARIANT = {
  approve: "bg-emerald-neon text-[#03140D] shadow-[0_0_24px_-8px_rgba(52,211,153,0.9)] hover:brightness-110",
  reject: "border border-rose-neon/50 text-rose-neon hover:bg-rose-neon/10",
  primary: "bg-cyan-neon text-[#031016] shadow-[0_0_24px_-8px_rgba(34,211,238,0.9)] hover:brightness-110",
  ghost: "border border-white/15 text-foreground hover:bg-white/5",
};

/** Botón que inserta un comando en `commands` (SPEC §9). */
export function CommandButton({
  type,
  requestId,
  payload,
  children,
  variant = "ghost",
  confirm,
  className,
}: {
  type: CommandType;
  requestId: string | null;
  payload?: Record<string, unknown>;
  children: ReactNode;
  variant?: keyof typeof VARIANT;
  confirm?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await sendCommand(type, requestId, payload);
          if (!r.ok) toast.error(r.error);
          else if (r.demo) toast.warning(r.message);
          else {
            toast.success(r.message ?? "Listo");
            router.refresh();
          }
        });
      }}
      className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:opacity-60", VARIANT[variant], className)}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
