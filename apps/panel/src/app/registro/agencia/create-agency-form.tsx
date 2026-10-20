"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, LogOut } from "lucide-react";
import { createMyAgency, logout } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateAgencyForm({ suggested }: { suggested: string }) {
  const [state, action, pending] = useActionState(createMyAgency, undefined);
  return (
    <>
      <form action={action} className="flex flex-col gap-3">
        <label htmlFor="agency" className="text-sm font-medium">
          Nombre de la agencia
        </label>
        <Input id="agency" name="agency" defaultValue={suggested} required minLength={2} maxLength={80} className="h-10 text-base" />
        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending} className="mt-1 h-10">
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          Crear y entrar
        </Button>
        <p className="text-xs text-muted-foreground">Si te invitaron a un equipo, pedile a quien te invitó que te sume de nuevo.</p>
      </form>
      <form action={logout}>
        <button className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <LogOut className="size-3.5" /> Salir
        </button>
      </form>
    </>
  );
}
