/** El logo de Walt: la onda en el cuadrado redondeado (el del afiche de build 101). */
export function WaltMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="160" height="160" rx="40" fill="#0B0D10" />
      <path d="M20 80h26.7l16.7-40 33.3 80 16.7-40h26.6" fill="none" stroke="#2BD97C" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WaltLogo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <WaltMark size={size} />
      <span className="wl-display text-[1.15rem] font-bold tracking-tight">Walt</span>
    </span>
  );
}
