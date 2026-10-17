# Dale — guía para las sesiones

Dale: asistente de una agencia que recibe pedidos de cambios web por Telegram, los interpreta con IA, decide con reglas en código y publica. **La fuente de verdad es `docs/SPEC.md`.** Decisiones en `docs/DECISIONES.md`, estado en `docs/ESTADO.md`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala todo (pnpm workspaces, Node 24) |
| `pnpm typecheck` | `tsc` de los scripts + `pnpm -r typecheck` |
| `pnpm test` | `pnpm -r test` (vitest) |
| `pnpm check` | Prueba cada credencial sin mostrarla. `pnpm check --md` da la tabla para `docs/ESTADO.md` |
| `pnpm db:migrate` | La red solo deja salir el 443: las migraciones se pegan a mano en el SQL Editor de Supabase. Comprueba por REST qué está aplicado; `--copy 0001` copia una migración al portapapeles. Nada usa `SUPABASE_DB_URL` |
| `pnpm seed` | Seed idempotente: agencia, proyecto de la panadería, reglas v1, versión viva e invitaciones |
| `pnpm demo:reset` | Deja el proyecto de la panadería como nuevo (no toca el repo del sitio) |
| `pnpm dry-run "<pedido>" [--approve] [--undo] [--project <id>]` | Pipeline real del worker sin Telegram, en consola, con tiempos. `--approve` aprueba y publica; `--undo` además vuelve atrás |
| `pnpm eval` | Evaluación (`eval/`) |
| `pnpm e2e [--strict]` | Punta a punta en el proceso: pedido → [Dale] → publicado → HTML del sitio → volver atrás → HTML. Dice qué partes fueron reales |
| `scripts/run-worker.sh` | Worker con reinicio si se cae, log en `logs/worker.log` |
| `pnpm start:worker` | Arranca el worker |
| `pnpm dev:panel` | Panel en el puerto 3000 |

Antes de decir que algo terminó: `pnpm typecheck` y `pnpm test` en verde.

## Estructura y dueños (SPEC §19)

| Carpeta | Dueño | Notas |
|---|---|---|
| raíz, `scripts/`, `ci/`, `.claude/` | 00-base y 90-integracion | |
| `packages/core` | 00-base y 90-integracion | Tipos, config, ops, reglas, gate, decide, interpretación, textos, precios, entorno. Las demás sesiones lo usan, no lo editan |
| `supabase/migrations` | 00 y 90 las existentes | Migraciones nuevas: archivo nuevo `000N_*.sql`, nunca editar uno existente |
| `apps/worker`, `packages/ai` | 01-worker | |
| `apps/panel` | 02-panel | |
| `../dale-demo` (otro repo) | 03-sitio | |
| `packages/agent`, `eval/` | 04-agente-eval | |
| `docs/ESTADO.md` | todas | Cada sesión actualiza solo su fila |

Si necesitás un cambio en algo que no es tuyo (sobre todo `packages/core` o la raíz), pedíselo a la 90 en tu reporte o en tu fila de `docs/ESTADO.md`; no lo edites.

Paquetes: `@dale/core`, `@dale/ai`, `@dale/agent`, `@dale/worker`, `@dale/panel`, `@dale/eval`. Se importan como TypeScript fuente (sin build): `exports` apunta a `src/*.ts`, y se corre con `tsx`.

- `@dale/core` es para Node (usa `node:fs` y ajv). En el navegador usá `@dale/core/browser` (sin `runGate`, `loadEnv` ni fixtures). Textos: `@dale/core/copy`.
- Fixtures de la panadería: `@dale/core/fixtures` (`bakeryContent()`, `bakeryConfig()`, `bakerySchema()`), archivos en `packages/core/test/fixtures/`.
- Ids fijos del seed: `SEED_IDS.agency = 22222222-2222-4222-8222-222222222222`, `SEED_IDS.project = 11111111-1111-4111-8111-111111111111`.

## Entorno

- Los secretos viven en `~/.dale/.env`, fuera de los repos. `loadEnv()` de `@dale/core` lee ese archivo, después un `.env` local y después `process.env` (gana el último); los valores vacíos cuentan como no definidos. Plantilla: `.env.example`.
- Modos falsos para trabajar sin credenciales: `LLM_PROVIDER=fake`, `GITHUB_MODE=fake`, `TELEGRAM_MODE=console`, `SCREENSHOTS=off`. `loadEnv({ fallbackToFake: true })` baja a modo falso lo que no tenga credenciales y lo lista en `env.downgraded`. **La demo corre siempre con el modelo real.**
- `env.secrets` tiene los valores secretos para el gate y para `redact()`.

## Regla de oro: nunca imprimas un secreto

Ni en logs, ni en commits, ni en el chat, ni en errores. Mostrá nombres de variables, nunca valores. Pasá todo texto externo (errores de APIs, salidas de git) por `redact(texto, env.secrets)` antes de loguearlo. Nada de `.env` con valores en el repo (`.gitignore` lo cubre, salvo `.env.example`).

## Commits

- Chicos, con mensajes claros en español y prefijo (`feat(core): …`, `fix(worker): …`, `test: …`, `docs: …`). La revisión técnica lee el historial.
- Código en inglés; textos para usuarios en español rioplatense con voseo.
- Push por HTTPS (los remotes ya están así; SSH se cuelga).
- El token de `gh` no tiene scope `workflow`: no se pueden pushear archivos en `.github/workflows/`. El CI está en `ci/github-actions.yml` hasta que alguien lo active (ver `docs/DECISIONES.md`).

## Sesiones, worktrees y coordinación con la 90

- Cada sesión trabaja en un worktree propio: `/Users/salvadorsecco/orca/projects/walt-worktrees/<nombre>` en la rama `<nombre>` (por ejemplo `walt-worktrees/01-worker`, rama `01-worker`). La 00 y la 90 trabajan en `main` en `/Users/salvadorsecco/orca/projects/walt`. La 03 trabaja en `main` de `../dale-demo`.
- Crear el worktree: `git -C /Users/salvadorsecco/orca/projects/walt worktree add /Users/salvadorsecco/orca/projects/walt-worktrees/<nombre> -b <nombre> main`, y `pnpm install` adentro.
- Traer novedades de main seguido: `git pull --rebase origin main` (o `git rebase origin/main`).
- **Protocolo con la 90 (reemplaza al SendMessage del SPEC):** las sesiones informan sus hitos con commits + push de su rama, actualizando su fila de `docs/ESTADO.md` (estado, rama, última novedad: qué hizo, cómo probarlo y qué falta), y en su reporte final. La 90 hace los merges a `main`; nadie más mergea a `main` salvo la 00 durante la base.
- Sin preguntas al usuario: decidí lo más simple que funcione y anotalo con una línea en `docs/DECISIONES.md`. Solo se le escribe a Salva por credenciales que falten, todo junto.
