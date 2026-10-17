
/**
 * Entorno del panel. En local, next.config.ts carga ~/.walt/.env antes de arrancar.
 * Nunca se imprime ningún valor.
 */
const read = (...keys: string[]) => {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
};

export const env = {
  supabaseUrl: read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: read("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: read("SUPABASE_SERVICE_ROLE_KEY"),
  panelPassword: read("PANEL_PASSWORD"),
  githubToken: read("GITHUB_TOKEN"),
  botUsername: read("TELEGRAM_BOT_USERNAME"),
  agencyName: read("DEMO_AGENCY_NAME") || "Estudio Faro",
  demoSiteUrl: read("DEMO_SITE_URL"),
  isProduction: process.env.NODE_ENV === "production",
};

export type DataMode = "supabase" | "ejemplo" | "sin_configurar";

/** Datos reales si hay Supabase; datos de ejemplo solo en desarrollo; en producción, nunca. */
export function dataMode(): DataMode {
  if (env.supabaseUrl && env.supabaseServiceKey) return "supabase";
  return env.isProduction ? "sin_configurar" : "ejemplo";
}

export function publicSupabase() {
  return env.supabaseUrl && env.supabaseAnonKey
    ? { url: env.supabaseUrl, anonKey: env.supabaseAnonKey }
    : null;
}
