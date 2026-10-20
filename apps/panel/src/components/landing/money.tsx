import type { LandingCopy } from "@/lib/landing/copy.es";

export function Money({ copy }: { copy: LandingCopy["money"] }) {
  return (
    <section id="plata" className="wl-dark wl-section">
      <div className="wl-container">
        <p className="wl-kicker">{copy.kicker}</p>
        <h2 className="wl-h2 mt-4 max-w-[22ch]">{copy.title}</h2>
        <dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {copy.now.map((m) => (
            <div key={m.title} className="border-t border-(--wl-line-strong) pt-5">
              <dt className="wl-h3">{m.title}</dt>
              <dd className="mt-2 text-[1.02rem] leading-relaxed text-(--wl-muted)">{m.text}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-14 flex flex-col gap-4 rounded-[var(--wl-radius)] border border-dashed border-(--wl-line-strong) p-6 sm:flex-row sm:items-center sm:gap-6">
          <span className="shrink-0 text-sm font-bold uppercase tracking-[0.12em] text-(--wl-muted)">{copy.soonLabel}</span>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[1rem]">
            {copy.soon.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
