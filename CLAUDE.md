# Walt — guía para las sesiones

Walt: asistente de una agencia que recibe pedidos de cambios de software por Telegram, los interpreta con IA, decide con reglas en código y publica. **La fuente de verdad es `docs/SPEC.md`**, actualizada por `docs/BRIEF-PRODUCCION.md` y el contrato del R1 (`docs/R1-CONTRATO.md`: taxonomía, esquema 0004 y RPC). Plan de producción en `docs/PRODUCCION.md` (releases, «Decisiones para Salva»), checklist en `docs/PRODUCCION-CHECKLIST.md` y negocio en `docs/NEGOCIO.md`. Decisiones en `docs/DECISIONES.md`, estado en `docs/ESTADO.md`, demo en `docs/DEMO.md`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala todo (pnpm workspaces, Node 24) |
| `pnpm typecheck` | `tsc` de los scripts + `pnpm -r typecheck` |
| `pnpm test` | `pnpm -r test` (vitest). Con `ANTHROPIC_API_KEY`, `@walt/ai` corre además casos contra el modelo real |
| `pnpm --filter @walt/panel lint` | Lint del panel (lo corre el CI) |
| `pnpm check` | Prueba cada credencial sin mostrarla y qué migraciones faltan. `pnpm check --md` da la tabla para `docs/ESTADO.md` |
| `pnpm db:migrate [--copy 0004]` | La red solo deja salir el 443: las migraciones se pegan a mano en el SQL Editor de Supabase. Sin argumentos comprueba por REST qué está aplicado (0001 a 0006); `--copy` copia una al portapapeles. Orden del R1: 0004 → 0006 → 0005 (esta, recién con el panel de Supabase Auth publicado). Nada usa `SUPABASE_DB_URL` |
| `pnpm seed` | Seed idempotente: agencia, proyecto de la panadería, reglas v1, versión viva, invitaciones y clientes de ejemplo |
| `pnpm demo:reset [--keep-repo]` | Deja el proyecto de la panadería como nuevo (con `GITHUB_MODE=real` también `content/site.json` del sitio) |
| `pnpm dry-run "<pedido>" [--approve] [--agency] [--undo] [--audio <archivo>] [--project <id>] [--memoria]` | Pipeline real del worker sin Telegram, en consola, con tiempos y costo. `--approve` aprueba (cliente, o la agencia si espera a la agencia); `--agency` además aprueba como agencia un cambio de código; `--undo` publica y vuelve atrás; `--memoria` usa la base en memoria aunque haya Supabase |
| `pnpm demo:r1 [simple] [delicado] [nuevo] [reetiqueta] [--dejar-pr]` | Los cuatro casos de la demo del R1 en memoria con el pipeline real: simple que se publica con el «Dale», delicado que espera a la agencia, algo nuevo con presupuesto y link de la seña, y una reetiqueta que cambia la decisión siguiente |
| `pnpm voice-test ["<texto>"] [--approve] [--undo] [--file <audio>]` | Genera un audio con `say` y lo pasa por el handler de voz del worker |
| `pnpm eval [--provider fake\|anthropic] [--model <id>] [--only s01,i09] [--out <dir>] [--compare <report.json>\|none]` | Evaluación (`eval/`, 90 casos en español y portugués): `eval/report.md` y `report.json`. Con un proveedor real compara contra la línea de base de antes del R1. Sin `--provider` usa el del entorno |
| `pnpm e2e [--strict]` | Punta a punta en el proceso: pedido → [Dale] → publicado → HTML del sitio → volver atrás → HTML. Publica en el sitio real: después, `pnpm demo:reset` |
| `pnpm ai:status <agencia>` · `pnpm ai:key set\|clear <agencia> [--project <id>]` · `pnpm ai:mode <agencia> walt\|byok\|credits\|claude_code [--project <id>] [--cap <USD>]` · `pnpm ai:credit <agencia> <USD> [--reference <id>]` | Modo de pago de la IA por agencia o proyecto (necesita 0004). La clave BYOK se lee de stdin, se valida y va al Vault; nunca se imprime |
| `pnpm github:install <agencia> <installation_id>` | Vincula una instalación de la GitHub App de Walt a una agencia (necesita `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` y 0004) |
| `scripts/run-worker.sh` | Worker con reinicio si se cae, log en `logs/worker.log` |
| `pnpm start:worker` | Arranca el worker: Telegram, cola (durable con 0004, si no en memoria) y `/healthz`, `/readyz` y `/metrics` en `PORT` (8080) |
| `docker build -t walt-worker .` · `docker run --rm -p 8080:8080 --env-file ~/.walt/.env -e TELEGRAM_MODE=console walt-worker` | Imagen del worker (Node 24, git, Chromium y el binario del Agent SDK) |
| `fly deploy` · `fly deploy -c fly.staging.toml` | Worker en Fly.io (producción y staging, blue-green). Antes: cuenta, secretos, 0004 aplicada y el worker de la compu apagado (dos bots con el mismo token se pisan) |
| `pnpm dev:panel` | Panel en el puerto 3000 (sin Supabase, con datos de ejemplo) |
| `bash apps/panel/scripts/sync-vercel-env.sh` | Carga las variables del panel en Vercel sin imprimirlas y lo publica en producción |

