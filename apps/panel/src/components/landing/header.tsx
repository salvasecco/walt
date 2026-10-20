"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LandingCopy } from "@/lib/landing/copy.es";
import { CtaLink } from "./cta-link";
import { WaltLogo } from "./logo";

export function Header({ copy }: { copy: LandingCopy["nav"] }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className="wl-header" data-scrolled={scrolled}>
      <div className="wl-container flex h-16 items-center justify-between gap-4">
        <a href="#inicio" aria-label="Walt, inicio" className="shrink-0">
          <WaltLogo />
        </a>
        <nav aria-label="Secciones" className="hidden items-center gap-7 text-[0.95rem] text-(--wl-muted) lg:flex">
          {copy.links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-(--wl-text)">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/entrar" prefetch={false} className="hidden px-2 py-2 text-[0.95rem] text-(--wl-muted) transition-colors hover:text-(--wl-text) sm:inline">
            {copy.login}
          </Link>
          <CtaLink href="/registro" cta="beta" section="header" className="wl-btn wl-btn-primary min-h-10 px-4 text-[0.95rem]">
            {copy.cta}
          </CtaLink>
        </div>
      </div>
    </header>
  );
}
