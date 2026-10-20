import type { LandingCopy } from "@/lib/landing/copy.es";

export function Faq({ copy }: { copy: LandingCopy["faq"] }) {
  return (
    <section id="preguntas" className="wl-cream wl-section">
      <div className="wl-container grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="wl-kicker">{copy.kicker}</p>
          <h2 className="wl-h2 mt-4">{copy.title}</h2>
        </div>
        <div className="wl-faq border-t border-(--wl-cream-line)">
          {copy.items.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p className="pb-5 pr-8 text-[1.02rem] leading-relaxed text-(--wl-cream-muted)">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
