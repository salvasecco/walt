export function Logo({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <div className="relative grid size-9 place-items-center rounded-xl border border-cyan-neon/40 bg-cyan-neon/10 shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)]">
          <svg viewBox="0 0 24 24" className="size-5 text-cyan-neon" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h4l2-5 3 10 2-5h3" />
          </svg>
        </div>
        <div className="leading-none">
          <div className="text-[17px] font-semibold tracking-tight">Dale</div>
          <div className="mt-1 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">centro de control</div>
        </div>
      </div>
    </div>
  );
}
