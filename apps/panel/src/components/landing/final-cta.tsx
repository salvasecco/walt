import Link from "next/link";
import type { LandingCopy } from "@/lib/landing/copy.es";
import { PUBLIC_CONTACT } from "@/lib/landing/config";
import { CtaLink } from "./cta-link";
import { WaltLogo } from "./logo";

export function FinalCta({ copy }: { copy: LandingCopy["final"] }) {
  return (
    <section id="beta" className="wl-dark wl-section">
      <div className="wl-container text-center">
        <h2 className="wl-h2 mx-auto max-w-[18ch]">{copy.title}</h2>
        <p className="wl-lead mx-auto mt-5">{copy.text}</p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <CtaLink href="/registro" cta="beta" section="final" className="wl-btn wl-btn-primary">
            {copy.cta}
          </CtaLink>
          <a href="#precios" className="wl-btn wl-btn-ghost">
            {copy.secondary}
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer({ copy }: { copy: { made: string; origin: string; login: string; terms: string; privacy: string; contact: string } }) {
  return (
    <footer className="wl-dark border-t border-(--wl-line) py-12">
      <div className="wl-container flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <WaltLogo />
          <p className="text-sm text-(--wl-muted)">
            {copy.made} {copy.origin}
          </p>
        </div>
        <nav aria-label="Pie" className="-my-2 flex flex-col text-sm text-(--wl-muted) sm:flex-row sm:gap-6">
          <Link href="/entrar" prefetch={false} className="py-2 hover:text-(--wl-text)">
            {copy.login}
          </Link>
          <Link href="/legal/terminos" prefetch={false} className="py-2 hover:text-(--wl-text)">
            {copy.terms}
          </Link>
          <Link href="/legal/privacidad" prefetch={false} className="py-2 hover:text-(--wl-text)">
            {copy.privacy}
          </Link>
          {PUBLIC_CONTACT.email && (
            <a href={`mailto:${PUBLIC_CONTACT.email}`} className="py-2 hover:text-(--wl-text)">
              {copy.contact}: {PUBLIC_CONTACT.email}
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
