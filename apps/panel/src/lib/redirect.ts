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

/** Rutas que se ven sin sesión: la entrada, el registro y lo público de la landing (que vive en `/`). */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/entrar" ||
    pathname === "/registro" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/legal/") ||
    pathname === "/api/eventos" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image")
  );
}

/**
 * En `/` vive la landing pública. Quien ya entró al panel va a Atención, salvo que pida ver la landing
 * (`/?landing`), por ejemplo para revisarla desde una sesión.
 */
export function landingRedirect(pathname: string, search: URLSearchParams, authed: boolean): string | null {
  if (pathname !== "/" || !authed || search.has("landing")) return null;
  return "/atencion";
}
