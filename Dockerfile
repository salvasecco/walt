# syntax=docker/dockerfile:1.7
# Walt worker: Node 24 + pnpm, git (el agente clona y pushea), Chromium de Playwright (capturas de las
# vistas previas) y el binario del Claude Agent SDK (paquete de plataforma de @anthropic-ai/claude-agent-sdk).
#
#   docker build -t walt-worker .
#   docker run --rm -p 8080:8080 --env-file ~/.walt/.env -e TELEGRAM_MODE=console walt-worker
#
# En Fly.io lo construye `fly deploy` (linux/amd64); ver fly.toml.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN npm install -g pnpm@12.4.2 && pnpm --version
WORKDIR /app

# Dependencias: solo cambian con el lockfile y los package.json (capa cacheada).
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/panel/package.json apps/panel/
COPY packages/core/package.json packages/core/
COPY packages/ai/package.json packages/ai/
COPY packages/agent/package.json packages/agent/
COPY eval/package.json eval/
# El worker y sus paquetes del workspace (core, ai, agent). Incluye tsx (corre el TypeScript sin build)
# y el binario del Agent SDK para esta plataforma.
RUN pnpm install --frozen-lockfile --filter "@walt/worker..."

FROM base AS runtime
# git para el agente; tini como PID 1 (pasa SIGTERM al worker para el apagado ordenado).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY packages/ai ./packages/ai
COPY packages/agent ./packages/agent
COPY apps/worker ./apps/worker
# Chromium (solo el headless shell: las capturas corren sin ventana) con sus librerías del sistema, de la
# misma versión que el playwright del worker.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN cd apps/worker \
  && node_modules/.bin/playwright install --with-deps --only-shell chromium \
  && chmod -R a+rX /ms-playwright \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production PORT=8080 LOG_FORMAT=json HOME=/home/node
USER node
WORKDIR /app/apps/worker
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "src/index.ts"]
