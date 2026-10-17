import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { authMode } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const { desde } = await searchParams;
  const mode = authMode();
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 sm:p-8">
        <Logo />
        <h1 className="mt-8 text-lg font-semibold tracking-tight">Entrá al panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">Los pedidos de tus clientes, en vivo.</p>
        {mode === "sin_configurar" ? (
          <p className="mt-6 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
            Falta configurar <code className="font-mono">PANEL_PASSWORD</code> en este entorno. Hasta entonces el panel queda cerrado.
          </p>
        ) : mode === "abierto" ? (
          <p className="mt-6 rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted-foreground">
            En desarrollo y sin <code className="font-mono">PANEL_PASSWORD</code>, el panel está abierto. <Link href="/atencion" className="text-foreground underline underline-offset-4">Entrar</Link>
          </p>
        ) : (
          <LoginForm desde={typeof desde === "string" ? desde : "/atencion"} />
        )}
      </div>
    </main>
  );
}
