"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { switchFactory } from "@/app/auth-actions";
import { cn } from "@/lib/utils";

/** Para quien es parte de más de una agencia: cambia la agencia activa (cookie) y recarga los datos. */
export function AgencySwitcher({ current, options, compact }: { current: string; options: { id: string; name: string }[]; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className={cn("flex min-w-0 flex-col gap-0.5 text-[11px] text-muted-foreground", compact && "max-w-40")}>
      {!compact && "Agencia"}
      <select
        value={current}
        disabled={pending}
        aria-label="Agencia"
        onChange={(e) =>
          start(async () => {
            const r = await switchFactory(e.target.value);
            if (!r.ok) toast.error(r.error);
            else router.refresh();
          })
        }
        className="h-8 w-full min-w-0 truncate rounded-md border border-input bg-surface px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
