import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/landing/site";

// Solo la landing se indexa; el panel, la entrada y las rutas internas no.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/atencion", "/en-vivo", "/aprobaciones", "/historial", "/proyectos", "/reglas", "/ia", "/equipo", "/clientes",
        "/calidad", "/lo-que-piden", "/presupuestos", "/entrar", "/registro", "/auth/", "/api/", "/plan/", "/legal/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
