import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { es } from "@/lib/landing/copy.es";
import { siteUrl } from "@/lib/landing/site";

// La landing pública. Quien ya entró al panel no llega acá: el proxy lo manda a Atención.
// Estática: no lee la sesión ni la base, así carga rápido desde un link de WhatsApp o LinkedIn.

export const metadata: Metadata = {
  title: { absolute: es.meta.title },
  description: es.meta.description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "es_UY",
    siteName: "Walt",
    url: "/",
    title: es.meta.title,
    description: es.meta.description,
  },
  twitter: { card: "summary_large_image", title: es.meta.title, description: es.meta.description },
};

export default function Home() {
  return <Landing siteUrl={siteUrl()} />;
}
