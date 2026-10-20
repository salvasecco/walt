// Roles de la agencia (tabla memberships, migración 0004) y qué puede hacer cada uno. Funciones puras.

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = { owner: "Dueño", admin: "Admin", member: "Miembro" };

const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

/**
 * - member: opera (aprobar, rechazar, publicar, volver atrás, presupuestos), reetiqueta y usa el simulador.
 * - admin: además configura (reglas, proyectos, invitaciones, modo de IA) y suma o saca miembros.
 * - owner: además cambia roles y saca admins. Siempre queda al menos un dueño.
 */
export type Permission = "operar" | "configurar" | "equipo" | "roles";

const NEEDS: Record<Permission, Role> = { operar: "member", configurar: "admin", equipo: "admin", roles: "owner" };

export function isRole(r: unknown): r is Role {
  return typeof r === "string" && (ROLES as readonly string[]).includes(r);
}

export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export function can(role: Role, permission: Permission): boolean {
  return atLeast(role, NEEDS[permission]);
}

export const PERMISSION_TEXT: Record<Permission, string> = {
  operar: "operar",
  configurar: "cambiar la configuración",
  equipo: "manejar el equipo",
  roles: "cambiar roles",
};

/**
 * Si `actor` puede cambiar el rol de `target` a `to` (o sacarlo, con `to = null`), con `owners` dueños en la agencia.
 * Devuelve el motivo si no puede.
 */
export function memberChangeError(actor: Role, target: Role, to: Role | null, owners: number, self: boolean): string | null {
  if (to === null) {
    if (!can(actor, "equipo")) return "Solo un admin o el dueño pueden sacar a alguien del equipo.";
    if (target !== "member" && actor !== "owner") return "Solo el dueño puede sacar a un admin o a otro dueño.";
    if (target === "owner" && owners <= 1) return "Tiene que quedar al menos un dueño.";
    return null;
  }
  if (!can(actor, "roles")) return "Solo el dueño puede cambiar roles.";
  if (target === "owner" && to !== "owner" && owners <= 1) return self ? "Sos el único dueño: nombrá a otro antes de dejar de serlo." : "Tiene que quedar al menos un dueño.";
  return null;
}
