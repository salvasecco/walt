import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, verifySessionValue } from "@/lib/auth";
import { env } from "@/lib/env";
import { isPublicPath, isSupabaseAuthCookie, landingRedirect } from "@/lib/redirect";

/**
 * Chequeo optimista de la entrada: refresca la sesión de Supabase Auth (si hay) y deja pasar si hay usuario,
 * contraseña del panel válida o el panel está abierto en desarrollo. Quién ve qué lo decide el servidor en
 * cada página y cada acción (lib/session.ts): una contraseña no vale si ya hay usuarios con agencia.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let user = false;
  if (env.supabaseUrl && env.supabaseAnonKey && request.cookies.getAll().some((c) => isSupabaseAuthCookie(c.name))) {
    const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    user = !!data?.claims?.sub;
  }
  const { pathname } = request.nextUrl;
  const mode = authMode();
  const authed = user || mode === "abierto" || (mode === "password" && verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value));
  const toPanel = landingRedirect(pathname, request.nextUrl.searchParams, authed);
  if (toPanel) {
    const url = request.nextUrl.clone();
    url.pathname = toPanel;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  if (isPublicPath(pathname)) return response;
  if (authed) return response;
  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = pathname === "/" ? "" : `?desde=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  const redirect = NextResponse.redirect(url);
  for (const c of response.cookies.getAll()) redirect.cookies.set(c);
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
