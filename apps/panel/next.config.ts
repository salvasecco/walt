import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NextConfig } from "next";

// En local, los secretos viven en ~/.dale/.env (SPEC §4). En Vercel salen de las variables del proyecto.
// Solo completa las variables que no estén definidas; nunca imprime valores.
function loadDaleEnv() {
  if (process.env.VERCEL) return;
  const file = join(homedir(), ".dale", ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, raw] = m;
    const v = raw.replace(/^["']|["']$/g, "");
    if (v && !process.env[k]) process.env[k] = v;
  }
}
loadDaleEnv();

const nextConfig: NextConfig = {
  // Panel 100% dinámico (datos en vivo): sin Cache Components. Ver docs/DECISIONES.md.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
