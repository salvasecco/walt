import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { Notice } from "@/components/ui-walt";
import { getTenancy, getViewer } from "@/lib/session";
import { PRICING_TERMS, planById } from "@/lib/landing/config";
import { readPlanIntent } from "@/lib/landing/plan-intent";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Registrá tu agencia" };

export default async function RegistroPage({ searchParams }: PageProps<"/registro">) {
  const sp = await searchParams;
  const intent = readPlanIntent(sp.plan, sp.ciclo);
  const chosen = intent && planById(intent.plan);
  const viewer = await getViewer();
  if (viewer?.kind === "user") redirect(viewer.needsAgency ? "/registro/agencia" : "/atencion");
  const { tenancy } = await getTenancy();
  return (
    <AuthCard
      title="Registrá tu agencia"
      subtitle={
        chosen
          ? `Elegiste ${chosen.name} (${intent.cycle === "anual" ? "anual" : "mensual"}). La beta es gratis por ${PRICING_TERMS.betaFreeMonths} meses y no te pedimos tarjeta.`
          : "Tus clientes piden cambios por chat; Walt los arma, vos revisás lo delicado."
      }
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
        <SignUpForm plan={intent?.plan} cycle={intent?.cycle} />
      ) : (
        <Notice tone="warn" icon={<AlertTriangle />}>
          Todavía no se pueden registrar agencias en este entorno: falta aplicar la migración 0004 (usuarios y equipos).
        </Notice>
      )}
    </AuthCard>
  );
}
