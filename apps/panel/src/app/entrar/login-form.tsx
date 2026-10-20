"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { loginWithEmail, loginWithPassword, sendMagicLink, type FormState } from "@/app/auth-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Status({ state }: { state: FormState }) {
  if (state?.error)
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="rounded-lg border border-ok/25 bg-ok/10 p-3 text-sm text-foreground/90">
        {state.ok}
      </p>
    );
  return null;
}

/** Contraseña del panel: una sola agencia (sin 0004) o acceso de emergencia. */
export function PasswordForm({ desde, className }: { desde: string; className?: string }) {
  const [state, action, pending] = useActionState(loginWithPassword, undefined);
  return (
    <form action={action} className={cn("flex flex-col gap-3", className)}>
      <input type="hidden" name="desde" value={desde} />
      <label htmlFor="password" className="text-sm font-medium">
        Contraseña del panel
      </label>
      <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10 text-base" />
      <Status state={state} />
      <Button type="submit" size="lg" disabled={pending} className="mt-1 h-10">
        {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        Entrar
      </Button>
    </form>
  );
}

/** Supabase Auth: mail y contraseña, o un link por mail. */
export function EmailLoginForm({ desde }: { desde: string }) {
  const [tab, setTab] = useState<"password" | "link">("password");
  const [pwState, pwAction, pwPending] = useActionState(loginWithEmail, undefined);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, undefined);
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Cómo entrar" className="grid grid-cols-2 gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
        {(
          [
            ["password", "Con contraseña"],
            ["link", "Con un link"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", tab === k ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "password" ? (
        <form action={pwAction} className="flex flex-col gap-3">
          <input type="hidden" name="desde" value={desde} />
          <Field id="email" label="Mail">
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-10 text-base" />
          </Field>
          <Field id="pw" label="Contraseña">
            <Input id="pw" name="password" type="password" autoComplete="current-password" required className="h-10 text-base" />
          </Field>
          <Status state={pwState} />
          <Button type="submit" size="lg" disabled={pwPending} className="mt-1 h-10">
            {pwPending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            Entrar
          </Button>
        </form>
      ) : (
        <form action={linkAction} className="flex flex-col gap-3">
          <input type="hidden" name="desde" value={desde} />
          <Field id="email-link" label="Mail">
            <Input id="email-link" name="email" type="email" autoComplete="email" required className="h-10 text-base" />
          </Field>
          <Status state={linkState} />
          <Button type="submit" size="lg" variant="outline" disabled={linkPending} className="mt-1 h-10">
            {linkPending ? <Loader2 className="animate-spin" /> : <Mail />}
            Mandame un link
          </Button>
        </form>
      )}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
