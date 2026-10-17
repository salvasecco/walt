"use client";

import { CheckCircle2, Loader2, PlugZap, QrCode, XCircle, AlertTriangle, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { connectProject, createInvites, testRepoConnection, type InviteQR, type RepoCheck } from "@/app/actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Chip, Glass, PanelTitle } from "@/components/ui-dale";
import { dateTime } from "@/lib/labels";

export function ConnectRepo({ hasToken }: { hasToken: boolean }) {
  const [f, setF] = useState({ name: "", clientName: "", owner: "", repo: "", branch: "main", siteUrl: "" });
  const [check, setCheck] = useState<RepoCheck | null>(null);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    // Acepta pegar "owner/repo" o la URL de GitHub en el campo owner.
    if (k === "owner") {
      const m = v.match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
      if (m) {
        setF((s) => ({ ...s, owner: m[1], repo: m[2] }));
        setCheck(null);
        return;
      }
    }
    setF((s) => ({ ...s, [k]: v }));
    if (k === "owner" || k === "repo" || k === "branch") setCheck(null);
  };
  const ready = f.owner && f.repo;
  return (
    <Glass className="flex flex-col gap-4 self-start p-5" hi>
      <PanelTitle icon={<PlugZap className="size-3.5 text-cyan-neon" />}>Conectar un repo</PanelTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner" className="col-span-1">
          <Input value={f.owner} onChange={set("owner")} placeholder="salvasecco" />
        </Field>
        <Field label="Repo">
          <Input value={f.repo} onChange={set("repo")} placeholder="dale-demo" />
        </Field>
        <Field label="Rama">
          <Input value={f.branch} onChange={set("branch")} />
        </Field>
        <Field label="URL del sitio">
          <Input value={f.siteUrl} onChange={set("siteUrl")} placeholder="https://…" />
        </Field>
        <Field label="Nombre del proyecto">
          <Input value={f.name} onChange={set("name")} placeholder="Panadería Mabel" />
        </Field>
        <Field label="Cliente">
          <Input value={f.clientName} onChange={set("clientName")} placeholder="Mabel" />
        </Field>
      </div>
      {!hasToken && (
        <p className="flex items-start gap-2 text-xs text-amber-neon">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Falta GITHUB_TOKEN: la prueba solo ve repos públicos.
        </p>
      )}
      <button
        type="button"
        disabled={!ready || testing}
        onClick={() =>
          startTest(async () => {
            const r = await testRepoConnection({ owner: f.owner, repo: f.repo, branch: f.branch });
            if (!r.ok) toast.error(r.error);
            else setCheck(r.data!);
          })
        }
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-neon/50 text-sm font-medium text-cyan-neon hover:bg-cyan-neon/10 disabled:opacity-50"
      >
        {testing && <Loader2 className="size-4 animate-spin" />} Probar la conexión
      </button>
      {check && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
          <Row ok={check.reachable} text={check.reachable ? `Repo accesible${check.private ? " (privado)" : " (público)"}` : "No se pudo acceder al repo"} />
          {check.reachable && (
            <>
              <Row ok={check.hasConfig} warn={!check.hasConfig} text={check.hasConfig ? "Tiene dale.config.json" : "No tiene dale.config.json"} />
              <div className="flex items-center gap-2">
                Se conecta en{" "}
                <Chip tone={check.mode === "contenido" ? "emerald" : "violet"} dot>
                  modo {check.mode === "contenido" ? "contenido" : "código"}
                </Chip>
              </div>
              {check.configSummary && check.hasConfig && <p className="text-muted-foreground">{check.configSummary}</p>}
              {check.mode === "codigo" && <p className="text-muted-foreground">Sin contrato de contenido: solo el carril del agente, con PR y aprobación de la agencia.</p>}
            </>
          )}
          {check.notes.map((n) => (
            <p key={n} className="text-xs text-amber-neon">
              {n}
            </p>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={!check?.reachable || !f.name || saving}
        onClick={() =>
          startSave(async () => {
            const r = await connectProject({ ...f, mode: check!.mode });
            if (!r.ok) toast.error(r.error);
            else if (r.demo) toast.warning(r.message);
            else {
              toast.success("Proyecto conectado con las reglas por defecto.");
              setF({ name: "", clientName: "", owner: "", repo: "", branch: "main", siteUrl: "" });
              setCheck(null);
              router.refresh();
            }
          })
        }
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-neon text-sm font-medium text-[#031016] disabled:opacity-40"
      >
        {saving && <Loader2 className="size-4 animate-spin" />} Conectar
      </button>
    </Glass>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="label-xs">{label}</span>
      {children}
    </label>
  );
}

function Row({ ok, warn, text }: { ok: boolean; warn?: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 text-emerald-neon" /> : warn ? <AlertTriangle className="size-4 text-amber-neon" /> : <XCircle className="size-4 text-rose-neon" />}
      {text}
    </div>
  );
}

export function InviteButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const [qrs, setQrs] = useState<InviteQR[] | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          start(async () => {
            const r = await createInvites(projectId);
            if (!r.ok) return void toast.error(r.error);
            setQrs(r.data!);
            setNote(r.message);
            setOpen(true);
          })
        }
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm hover:bg-white/5"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />} Invitaciones
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl border-white/10 bg-[#0A0D15] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invitaciones a {projectName}</DialogTitle>
            <DialogDescription>Escaneá el QR con el celular: abre el chat con el asistente y lo vincula al proyecto. 5 usos, vence en 7 días.</DialogDescription>
          </DialogHeader>
          {note && <p className="text-xs text-amber-neon">{note}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {qrs?.map((q) => (
              <div key={q.role} className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 p-4">
                <Chip tone={q.role === "cliente" ? "cyan" : "amber"}>Para {q.role === "cliente" ? "el cliente" : "la agencia"}</Chip>
                <div className="w-full max-w-[220px] overflow-hidden rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: q.svg }} />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(q.link).then(() => toast.success("Link copiado"))}
                  className="flex max-w-full items-center gap-1.5 truncate font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  <Copy className="size-3 shrink-0" />
                  <span className="truncate">{q.link}</span>
                </button>
                <span className="text-xs text-muted-foreground">Vence {dateTime(q.expiresAt)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
