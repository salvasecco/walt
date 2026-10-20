import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { currentUser, membershipsOf } from "@/lib/session";
import { CreateAgencyForm } from "./create-agency-form";

export const metadata: Metadata = { title: "Creá tu agencia" };

/** Usuario con sesión y sin agencia: por ejemplo, si confirmó el mail en otro navegador o lo sacaron de su equipo. */
export default async function CrearAgenciaPage() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if ((await membershipsOf(user.id)).length) redirect("/atencion");
  const suggested = typeof user.meta.agency_name === "string" ? user.meta.agency_name : "";
  return (
    <AuthCard title="Creá tu agencia" subtitle={user.email ? `Entraste como ${user.email}.` : undefined}>
      <CreateAgencyForm suggested={suggested} />
    </AuthCard>
  );
}
