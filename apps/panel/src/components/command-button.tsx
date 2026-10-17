"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { sendCommand } from "@/app/actions";
import { buttonVariants } from "@/components/ui/button";
import type { CommandType } from "@/lib/types";
import { cn } from "@/lib/utils";

const VARIANT = {
  approve: buttonVariants({ variant: "default", size: "lg" }),
  reject: buttonVariants({ variant: "outline", size: "lg", className: "text-danger hover:bg-danger/10 hover:text-danger dark:hover:bg-danger/10" }),
  primary: buttonVariants({ variant: "default", size: "lg" }),
  ghost: buttonVariants({ variant: "outline", size: "lg" }),
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
      className={cn(VARIANT[variant], "px-3.5", className)}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
