import { es } from "@/lib/landing/copy.es";
import { Audiences } from "./audiences";
import { Comparison } from "./comparison";
import { Faq } from "./faq";
import { FinalCta, Footer } from "./final-cta";
import { body, display } from "./fonts";
import { Header } from "./header";
import { Hero } from "./hero";
import { JsonLd } from "./json-ld";
import "./landing.css";
import { Money } from "./money";
import { PanelTour } from "./panel-tour";
import { Paths } from "./paths";
import { Pricing } from "./pricing";
import { Problem } from "./problem";
import { RoiCalculator } from "./roi-calculator";
import { Safety } from "./safety";

/** La landing pública (docs/LANDING.md §9). Estática: no lee sesión ni base. */
export function Landing({ siteUrl }: { siteUrl: string }) {
  const copy = es;
  return (
    <div className={`wl ${display.variable} ${body.variable}`} lang="es">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black">
        Saltar al contenido
      </a>
      <Header copy={copy.nav} />
      <main id="contenido">
        <Hero copy={copy.hero} phone={copy.phone} />
        <Problem copy={copy.problem} />
        <Paths copy={copy.paths} />
        <Safety copy={copy.safety} />
        <PanelTour copy={copy.tour} />
        <Audiences copy={copy.audiences} />
        <Money copy={copy.money} />
        <RoiCalculator copy={copy.calculator} />
        <Pricing copy={copy.pricing} />
        <Comparison copy={copy.comparison} />
        <Faq copy={copy.faq} />
        <FinalCta copy={copy.final} />
      </main>
      <Footer copy={copy.footer} />
      <JsonLd url={siteUrl} description={copy.meta.description} />
    </div>
  );
}
