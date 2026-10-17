import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, verifySessionValue } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "abierto") return NextResponse.next();
  const ok = mode === "password" && verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = request.nextUrl.pathname === "/" ? "" : `?desde=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!entrar|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
