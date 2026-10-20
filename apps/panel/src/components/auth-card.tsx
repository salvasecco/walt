import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/** Tarjeta centrada de las pantallas de entrada (entrar, registrarse, crear la agencia). */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
          <Logo />
          <h1 className="mt-8 text-lg font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6 flex flex-col gap-4">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}
