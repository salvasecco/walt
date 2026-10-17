export function Logo({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <div className="grid size-7 place-items-center rounded-md bg-foreground text-background">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h4l2-5 3 10 2-5h3" />
          </svg>
        </div>
        <div className="leading-none">
          <div className="text-sm font-semibold tracking-tight">Dale</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Centro de control</div>
        </div>
      </div>
    </div>
  );
}
