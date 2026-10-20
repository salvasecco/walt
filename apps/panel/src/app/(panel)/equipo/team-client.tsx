"use client";

import { Loader2, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { addMember, bootstrapOwner, changeMemberRole, changeMyPassword } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { memberChangeError, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";

const selectCls =
  "h-8 rounded-md border border-input bg-surface px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50";

export function AddMemberForm({ canAddAdmins }: { canAddAdmins: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addMember({ email, role });
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Listo");
          setEmail("");
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Mail
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@agencia.com" className="h-9" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Rol
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={`${selectCls} h-9`}>
          {ROLES.filter((r) => canAddAdmins || r === "member").map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="lg" disabled={pending || !email}>
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Sumar
      </Button>
      <p className="text-xs text-muted-foreground">Si todavía no tiene cuenta, le llega una invitación por mail para entrar.</p>
    </form>
  );
}

export function MemberActions({
  userId,
  role,
  canChangeRole,
  owners,
  self,
  actorRole,
}: {
  userId: string;
  role: Role;
  canChangeRole: boolean;
  owners: number;
  self: boolean;
  actorRole: Role;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (to: Role | null, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => {
      const r = await changeMemberRole(userId, to);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Listo");
      router.refresh();
    });
  };
  const removable = memberChangeError(actorRole, role, null, owners, self) === null;
  return (
    <div className="flex items-center gap-2">
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      <select value={role} disabled={!canChangeRole || pending} onChange={(e) => run(e.target.value as Role)} className={selectCls} aria-label="Rol">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!removable || pending}
        onClick={() => run(null, self ? "¿Salir del equipo? Vas a perder el acceso a esta agencia." : "¿Sacarlo del equipo?")}
        aria-label={self ? "Salir del equipo" : "Sacar del equipo"}
        title={self ? "Salir del equipo" : "Sacar del equipo"}
        className="text-danger hover:text-danger"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeMyPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Contraseña nueva
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" className="h-9" />
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-ok">{state.ok}</p>}
      <Button type="submit" variant="outline" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Cambiar
      </Button>
    </form>
  );
}

export function BootstrapOwnerForm({ factories }: { factories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(bootstrapOwner, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Agencia
        <select name="factory" className={`${selectCls} h-9`} defaultValue={factories[0]?.id}>
          {factories.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Mail del dueño
        <Input name="email" type="email" required autoComplete="email" className="h-9" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Contraseña
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" className="h-9" />
      </label>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Crear el dueño
      </Button>
      {state?.error && <p className="text-sm text-danger sm:col-span-4">{state.error}</p>}
    </form>
  );
}
