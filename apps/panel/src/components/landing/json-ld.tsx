import { PLANS } from "@/lib/landing/config";

/** Datos estructurados del producto: qué es y sus tres planes (precios de lanzamiento). */
export function JsonLd({ url, description }: { url: string; description: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Walt",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url,
    description,
    inLanguage: "es",
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: String(p.monthly),
      priceCurrency: "USD",
      category: "subscription",
      url: `${url}#precios`,
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
