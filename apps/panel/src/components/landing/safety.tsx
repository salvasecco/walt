import type { LandingCopy } from "@/lib/landing/copy.es";

export function Safety({ copy }: { copy: LandingCopy["safety"] }) {
  return (
    <section id="seguridad" className="wl-dark wl-section">
      <div className="wl-container grid gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:gap-16">
        <div>
          <p className="wl-kicker">{copy.kicker}</p>
          <h2 className="wl-h2 mt-4">{copy.title}</h2>
          <p className="wl-lead mt-5">{copy.lead}</p>
          <ol className="mt-10 space-y-8">
            {copy.points.map((p, i) => (
              <li key={p.title} className="grid grid-cols-[2.25rem_1fr] gap-4">
                <span className="wl-num grid size-9 place-items-center rounded-full border border-(--wl-line-strong) text-sm text-(--wl-green)" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="wl-h3">{p.title}</h3>
                  <p className="mt-2 text-[1.02rem] leading-relaxed text-(--wl-muted)">{p.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <aside className="wl-card self-start p-7 sm:p-8" aria-label={copy.eval.label}>
          <p className="text-sm font-semibold text-(--wl-muted)">{copy.eval.label}</p>
          <p className="wl-num mt-4 text-[4.5rem] leading-none text-(--wl-green)">{copy.eval.big}</p>
          <p className="mt-3 text-[1.02rem] leading-snug">{copy.eval.bigText}</p>
          <dl className="mt-7 grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-4 border-t border-(--wl-line) pt-6">
            {copy.eval.rows.map((r) => (
              <div key={r.text} className="contents">
                <dt className="wl-num text-2xl">{r.value}</dt>
                <dd className="text-[0.98rem] leading-snug text-(--wl-muted)">{r.text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs leading-relaxed text-(--wl-muted)">{copy.eval.note}</p>
        </aside>
      </div>
    </section>
  );
}
