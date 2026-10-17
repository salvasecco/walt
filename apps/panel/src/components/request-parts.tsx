import { ArrowRight, Bot, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { describeChange, describeOp, clock } from "@/lib/labels";
import type { Change, DaleRequest, Message, SiteContent } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Phone({ messages, assistantName, className, big }: { messages: Message[]; assistantName: string; className?: string; big?: boolean }) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0A0D15] shadow-[inset_0_0_0_6px_rgba(255,255,255,0.02)]", className)}>
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-cyan-neon/30 to-violet-neon/30 text-cyan-neon">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{assistantName}</div>
          <div className="text-[11px] text-emerald-neon">en línea</div>
        </div>
      </div>
      <div className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">Sin mensajes todavía</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.direction === "entrada" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 leading-snug",
                big ? "text-[15px]" : "text-sm",
                m.direction === "entrada" ? "rounded-br-md bg-cyan-neon/90 text-[#031016]" : "rounded-bl-md border border-white/[0.06] bg-white/[0.06]",
              )}
            >
              {typeof m.media?.url === "string" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.media.url} alt="Vista previa enviada al cliente" className="mb-2 max-h-56 rounded-lg" />
              )}
              <span className="break-words whitespace-pre-wrap">{m.text}</span>
              <span className={cn("ml-2 font-mono text-[10px] tnum", m.direction === "entrada" ? "text-[#031016]/60" : "text-muted-foreground")}>{clock(m.at)}</span>
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
          <li key={c.pointer} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <span className={cn("truncate text-muted-foreground", big ? "text-base" : "text-sm")} title={c.pointer}>
              {d.label}
            </span>
            <span className={cn("flex items-center gap-2 font-mono tnum", big ? "text-lg" : "text-sm")}>
              <span className="text-rose-neon/80 line-through decoration-rose-neon/50">{d.before}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span className="font-semibold text-emerald-neon">{d.after}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function OpsList({ request, content, big }: { request: DaleRequest; content?: SiteContent | null; big?: boolean }) {
  const ops = request.ops ?? request.interpretation?.ops ?? [];
  if (!ops.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {ops.map((op, i) => (
        <li key={i} className={cn("flex items-start gap-2", big ? "text-lg" : "text-sm")}>
          <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-violet-neon" />
          {describeOp(op, content)}
        </li>
      ))}
    </ul>
  );
}

export function GateReasons({ request }: { request: DaleRequest }) {
  const outcome = request.gate?.outcome;
  const reasons = request.gate?.reasons ?? [];
  const Icon = outcome === "bloqueado" ? ShieldX : outcome === "agencia" ? ShieldAlert : ShieldCheck;
  const tone = outcome === "bloqueado" ? "text-rose-neon" : outcome === "agencia" ? "text-amber-neon" : "text-emerald-neon";
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
        <li key={`u${i}`} className="flex items-start gap-2 text-sm text-amber-neon">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>No entra en operaciones: {p}</span>
        </li>
      ))}
    </ul>
  );
}
