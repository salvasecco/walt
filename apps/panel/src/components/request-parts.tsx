import { ArrowRight, Bot, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { describeChange, describeOp, clock } from "@/lib/labels";
import type { Change, WaltRequest, Message, SiteContent } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Phone({ messages, assistantName, className, big }: { messages: Message[]; assistantName: string; className?: string; big?: boolean }) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface", className)}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="grid size-8 place-items-center rounded-full border border-line bg-surface-2 text-muted-foreground">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{assistantName}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-ok" />en línea</div>
        </div>
      </div>
      <div className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">Sin mensajes todavía</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.direction === "entrada" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 leading-snug",
                big ? "text-[15px]" : "text-sm",
                m.direction === "entrada" ? "rounded-br-sm bg-[#2a2a30] text-foreground" : "rounded-bl-sm border border-line bg-surface-2",
              )}
            >
              {typeof m.media?.url === "string" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.media.url} alt="Vista previa enviada al cliente" className="mb-2 max-h-56 rounded-lg" />
              )}
              <span className="break-words whitespace-pre-wrap">{m.text}</span>
              <span className={cn("ml-2 font-mono text-[10px] tnum", "text-faint")}>{clock(m.at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChangesDiff({ changes, content, big }: { changes: Change[]; content?: SiteContent | null; big?: boolean }) {
  if (!changes.length) return <p className="text-sm text-muted-foreground">Sin cambios de valores.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {changes.map((c) => {
        const d = describeChange(c, content);
        return (
          <li key={c.pointer} className="flex flex-col gap-1 rounded-lg border border-line bg-surface-2 px-3 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
            <span className={cn("truncate text-muted-foreground", "text-sm")} title={c.pointer}>
              {d.label}
            </span>
            <span className={cn("flex flex-wrap items-center gap-2 tnum break-all", big ? "text-base" : "text-sm")}>
              <span className="text-muted-foreground line-through decoration-danger/60">{d.before}</span>
              <ArrowRight className="size-3.5 text-faint" />
              <span className="font-medium text-ok">{d.after}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function OpsList({ request, content, big }: { request: WaltRequest; content?: SiteContent | null; big?: boolean }) {
  const ops = request.ops ?? request.interpretation?.ops ?? [];
  if (!ops.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {ops.map((op, i) => (
        <li key={i} className={cn("flex items-start gap-2", big ? "text-base" : "text-sm")}>
          <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-faint" />
          {describeOp(op, content)}
        </li>
      ))}
    </ul>
  );
}

export function GateReasons({ request }: { request: WaltRequest }) {
  const outcome = request.gate?.outcome;
  const reasons = request.gate?.reasons ?? [];
  const Icon = outcome === "bloqueado" ? ShieldX : outcome === "agencia" ? ShieldAlert : ShieldCheck;
  const tone = outcome === "bloqueado" ? "text-danger" : outcome === "agencia" ? "text-warn" : "text-ok";
  if (!reasons.length && !request.interpretation?.unexpressedParts?.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />
          <span>{r}</span>
        </li>
      ))}
      {request.interpretation?.unexpressedParts?.map((p, i) => (
        <li key={`u${i}`} className="flex items-start gap-2 text-sm text-foreground/90">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>No entra en operaciones: {p}</span>
        </li>
      ))}
    </ul>
  );
}
