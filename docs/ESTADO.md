# Estado

| Módulo | Sesión | Estado | Rama | Última novedad |
|---|---|---|---|---|
| base | 00-base | listo | main | Monorepo, `@dale/core` completo con pruebas, migración 0001 (probada en PGlite), check-env, seed, demo:reset, CLAUDE.md. Falta: migrar y sembrar Supabase cuando esté `SUPABASE_DB_URL`; activar CI (`ci/github-actions.yml`) |
| worker + ai | 01-worker | pendiente | 01-worker | — |
| panel | 02-panel | pendiente | 02-panel | — |
| sitio | 03-sitio | pendiente | main (dale-demo) | — |
| agente + eval | 04-agente-eval | en curso | 04-agente-eval | `@dale/agent` completo: hook de rutas (lstat/realpath, symlinks, protegidos), entorno mínimo, revisión del diff, clone→agente→PR→vista previa, merge squash y revert; host GitHub (octokit) o local (`GITHUB_MODE=fake`). Probar: `pnpm --filter @dale/agent test` (17 en verde, sin red). Prueba real: `pnpm --filter @dale/agent smoke -- --close` (falta ANTHROPIC_API_KEY y GITHUB_TOKEN). Sigue: eval |
| integración | 90-integracion | pendiente | main | — |

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
