import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NextConfig } from "next";

// En local, los secretos viven en ~/.walt/.env (SPEC §4). En Vercel salen de las variables del proyecto.
// Solo completa las variables que no estén definidas; nunca imprime valores.
function loadWaltEnv() {
  if (process.env.VERCEL) return;
  const file = join(homedir(), ".walt", ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, raw] = m;
    const v = raw.replace(/^["']|["']$/g, "");
    if (v && !process.env[k]) process.env[k] = v;
  }
}
loadWaltEnv();

const nextConfig: NextConfig = {
  devIndicators: false,
  // Tipos y lint corren en `pnpm typecheck` y en CI (ci/github-actions.yml), no dentro del build de Vercel (~4 s menos).
  // Next 16 ya no lintea en `next build`.
  typescript: { ignoreBuildErrors: true },
  // Panel 100% dinámico (datos en vivo): sin Cache Components. Ver docs/DECISIONES.md.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
      // @walt/ai se importa como fuente TS con imports './x.js' y prompts leídos del disco: el loader los
      // adapta para Turbopack (loaders/walt-ai.cjs). Ver docs/DECISIONES.md, "R1 panel".
      "*.ts": {
        condition: { path: /packages\/ai\/src\// },
        loaders: [join(__dirname, "loaders", "walt-ai.cjs")],
        as: "*.ts",
      },
    },
  },
};

export default nextConfig;
