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
      <div className="glass glass-hi w-full max-w-sm rounded-3xl p-8">
        <Logo />
        <h1 className="mt-8 text-xl font-semibold">Entrá al panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">Los pedidos de tus clientes, en vivo.</p>
        {mode === "sin_configurar" ? (
          <p className="mt-6 rounded-xl border border-amber-neon/40 bg-amber-neon/10 p-3 text-sm text-amber-neon">
            Falta configurar <code className="font-mono">PANEL_PASSWORD</code> en este entorno. Hasta entonces el panel queda cerrado.
          </p>
        ) : mode === "abierto" ? (
          <p className="mt-6 rounded-xl border border-white/10 p-3 text-sm text-muted-foreground">
            En desarrollo y sin <code className="font-mono">PANEL_PASSWORD</code>, el panel está abierto. <Link href="/" className="text-cyan-neon underline">Entrar</Link>
          </p>
        ) : (
          <LoginForm desde={typeof desde === "string" ? desde : "/"} />
        )}
      </div>
    </main>
  );
}
