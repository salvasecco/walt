# Estado

| Módulo | Sesión | Estado | Rama | Última novedad |
|---|---|---|---|---|
| base | 00-base | listo | main | Monorepo, `@dale/core` completo con pruebas, migración 0001 (probada en PGlite), check-env, seed, demo:reset, CLAUDE.md. Falta: migrar y sembrar Supabase cuando esté `SUPABASE_DB_URL`; activar CI (`ci/github-actions.yml`) |
| worker + ai | 01-worker | listo con fakes (falta credenciales) | 01-worker | `@dale/ai`: anthropic, bedrock y fake (salida estructurada, reintento, prompts en `packages/ai/prompts`). Worker: pipeline completo de §9 (permitido, riesgoso contenido/código, fuera de alcance con presupuesto, consulta, bloqueado, derivado), publicar/revertir con `publish_version` y commit (octokit o falso, `git_error` + `reintentar_commit`), captura Playwright real (probada contra dale-demo.vercel.app, 1,5 s), Telegram con grammY (polling y webhook, invitaciones, botones, update_id repetidos, 5 pedidos/10 min, audios con OpenAI), comandos del panel cada 1 s. Base: Postgres por `SUPABASE_DB_URL` (probado en PGlite con la migración) o memoria. Probar: `pnpm dry-run "subí el pan flauta a 95" --undo`, `pnpm start:worker` (consola), `pnpm --filter @dale/worker test` (41) y `pnpm --filter @dale/ai test` (8 casos reales se saltean sin ANTHROPIC_API_KEY). Falta: probar con modelo real, Telegram real, Supabase y GitHub reales; opciones para pedidos ambiguos. Pedidos a 90: mover `apps/worker/src/texts.ts` a `@dale/core/copy`; `PANEL_URL` en `.env.example`; actualizar la línea de `pnpm dry-run` en CLAUDE.md (`--approve`, `--undo`, `--project`) |
| panel | 02-panel | listo (falta credenciales) | 02-panel | Las 7 pantallas (En vivo, Aprobaciones, Historial + detalle, Proyectos, Reglas, Lo que piden, Presupuestos) + entrada con cookie firmada. Publicado en https://dale-panel.vercel.app (proyecto Vercel `dale-panel`, raíz `apps/panel`). Sin Supabase muestra "Falta conectar la base" y sin PANEL_PASSWORD queda cerrado. Local: `pnpm dev:panel` → http://localhost:3000 con datos de ejemplo y simulación del recorrido. Con credenciales: `bash apps/panel/scripts/sync-vercel-env.sh` desde la raíz. Falta probar con datos reales (Supabase) y el realtime con el worker. Capturas en `docs/capturas/` |
| sitio | 03-sitio | hecho | main (dale-demo) | Sitio demo hecho, en https://dale-demo.vercel.app; hoy lee el archivo local (`data-content-source="file"`). Falta conectar Supabase: `cd ../dale-demo && ./scripts/sync-vercel-env.sh`. `content/site.json` y `dale.config.json` iguales a los fixtures de core (verificado por 90) |
| agente + eval | 04-agente-eval | en curso | 04-agente-eval | `@dale/agent` completo: hook de rutas (lstat/realpath, symlinks, protegidos), entorno mínimo, revisión del diff, clone→agente→PR→vista previa, merge squash y revert; host GitHub (octokit) o local (`GITHUB_MODE=fake`). Probar: `pnpm --filter @dale/agent test` (17 en verde, sin red). Prueba real: `pnpm --filter @dale/agent smoke -- --close` (falta ANTHROPIC_API_KEY y GITHUB_TOKEN). Sigue: eval |
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
