import { ArrowRight } from "lucide-react";
import type { LandingCopy } from "@/lib/landing/copy.es";

export function Paths({ copy }: { copy: LandingCopy["paths"] }) {
  return (
    <section id="como-funciona" className="wl-dark wl-section">
      <div className="wl-container">
        <p className="wl-kicker">{copy.kicker}</p>
        <h2 className="wl-h2 mt-4 max-w-[20ch]">{copy.title}</h2>
        <p className="wl-lead mt-5">{copy.lead}</p>
        <ol className="mt-12 border-t border-(--wl-line)">
          {copy.items.map((p, i) => (
            <li key={p.id} className="grid gap-4 border-b border-(--wl-line) py-7 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.25fr)_13rem] md:items-start md:gap-8">
              <span className="wl-num text-lg text-(--wl-muted)" aria-hidden="true">
                0{i + 1}
              </span>
              <div>
                <span className="wl-tag" data-kind={p.id}>
                  {p.name}
                </span>
                <p className="wl-display mt-3 text-[1.25rem] font-medium leading-snug">«{p.ask}»</p>
              </div>
              <p className="text-[1.02rem] leading-relaxed text-(--wl-muted)">{p.what}</p>
              <p className="flex items-center gap-2 text-[0.95rem] font-semibold md:justify-end md:pt-1 md:text-right">
                <ArrowRight className="size-4 text-(--wl-muted)" aria-hidden="true" />
                {p.result}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-3xl text-[1.02rem] text-(--wl-muted)">{copy.note}</p>
      </div>
    </section>
  );
}
