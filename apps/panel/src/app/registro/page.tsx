import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { Notice } from "@/components/ui-walt";
import { getTenancy, getViewer } from "@/lib/session";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Registrá tu agencia" };

export default async function RegistroPage() {
  const viewer = await getViewer();
  if (viewer?.kind === "user") redirect(viewer.needsAgency ? "/registro/agencia" : "/atencion");
  const { tenancy } = await getTenancy();
  return (
    <AuthCard
      title="Registrá tu agencia"
      subtitle="Tus clientes piden cambios por chat; Walt los arma, vos revisás lo delicado."
      footer={
        <>
          ¿Ya tenés cuenta?{" "}
          <Link href="/entrar" className="text-foreground underline underline-offset-4">
            Entrá
          </Link>
        </>
      }
    >
      {tenancy === "multi" ? (
        <SignUpForm />
      ) : (
        <Notice tone="warn" icon={<AlertTriangle />}>
          Todavía no se pueden registrar agencias en este entorno: falta aplicar la migración 0004 (usuarios y equipos).
        </Notice>
      )}
    </AuthCard>
  );
}
