import type { Metadata } from "next";
import { ShieldCheck, UserRoundCog } from "lucide-react";
import { Chip, EmptyState, Notice, PageHeader, PanelTitle, SampleBadge, Surface } from "@/components/ui-walt";
import { dataMode } from "@/lib/env";
import { dateTime } from "@/lib/labels";
import { can, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
import { getScope } from "@/lib/session";
import { factoriesWithoutMembers, getTeam, type TeamMember } from "@/lib/team";
import { AddMemberForm, BootstrapOwnerForm, MemberActions, PasswordForm } from "./team-client";

export const metadata: Metadata = { title: "Equipo" };

const ROLE_HELP: Record<Role, string> = {
  owner: "Todo, incluido cambiar roles y sacar admins. Siempre queda al menos uno.",
  admin: "Configura reglas, proyectos, invitaciones y el modo de IA; suma y saca miembros.",
  member: "Opera: aprueba, rechaza, publica, vuelve atrás, reetiqueta y usa el simulador.",
};

const SAMPLE_TEAM: TeamMember[] = [
  { userId: "u1", email: "sofia@estudiofaro.uy", role: "owner", lastSignInAt: new Date(Date.now() - 3_600_000).toISOString(), invited: false },
  { userId: "u2", email: "martin@estudiofaro.uy", role: "admin", lastSignInAt: new Date(Date.now() - 86_400_000).toISOString(), invited: false },
  { userId: "u3", email: "lu@estudiofaro.uy", role: "member", lastSignInAt: null, invited: true },
];

export default async function EquipoPage() {
  const { viewer, db } = await getScope();
  const sample = dataMode() === "ejemplo";
  const multi = viewer.tenancy === "multi";
  // Independientes: van en paralelo.
  const [team, orphans] = await Promise.all([
    multi && viewer.factory ? getTeam(db, viewer.factory.id) : Promise.resolve(sample ? SAMPLE_TEAM : []),
    multi && viewer.emergency ? factoriesWithoutMembers() : Promise.resolve([]),
  ]);
  const owners = team.filter((m) => m.role === "owner").length;
  const manage = multi && viewer.kind === "user" && can(viewer.role, "equipo");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Equipo"
        subtitle={viewer.factory ? `Quiénes entran al panel de ${viewer.factory.name} y qué puede hacer cada uno.` : "Quiénes entran al panel y qué puede hacer cada uno."}
        right={sample && <SampleBadge />}
      />
      {!multi && !sample && (
        <Notice tone="info" icon={<ShieldCheck />}>
          Los usuarios, roles y la separación por agencia llegan al aplicar la migración 0004. Mientras tanto se entra con la contraseña del panel.
        </Notice>
      )}
      {viewer.emergency && (
        <Surface className="flex flex-col gap-4 p-5">
          <PanelTitle>Crear el dueño de una agencia</PanelTitle>
          <p className="text-sm text-muted-foreground">
            Estás con el acceso de emergencia. Creá el usuario dueño de la agencia que ya existe (por ejemplo, la del seed) y entrá con ese mail: desde ese momento la contraseña del panel deja de servir.
          </p>
          {orphans.length ? (
            <BootstrapOwnerForm factories={orphans.map((f) => ({ id: f.id, name: f.name }))} />
          ) : (
            <p className="text-sm text-muted-foreground">No hay agencias sin dueño.</p>
          )}
        </Surface>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <PanelTitle icon={<UserRoundCog />}>Miembros</PanelTitle>
            <span className="text-xs text-muted-foreground tnum">{team.length}</span>
          </div>
          {team.length === 0 ? (
            <EmptyState className="m-5" title="Todavía no hay usuarios">
              {multi ? "Sumá a tu equipo con su mail." : "Llegan con la migración 0004."}
            </EmptyState>
          ) : (
            <ul>
              {team.map((m) => (
                <li key={m.userId} className="flex flex-col gap-3 border-b border-line px-5 py-3.5 last:border-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{m.email ?? "Sin mail"}</span>
                      {m.userId === viewer.userId && <Chip>vos</Chip>}
                      {m.invited && <Chip tone="info">invitación pendiente</Chip>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {m.lastSignInAt ? `Última entrada ${dateTime(m.lastSignInAt)}` : "Todavía no entró"}
                    </div>
                  </div>
                  {manage ? (
                    <MemberActions userId={m.userId} role={m.role} canChangeRole={viewer.role === "owner"} owners={owners} self={m.userId === viewer.userId} actorRole={viewer.role} />
                  ) : (
                    <Chip tone={m.role === "owner" ? "ok" : m.role === "admin" ? "info" : "muted"}>{ROLE_LABEL[m.role]}</Chip>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Surface>
        <div className="flex flex-col gap-6">
          {manage && (
            <Surface className="flex flex-col gap-4 p-5">
              <PanelTitle>Sumar a alguien</PanelTitle>
              <AddMemberForm canAddAdmins={viewer.role === "owner"} />
            </Surface>
          )}
          <Surface className="flex flex-col gap-3 p-5">
            <PanelTitle>Qué puede hacer cada rol</PanelTitle>
            <ul className="flex flex-col gap-2.5">
              {ROLES.map((r) => (
                <li key={r} className="text-sm">
                  <span className="font-medium">{ROLE_LABEL[r]}.</span> <span className="text-muted-foreground">{ROLE_HELP[r]}</span>
                </li>
              ))}
            </ul>
          </Surface>
          {viewer.kind === "user" && (
            <Surface className="flex flex-col gap-4 p-5">
              <PanelTitle>Tu contraseña</PanelTitle>
              <PasswordForm />
            </Surface>
          )}
        </div>
      </div>
    </div>
  );
}
