import type { LandingCopy } from "@/lib/landing/copy.es";
import { CtaLink } from "./cta-link";
import { PhoneDemo } from "./phone-demo";

export function Hero({ copy, phone }: { copy: LandingCopy["hero"]; phone: LandingCopy["phone"] }) {
  return (
    <section id="inicio" className="wl-dark relative overflow-hidden pb-16 pt-10 sm:pb-24 sm:pt-16">
      <div className="wl-container grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div>
          <p className="wl-kicker">{copy.kicker}</p>
          <h1 className="wl-h1 mt-5 max-w-[12ch]">{copy.title}</h1>
          <p className="wl-lead mt-6">{copy.subtitle}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CtaLink href="/registro" cta="beta" section="hero" className="wl-btn wl-btn-primary">
              {copy.ctaPrimary}
            </CtaLink>
            <CtaLink href="#calculadora" cta="calcular" section="hero" className="wl-btn wl-btn-ghost">
              {copy.ctaSecondary}
            </CtaLink>
          </div>
          <p className="mt-4 text-sm text-(--wl-muted)">{copy.note}</p>
          <dl className="mt-10 grid max-w-md grid-cols-2 gap-6 border-t border-(--wl-line) pt-6">
            {copy.measured.map((m) => (
              <div key={m.label}>
                <dt className="sr-only">{m.label}</dt>
                <dd>
                  <span className="wl-num block text-3xl text-(--wl-green)">{m.value}</span>
                  <span className="mt-1 block text-sm leading-snug text-(--wl-muted)">{m.label}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-(--wl-muted)">
            {copy.measuredNote} {copy.scope}
          </p>
        </div>
        <PhoneDemo copy={phone} />
      </div>
    </section>
  );
}
