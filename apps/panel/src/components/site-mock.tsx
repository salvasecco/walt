import type { SiteContent } from "@/lib/types";
import { money } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Render mínimo del contenido del sitio, para cuando no hay URL del sitio (desarrollo con datos de ejemplo).
 * No reemplaza al sitio real: en producción se muestra el sitio en un iframe.
 */
export function SiteMock({ content, highlight = [] }: { content: SiteContent; highlight?: string[] }) {
  const t = content.theme ?? {};
  const bg = t.background ?? "#FFF7ED";
  const primary = t.primary ?? "#B45309";
  const accent = t.accent ?? "#F59E0B";
  const text = t.text ?? "#1C1917";
  const banner = content.banner;
  const off = banner?.enabled && banner.discountPercent ? banner.discountPercent : 0;
  const hl = new Set(highlight);
  return (
    <div className="h-full overflow-y-auto text-[13px]" style={{ background: bg, color: text }}>
      {banner?.enabled && (
        <div className="px-4 py-2 text-center text-xs font-semibold text-white" style={{ background: primary }}>
          {banner.text}
        </div>
      )}
      <div className="px-5 pt-6 pb-5">
        <div className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: primary }}>
          {content.brand?.name}
        </div>
        <div className="mt-2 font-serif text-2xl leading-tight font-bold">{content.hero?.title}</div>
        <div className="mt-1 opacity-70">{content.hero?.subtitle}</div>
        <div className="mt-3 inline-block rounded-full px-4 py-1.5 text-xs font-semibold text-white" style={{ background: primary }}>
          {content.hero?.cta}
        </div>
      </div>
      <div className="px-4 pb-6">
        <div className="mb-2 text-xs font-bold tracking-wider uppercase opacity-60">Productos</div>
        <ul className="divide-y" style={{ borderColor: `${text}22` }}>
          {content.products?.map((p, i) => {
            const changed = hl.has(`/products/${i}/price`) || hl.has(`/products/${i}/available`);
            return (
              <li
                key={p.id}
                className={cn("flex items-center justify-between gap-2 px-1 py-2 transition-colors", changed && "rounded-md")}
                style={changed ? { background: `${accent}33`, boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
              >
                <span className={cn(!p.available && "line-through opacity-50")}>{p.name}</span>
                <span className="font-semibold tabular-nums">
                  {!p.available ? (
                    <span className="text-[11px] font-medium opacity-60">sin stock</span>
                  ) : off ? (
                    <>
                      <s className="mr-1 opacity-50">{money(p.price)}</s>
                      {money(Math.round(p.price * (1 - off / 100)))}
                    </>
                  ) : (
                    money(p.price)
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {content.sections?.hours !== false && (
        <div className="px-5 pb-6 text-xs opacity-70">
          {content.hours?.map((h) => (
            <span key={h.day} className="mr-3 inline-block">
              {h.day} {h.open ? `${h.open}–${h.close}` : "cerrado"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
