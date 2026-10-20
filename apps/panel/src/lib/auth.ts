import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const SESSION_COOKIE = "walt_panel";
const MAX_AGE_S = 60 * 60 * 24 * 7;

function key() {
  return createHash("sha256").update(`walt-panel:${env.panelPassword}`).digest();
}

function sign(payload: string) {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Sin PANEL_PASSWORD: en desarrollo el panel queda abierto; en producción, cerrado. */
export function authMode(): "password" | "abierto" | "sin_configurar" {
  if (env.panelPassword) return "password";
  return env.isProduction ? "sin_configurar" : "abierto";
}

export function createSessionValue(now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE_S;
  const payload = `v1.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: MAX_AGE_S };
}

export function verifySessionValue(value: string | undefined, now = Date.now()): boolean {
  if (!value || !env.panelPassword) return false;
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  const payload = value.slice(0, i);
  const sig = value.slice(i + 1);
  const [v, expS] = payload.split(".");
  if (v !== "v1") return false;
  const exp = Number(expS);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  return safeEqual(sig, sign(payload));
}

export function checkPassword(input: string): boolean {
  if (!env.panelPassword) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(env.panelPassword).digest();
  return timingSafeEqual(a, b);
}
