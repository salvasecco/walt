# Estado

| Módulo | Sesión | Estado | Rama | Última novedad |
|---|---|---|---|---|
| base | 00-base | listo | main | Monorepo, `@dale/core` completo con pruebas, migración 0001 (probada en PGlite), check-env, seed, demo:reset, CLAUDE.md. Falta: migrar y sembrar Supabase cuando esté `SUPABASE_DB_URL`; activar CI (`ci/github-actions.yml`) |
| worker + ai | 01-worker | pendiente | 01-worker | — |
| panel | 02-panel | pendiente | 02-panel | — |
| sitio | 03-sitio | hecho | main (dale-demo) | Sitio demo hecho, en https://dale-demo.vercel.app; hoy lee el archivo local (`data-content-source="file"`). Falta conectar Supabase: `cd ../dale-demo && ./scripts/sync-vercel-env.sh`. `content/site.json` y `dale.config.json` iguales a los fixtures de core (verificado por 90) |
| agente + eval | 04-agente-eval | listo (sin prueba real) | 04-agente-eval | `@dale/agent`: hook de rutas (lstat/realpath, symlinks, protegidos), entorno mínimo, revisión del diff, clone→agente→PR→vista previa, merge squash y revert; host GitHub (octokit) o local (`GITHUB_MODE=fake`). Eval: 30 sintéticos + 10 inyecciones, `pnpm eval` → `eval/report.md` y `report.json` (hoy con el proveedor falso: categoría 86,7%, ops 53,8%, 0 falsos permitidos, 0 prohibidos aplicados). Probar: `pnpm --filter @dale/agent test`, `pnpm --filter @dale/eval test`, `pnpm eval`. Falta: prueba real del agente (`pnpm --filter @dale/agent smoke -- --close`, necesita ANTHROPIC_API_KEY y GITHUB_TOKEN) y `pnpm eval --provider anthropic` cuando 01 suba el proveedor real. security-review sin hallazgos ≥8; se endureció la revisión del diff |
| integración | 90-integracion | en curso | main | Preparado: `scripts/run-worker.sh`, `demo:reset` también reinicia el repo del sitio, README, `docs/DEMO.md`. Esperando ramas 01, 04 y 02 para mergear |

## Credenciales (`pnpm check`, 2026-10-17)

| Chequeo | Estado | Detalle |
|---|---|---|
| Telegram (getMe) | ❌ | falta TELEGRAM_BOT_TOKEN |
| Supabase (select con service role) | ❌ | falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY |
| Supabase (clave anon) | ❌ | falta SUPABASE_ANON_KEY |
| Postgres (SUPABASE_DB_URL) | ❌ | falta SUPABASE_DB_URL (solo para migraciones y seed) |
| GitHub (usuario y acceso a salvasecco/dale-demo) | ❌ | falta GITHUB_TOKEN (modo real) |
| Modelo (anthropic) | ❌ | falta ANTHROPIC_API_KEY |
| Vercel (vercel whoami) | ✅ | sesión iniciada |
| Panel (PANEL_PASSWORD) | ❌ | falta |
| Sitio demo (DEMO_SITE_URL) | ✅ | definida |
| Audios (OPENAI_API_KEY, opcional) | ❌ | sin audios: se pide por escrito |

Faltan: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, GITHUB_TOKEN, ANTHROPIC_API_KEY (o AWS para Bedrock), PANEL_PASSWORD. Opcional: OPENAI_API_KEY.
