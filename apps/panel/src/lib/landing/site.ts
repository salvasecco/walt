// URL pública del sitio, para las URLs absolutas de la landing (Open Graph, sitemap, datos estructurados).
export function siteUrl(): string {
  const fromEnv = process.env.PANEL_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (fromEnv || "https://walt-panel.vercel.app").replace(/\/$/, "");
}
