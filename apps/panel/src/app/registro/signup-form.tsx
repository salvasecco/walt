"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { signUp } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  if (state?.ok)
    return (
      <p role="status" className="rounded-lg border border-ok/25 bg-ok/10 p-3 text-sm text-foreground/90">
        {state.ok}
      </p>
    );
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field id="agency" label="Nombre de la agencia">
        <Input id="agency" name="agency" required minLength={2} maxLength={80} autoComplete="organization" className="h-10 text-base" />
      </Field>
      <Field id="name" label="Tu nombre">
        <Input id="name" name="name" maxLength={80} autoComplete="name" className="h-10 text-base" />
      </Field>
      <Field id="email" label="Mail">
        <Input id="email" name="email" type="email" required autoComplete="email" className="h-10 text-base" />
      </Field>
      <Field id="password" label="Contraseña" hint="Al menos 8 caracteres.">
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="h-10 text-base" />
      </Field>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-1 h-10">
        {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        Crear la cuenta
      </Button>
      <p className="text-xs text-muted-foreground">Quedás como dueño de la agencia. Después sumás a tu equipo desde Equipo.</p>
    </form>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
