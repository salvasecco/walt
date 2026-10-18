import { cn } from "@/lib/utils";

type DiffLine = { kind: "add" | "del" | "ctx" | "hunk"; text: string };
type DiffFile = { path: string; added: number; removed: number; lines: DiffLine[] };

/** Parte un diff unificado de git en archivos con sus líneas. */
export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      const m = / b\/(.+)$/.exec(raw);
      cur = { path: m?.[1] ?? raw.slice(11), added: 0, removed: 0, lines: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith("+++ ") || raw.startsWith("--- ") || raw.startsWith("index ") || raw.startsWith("new file") || raw.startsWith("deleted file")) continue;
    if (raw.startsWith("@@")) cur.lines.push({ kind: "hunk", text: raw });
    else if (raw.startsWith("+")) {
      cur.added++;
      cur.lines.push({ kind: "add", text: raw.slice(1) });
    } else if (raw.startsWith("-")) {
      cur.removed++;
      cur.lines.push({ kind: "del", text: raw.slice(1) });
    } else if (raw.startsWith("\\")) continue;
    else cur.lines.push({ kind: "ctx", text: raw.slice(1) });
  }
  return files;
}

const LINE: Record<DiffLine["kind"], string> = {
  add: "bg-emerald-500/10 text-emerald-200",
  del: "bg-red-500/10 text-red-200",
  ctx: "text-muted-foreground",
  hunk: "text-faint",
};
const SIGN: Record<DiffLine["kind"], string> = { add: "+", del: "−", ctx: " ", hunk: " " };

/** Los cambios que el agente quiere hacer en el código, archivo por archivo. */
export function CodeDiff({ diff, className }: { diff: string; className?: string }) {
  const files = parseDiff(diff);
  if (!files.length) return <p className="text-sm text-muted-foreground">El agente no dejó diff para mostrar.</p>;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {files.map((f) => (
        <details key={f.path} open className="overflow-hidden rounded-lg border border-line bg-surface-2">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="truncate font-mono text-[13px]">{f.path}</span>
            <span className="flex shrink-0 gap-2 font-mono text-xs tnum">
              <span className="text-emerald-400">+{f.added}</span>
              <span className="text-red-400">−{f.removed}</span>
            </span>
          </summary>
          <div className="scrollbar-thin max-h-[360px] overflow-auto border-t border-line">
            <pre className="min-w-max py-1 font-mono text-[12px] leading-[1.55]">
              {f.lines.map((l, i) => (
                <div key={i} className={cn("px-3", LINE[l.kind])}>
                  <span className="mr-3 inline-block w-3 select-none opacity-70">{SIGN[l.kind]}</span>
                  {l.text || " "}
                </div>
              ))}
            </pre>
          </div>
        </details>
      ))}
    </div>
  );
}
