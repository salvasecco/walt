import Link from "next/link";
import { body, display } from "./fonts";
import "./landing.css";
import { WaltLogo } from "./logo";

/** Página legal en borrador: se ve como borrador, no se indexa y no es un texto vigente. */
export function LegalDraft({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string[] }[] }) {
  return (
    <div className={`wl ${display.variable} ${body.variable} min-h-dvh`} lang="es">
      <header className="wl-container flex h-16 items-center justify-between">
        <Link href="/" aria-label="Walt, inicio">
          <WaltLogo />
        </Link>
      </header>
      <main className="wl-container max-w-3xl pb-24 pt-6">
        <p role="note" className="rounded-2xl border border-(--wl-amber) bg-[rgb(243_179_76/0.1)] p-4 text-[0.98rem] leading-relaxed">
          <strong>Borrador para revisar con un abogado.</strong> No es un texto legal vigente: Walt está en beta privada y todavía no tiene entidad legal
          constituida. Los datos entre corchetes están por completar.
        </p>
        <h1 className="wl-h2 mt-10">{title}</h1>
        <p className="mt-3 text-sm text-(--wl-muted)">Borrador del {updated}.</p>
        {sections.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="wl-h3">{s.h}</h2>
            {s.p.map((p) => (
              <p key={p} className="mt-3 leading-relaxed text-(--wl-muted)">
                {p}
              </p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
