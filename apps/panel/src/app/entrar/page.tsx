import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, KeyRound } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { Notice } from "@/components/ui-walt";
import { authMode } from "@/lib/auth";
import { safeRedirect } from "@/lib/redirect";
import { getTenancy, getViewer } from "@/lib/session";
import { EmailLoginForm, PasswordForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const desde = safeRedirect(typeof sp.desde === "string" ? sp.desde : null);
  const viewer = await getViewer();
  if (viewer && !viewer.needsAgency) redirect(desde);
  if (viewer?.needsAgency) redirect("/registro/agencia");
  const { tenancy, members } = await getTenancy();
  const mode = authMode();
  const multi = tenancy === "multi";
  return (
    <AuthCard
      title="Entrá al panel"
      subtitle="Los pedidos de tus clientes, en vivo."
      footer={
        multi && (
          <>
            ¿Tu agencia todavía no usa Walt?{" "}
            <Link href="/registro" className="text-foreground underline underline-offset-4">
              Registrala
            </Link>
          </>
        )
      }
    >
      {sp.error === "link" && (
        <Notice tone="warn" icon={<AlertTriangle />}>
          El link venció o ya se usó. Pedí otro.
        </Notice>
      )}
      {sp.listo === "dueño" && (
        <Notice tone="ok" icon={<CheckCircle2 />}>
          Listo: la agencia ya tiene dueño. Entrá con ese mail; la contraseña del panel ya no sirve.
        </Notice>
      )}
      {multi ? (
        <>
          <EmailLoginForm desde={desde} />
          {members === 0 && mode === "password" && (
            <details className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
              <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <KeyRound className="size-3.5" /> Acceso de emergencia del dueño de la instancia
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">Funciona solo mientras ningún usuario tenga agencia. Sirve para crear el primer dueño.</p>
              <PasswordForm desde={desde} className="mt-3" />
            </details>
          )}
        </>
      ) : mode === "sin_configurar" ? (
        <Notice tone="warn" icon={<AlertTriangle />}>
          Falta configurar <code className="font-mono">PANEL_PASSWORD</code> en este entorno. Hasta entonces el panel queda cerrado.
        </Notice>
      ) : mode === "abierto" ? (
        <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted-foreground">
          En desarrollo y sin <code className="font-mono">PANEL_PASSWORD</code>, el panel está abierto.{" "}
          <Link href="/atencion" className="text-foreground underline underline-offset-4">
            Entrar
          </Link>
        </p>
      ) : (
        <>
          <PasswordForm desde={desde} />
          {tenancy === "legacy" && (
            <p className="text-xs text-muted-foreground">
              Modo de una sola agencia: los usuarios por agencia llegan con la migración 0004.
            </p>
          )}
        </>
      )}
    </AuthCard>
  );
}
