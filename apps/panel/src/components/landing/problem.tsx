import type { LandingCopy } from "@/lib/landing/copy.es";
import { Stat } from "./stat";

export function Problem({ copy }: { copy: LandingCopy["problem"] }) {
  return (
    <section id="problema" className="wl-cream wl-section">
      <div className="wl-container">
        <p className="wl-kicker">{copy.kicker}</p>
        <h2 className="wl-h2 mt-4 max-w-[22ch]">{copy.title}</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2 md:gap-10">
          {copy.sides.map((s) => (
            <div key={s.title}>
              <h3 className="wl-h3">{s.title}</h3>
              <p className="wl-muted mt-2 text-[1.05rem]">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 grid gap-12 border-t border-(--wl-cream-line) pt-12 md:grid-cols-3 md:gap-10">
          {copy.stats.map((s) => (
            <Stat key={s.id} figure={s.figure} ofTen={copy.ofTen} text={s.text} source={s.source} url={s.url} />
          ))}
        </div>
      </div>
    </section>
  );
}
