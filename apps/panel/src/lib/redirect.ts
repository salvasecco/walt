// Utilidades puras de la entrada al panel.

/** Solo rutas del mismo sitio: rechaza "//x", "/\x" y todo lo que resuelva a otro origen. */
export function safeRedirect(desde: string | null | undefined, fallback = "/atencion"): string {
  if (!desde || !desde.startsWith("/") || desde.includes("\\")) return fallback;
  try {
    const u = new URL(desde, "http://panel.local");
    return u.origin === "http://panel.local" ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}

/** Cookies de sesión de Supabase Auth (`sb-<ref>-auth-token`, partida en `.0`, `.1`… si es larga). */
export function isSupabaseAuthCookie(name: string): boolean {
  return /^sb-[^-]+(-[^-]+)*-auth-token(\.\d+)?$/.test(name) && !name.includes("code-verifier");
}

/** Rutas que se ven sin sesión. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/entrar" || pathname === "/registro" || pathname.startsWith("/auth/");
}
