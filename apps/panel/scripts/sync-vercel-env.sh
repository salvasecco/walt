#!/usr/bin/env bash
# Copia las variables del panel desde ~/.walt/.env al proyecto walt-panel de Vercel, sin imprimir valores,
# y vuelve a publicar. Correr desde la raíz del repo (con .vercel enlazado a walt-panel):
#   bash apps/panel/scripts/sync-vercel-env.sh
set -euo pipefail
ENV_FILE="${HOME}/.walt/.env"
KEYS=(SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY PANEL_PASSWORD GITHUB_TOKEN TELEGRAM_BOT_USERNAME DEMO_AGENCY_NAME DEMO_SITE_URL)
[ -d .vercel ] || vercel link --yes --project walt-panel >/dev/null
rm -f .env.local
missing=()
for k in "${KEYS[@]}"; do
  v=$(grep -E "^${k}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E "s/^[\"']|[\"']$//g" || true)
  if [ -z "$v" ]; then missing+=("$k"); continue; fi
  for e in production preview; do
    printf '%s' "$v" | vercel env add "$k" "$e" --force >/dev/null 2>&1 || { echo "No se pudo cargar $k ($e)"; exit 1; }
  done
  echo "ok  $k"
done
[ ${#missing[@]} -gt 0 ] && echo "faltan: ${missing[*]}"
vercel deploy --prod --yes >/dev/null && echo "publicado: https://walt-panel.vercel.app"
