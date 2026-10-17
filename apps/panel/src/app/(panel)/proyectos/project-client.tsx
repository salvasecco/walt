"use client";

import { CheckCircle2, Loader2, PlugZap, QrCode, XCircle, AlertTriangle, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { connectProject, createInvites, testRepoConnection, type InviteQR, type RepoCheck } from "@/app/actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Chip, Notice, Surface, PanelTitle } from "@/components/ui-dale";
import { dateTime } from "@/lib/labels";

export function ConnectRepo({ hasToken }: { hasToken: boolean }) {
  const [f, setF] = useState({ name: "", clientName: "", owner: "", repo: "", branch: "main", siteUrl: "" });
  const [check, setCheck] = useState<RepoCheck | null>(null);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
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
    <Surface className="flex flex-col gap-4 self-start p-5">
      <PanelTitle icon={<PlugZap />}>Conectar un repo</PanelTitle>
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
        <Notice tone="warn" icon={<AlertTriangle />} className="text-xs">
          Falta <code className="font-mono">GITHUB_TOKEN</code>: la prueba solo ve repos públicos.
        </Notice>
      )}
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={!ready || testing}
        onClick={() =>
          startTest(async () => {
            const r = await testRepoConnection({ owner: f.owner, repo: f.repo, branch: f.branch });
            if (!r.ok) toast.error(r.error);
            else setCheck(r.data!);
          })
        }
      >
        {testing && <Loader2 className="animate-spin" />} Probar la conexión
      </Button>
      {check && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-4 text-sm">
          <Row ok={check.reachable} text={check.reachable ? `Repo accesible${check.private ? " (privado)" : " (público)"}` : "No se pudo acceder al repo"} />
          {check.reachable && (
            <>
              <Row ok={check.hasConfig} warn={!check.hasConfig} text={check.hasConfig ? "Tiene dale.config.json" : "No tiene dale.config.json"} />
              <div className="flex items-center gap-2">
                Se conecta en{" "}
                <Chip tone={check.mode === "contenido" ? "muted" : "code"}>
                  modo {check.mode === "contenido" ? "contenido" : "código"}
                </Chip>
              </div>
              {check.configSummary && check.hasConfig && <p className="text-muted-foreground">{check.configSummary}</p>}
              {check.mode === "codigo" && <p className="text-muted-foreground">Sin contrato de contenido: solo el carril del agente, con PR y aprobación de la agencia.</p>}
            </>
          )}
          {check.notes.map((n) => (
            <p key={n} className="text-xs text-warn">
              {n}
            </p>
          ))}
        </div>
      )}
      <Button
        type="button"
        size="lg"
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
      >
        {saving && <Loader2 className="animate-spin" />} Conectar
      </Button>
    </Surface>
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
      {ok ? <CheckCircle2 className="size-4 text-ok" /> : warn ? <AlertTriangle className="size-4 text-warn" /> : <XCircle className="size-4 text-danger" />}
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
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="shrink-0 px-3"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createInvites(projectId);
            if (!r.ok) return void toast.error(r.error);
            setQrs(r.data!);
            setNote(r.message);
            setOpen(true);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <QrCode />} Invitaciones
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl border border-line bg-surface sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invitaciones a {projectName}</DialogTitle>
            <DialogDescription>Escaneá el QR con el celular: abre el chat con el asistente y lo vincula al proyecto. 5 usos, vence en 7 días.</DialogDescription>
          </DialogHeader>
          {note && <p className="text-xs text-warn">{note}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {qrs?.map((q) => (
              <div key={q.role} className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-2 p-4">
                <Chip>Para {q.role === "cliente" ? "el cliente" : "la agencia"}</Chip>
                <div className="w-full max-w-[220px] overflow-hidden rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: q.svg }} />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(q.link).then(() => toast.success("Link copiado"))}
                  className="flex max-w-full items-center gap-1.5 truncate font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
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
