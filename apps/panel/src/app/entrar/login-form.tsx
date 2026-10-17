"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { login } from "@/app/actions";
import { Input } from "@/components/ui/input";

export function LoginForm({ desde }: { desde: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="desde" value={desde} />
      <label htmlFor="password" className="label-xs">
        Contraseña
      </label>
      <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="h-11 text-base" />
      {state?.error && (
        <p role="alert" className="text-sm text-rose-neon">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-neon font-medium text-[#031016] shadow-[0_0_30px_-8px_rgba(34,211,238,0.9)] transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        Entrar
      </button>
    </form>
  );
}
