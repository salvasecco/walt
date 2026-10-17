"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { login } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm({ desde }: { desde: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="desde" value={desde} />
      <label htmlFor="password" className="text-sm font-medium">
        Contraseña
      </label>
      <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="h-10 text-base" />
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-2 h-10">
        {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        Entrar
      </Button>
    </form>
  );
}