CI: `ci/github-actions.yml` (typecheck, lint, pruebas, eval falso, imagen del worker y migraciones con la CLI de Supabase). Para activarlo hace falta el scope `workflow` (ver `docs/DECISIONES.md`).

Antes de decir que algo terminó: `pnpm typecheck`, `pnpm test` y `pnpm eval` en verde; el eval no puede empeorar y el error caro (algo delicado que sale simple) tiene que dar 0.

## Estructura y dueños (SPEC §19)

| Carpeta | Dueño | Notas |
|---|---|---|
| raíz, `scripts/`, `ci/`, `.claude/` | 00-base y 90-integracion | |
| `packages/core` | 00-base y 90-integracion | Tipos, config, ops, reglas, gate, decide, interpretación, textos, precios, entorno. Las demás sesiones lo usan, no lo editan |
| `supabase/migrations` | 00 y 90 las existentes | Migraciones nuevas: archivo nuevo `000N_*.sql`, nunca editar uno existente |
| `apps/worker`, `packages/ai` | 01-worker | |
| `apps/panel` | 02-panel | |
| `../walt-demo` (otro repo) | 03-sitio | |
| `packages/agent`, `eval/` | 04-agente-eval | |
| `docs/ESTADO.md` | todas | Cada sesión actualiza solo su fila |

En el R1 (octubre de 2026) los dueños fueron por tema: `r1-plan` los documentos de producción, `r1-taxonomia` core, ai, eval, los flujos del worker y la doble clasificación del agente, `r1-infra` las migraciones 0004 a 0006, la store, la cola durable, la GitHub App, los modos de IA, Docker, Fly y el CI, y `r1-panel` el panel; la 90 integró.

Si necesitás un cambio en algo que no es tuyo (sobre todo `packages/core` o la raíz), pedíselo a la 90 en tu reporte o en tu fila de `docs/ESTADO.md`; no lo edites.

Paquetes: `@walt/core`, `@walt/ai`, `@walt/agent`, `@walt/worker`, `@walt/panel`, `@walt/eval`. Se importan como TypeScript fuente (sin build): `exports` apunta a `src/*.ts`, y se corre con `tsx`.

- `@walt/core` es para Node (usa `node:fs` y ajv). En el navegador usá `@walt/core/browser` (sin `runGate`, `loadEnv` ni fixtures). Textos: `@walt/core/copy`.
- Fixtures de la panadería: `@walt/core/fixtures` (`bakeryContent()`, `bakeryConfig()`, `bakerySchema()`), archivos en `packages/core/test/fixtures/`.
- Ids fijos del seed: `SEED_IDS.agency = 22222222-2222-4222-8222-222222222222`, `SEED_IDS.project = 11111111-1111-4111-8111-111111111111`.

## Entorno

- Los secretos viven en `~/.walt/.env`, fuera de los repos. `loadEnv()` de `@walt/core` lee ese archivo, después un `.env` local y después `process.env` (gana el último); los valores vacíos cuentan como no definidos. Plantilla: `.env.example`.
- Modos falsos para trabajar sin credenciales: `LLM_PROVIDER=fake`, `GITHUB_MODE=fake`, `TELEGRAM_MODE=console`, `SCREENSHOTS=off`. `loadEnv({ fallbackToFake: true })` baja a modo falso lo que no tenga credenciales y lo lista en `env.downgraded`. **La demo corre siempre con el modelo real.**
- Modelos: `MODEL_INTERPRET` clasifica (por defecto `claude-haiku-5-5`, con respaldo en Sonnet 5.5) y `MODEL_AGENT` escribe el código (`claude-sonnet-5-5`, con reintento en Opus 5.5).
- GitHub: `GITHUB_TOKEN` solo para las agencias de `GITHUB_TOKEN_FACTORIES` (por defecto, la del seed); las demás, con la GitHub App de Walt (`GITHUB_APP_ID` y `GITHUB_APP_PRIVATE_KEY`) o derivado. Worker: `WORKER_QUEUE` (`auto`, `durable` o `memoria`), `PORT`, `LOG_FORMAT=json` en producción.
- `env.secrets` tiene los valores secretos para el gate y para `redact()`.

## Regla de oro: nunca imprimas un secreto

Ni en logs, ni en commits, ni en el chat, ni en errores. Mostrá nombres de variables, nunca valores. Pasá todo texto externo (errores de APIs, salidas de git) por `redact(texto, env.secrets)` antes de loguearlo. Nada de `.env` con valores en el repo (`.gitignore` lo cubre, salvo `.env.example`).

## Commits

- Chicos, con mensajes claros en español y prefijo (`feat(core): …`, `fix(worker): …`, `test: …`, `docs: …`). La revisión técnica lee el historial.
- Código en inglés; textos para usuarios en español rioplatense con voseo.
- Push por HTTPS (los remotes ya están así; SSH se cuelga).
- El token de `gh` no tiene scope `workflow`: no se pueden pushear archivos en `.github/workflows/`. El CI está en `ci/github-actions.yml` hasta que alguien lo active (ver `docs/DECISIONES.md`).

## Sesiones, worktrees y coordinación con la 90

- Cada sesión trabaja en un worktree propio: `/Users/salvadorsecco/orca/projects/walt-worktrees/<nombre>` en la rama `<nombre>` (por ejemplo `walt-worktrees/01-worker`, rama `01-worker`). La 00 y la 90 trabajan en `main` en `/Users/salvadorsecco/orca/projects/walt`. La 03 trabaja en `main` de `../walt-demo`.
- Crear el worktree: `git -C /Users/salvadorsecco/orca/projects/walt worktree add /Users/salvadorsecco/orca/projects/walt-worktrees/<nombre> -b <nombre> main`, y `pnpm install` adentro.
- Traer novedades de main seguido: `git pull --rebase origin main` (o `git rebase origin/main`).
- **Protocolo con la 90 (reemplaza al SendMessage del SPEC):** las sesiones informan sus hitos con commits + push de su rama, actualizando su fila de `docs/ESTADO.md` (estado, rama, última novedad: qué hizo, cómo probarlo y qué falta), y en su reporte final. La 90 hace los merges a `main`; nadie más mergea a `main` salvo la 00 durante la base.
- Sin preguntas al usuario: decidí lo más simple que funcione y anotalo con una línea en `docs/DECISIONES.md`. Solo se le escribe a Salva por credenciales que falten, todo junto.
