# Dale

Un asistente al que los clientes de una agencia le piden cambios chicos de su web por Telegram. La IA interpreta el pedido, el código decide con reglas y valida con un gate, y se publica en segundos. La agencia ve todo en vivo desde un panel.

**Principio:** un modelo decide, la IA ejecuta y el código valida. La IA nunca tiene la última palabra.

| Salida | Cuándo | Qué pasa |
|---|---|---|
| Permitido | Textos, precios, colores, horarios, disponibilidad dentro de las reglas | Captura del celular, el cliente aprueba con un botón, se publica. Se revierte con otro botón |
| Riesgoso | Cartel de promoción, precio que cambia más del límite, poca confianza, código | Aprueba la agencia (panel o Telegram). Si es código: agente en una rama, PR y vista previa |
| Fuera de alcance | Una función nueva | Borrador de presupuesto para la agencia |
| Consulta | "¿A qué hora abren el domingo?" | Contesta con lo que dice la web |
| Bloqueado | Lo que las reglas o la seguridad no permiten | No se aplica nada; la agencia queda avisada |
| Derivado | Cualquier falla o timeout | "Se lo pasé a tu equipo". Ningún pedido queda colgado |

- **Sitio demo:** https://dale-demo.vercel.app (Panadería Mabel, repo `salvasecco/dale-demo`)
- **Panel:** https://dale-panel.vercel.app (entrada con `PANEL_PASSWORD`)
- **Especificación:** [`docs/SPEC.md`](docs/SPEC.md) · decisiones en [`docs/DECISIONES.md`](docs/DECISIONES.md) · estado en [`docs/ESTADO.md`](docs/ESTADO.md) · guion en [`docs/DEMO.md`](docs/DEMO.md)

## Arquitectura

```
Telegram ──▶ apps/worker: un solo proceso Node (local, polling)
               ├─ acceso: chat vinculado por invitación (link o QR con token)
               ├─ cola rápida (concurrencia 1) y cola lenta para el agente (concurrencia 1)
               ├─ interpretar: @dale/ai, Claude con salida estructurada
               ├─ decidir: @dale/core, reglas y gate, sin IA
               │    ├─ permitido → borrador → captura → [Dale] → publicar
               │    ├─ riesgoso → aprueba la agencia → contenido: publicar · código: @dale/agent
               │    ├─ fuera de alcance → borrador de presupuesto
               │    ├─ consulta → respuesta
               │    └─ falla o timeout → derivado
               ├─ publicar: versión viva en Supabase + commit en el repo del sitio
               └─ comandos del panel: tabla commands, sondeo cada segundo
apps/panel (Next.js, Vercel) ◀── realtime ──▶ Supabase ◀── lee la versión viva ── sitio demo (otro repo, Vercel)
@dale/agent: Claude Agent SDK en un clon temporal → rama → PR → vista previa de Vercel → merge o revert
```

| Paquete | Qué hace |
|---|---|
| `packages/core` (`@dale/core`) | Tipos, operaciones (`applyOps`, `revertChanges`), reglas, `runGate`, `decide`, textos, precios de modelos, entorno |
| `packages/ai` (`@dale/ai`) | Proveedores de modelo, interpretación, consultas, presupuestos |
| `packages/agent` (`@dale/agent`) | Carril de código con Claude Agent SDK |
| `apps/worker` (`@dale/worker`) | Bot de Telegram, colas, pipeline, comandos del panel, `dry-run` |
| `apps/panel` (`@dale/panel`) | Panel de la agencia |
| `eval/` (`@dale/eval`) | Casos y corredor de evaluación |
| `supabase/migrations` | SQL con RLS, realtime y `publish_version` |
| `scripts/` | `check-env`, `db-migrate`, `seed`, `demo:reset`, `e2e`, `run-worker.sh` |

**Por qué así:** un solo proceso (menos piezas que se caen en vivo); el sitio lee su contenido de Supabase en cada request (publicar y revertir tardan un segundo, sin builds; git queda como historial); lo permitido nunca ejecuta código, son operaciones con tipo sobre un JSON validado; el código del agente se construye en Vercel, nunca en el proceso que tiene los secretos.

## Cómo correrlo

Requisitos: Node 24 y pnpm 12.

```bash
pnpm install
cp .env.example ~/.dale/.env     # completar fuera del repo; nunca se sube
pnpm check                       # prueba cada credencial sin mostrarla
pnpm db:migrate                  # dice qué migración pegar en el SQL Editor (la red solo deja salir el 443)
pnpm seed                        # datos de la panadería por HTTPS; imprime los links de invitación
scripts/run-worker.sh            # worker con reinicio automático, log en logs/worker.log
pnpm dev:panel                   # panel en http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `pnpm dry-run "subí el pan flauta a 95" [--approve]` | El pipeline real sin Telegram, paso a paso con tiempos |
| `pnpm e2e` | Pide, aprueba, publica, mira el HTML del sitio, revierte y vuelve a mirar |
| `pnpm eval` | Evaluación sobre el contenido de la panadería (`eval/report.md`) |
| `pnpm demo:reset` | Deja el sitio y el proyecto como nuevos |
| `pnpm typecheck` · `pnpm test` | Tipos y pruebas |

Modos falsos para desarrollar sin credenciales: `LLM_PROVIDER=fake`, `GITHUB_MODE=fake`, `TELEGRAM_MODE=console`, `SCREENSHOTS=off`. **La demo corre siempre con el modelo real.** El intérprete falso es un juego de expresiones regulares para pruebas y nunca se usa en la demo.

## Qué es real y qué falta

Estado al 2026-10-17. Todo lo de abajo está en `main`; `pnpm typecheck` y `pnpm test` en verde (core 98, ai 25 + 8 que piden la clave, agent 17, eval 12, worker 43).

**Real y probado**
- Sitio demo en producción (https://dale-demo.vercel.app): lee la versión viva de Supabase en cada request, con vista previa por `?preview=<id>` y refresco por realtime. Hoy, sin Supabase conectado, muestra el archivo local (`data-content-source="file"` en el HTML).
- Panel en producción (https://dale-panel.vercel.app): las 7 pantallas. Sin `PANEL_PASSWORD` queda cerrado y sin Supabase dice "Falta conectar la base"; no muestra datos inventados en producción.
- `@dale/core`: operaciones con tipo, reglas versionadas, gate y `decide` sin IA, con pruebas.
- Worker: el pipeline completo de SPEC §9 (permitido, riesgoso de contenido y de código, fuera de alcance con presupuesto, consulta, bloqueado, derivado), publicar y volver atrás, comandos del panel, límites (5 pedidos cada 10 min por chat, cola de 20, textos de 2.000), `update_id` repetidos, y al arrancar pasa a derivado lo que un reinicio dejó a medias. Probado con pruebas y con `pnpm e2e` en memoria.
- Capturas del celular con Playwright contra el sitio real (~1,5 s).
- Carril de código (`@dale/agent`): hook de rutas, archivos protegidos, entorno mínimo, revisión del diff, PR, vista previa, merge y revert. Probado contra un repo git local.
- `scripts/run-worker.sh`: reinicia el worker si se cae (probado con `kill -9`).

**Todavía no probado con credenciales reales** (al cierre no había ninguna secreta cargada en `~/.dale/.env`)
- La interpretación con Claude (`claude-sonnet-5-5`): el proveedor está hecho, pero no corrió ni una vez contra la API. **Ningún número de calidad de la IA de este README sale del modelo real.**
- Telegram (grammY, polling y webhook), Supabase (migración, seed, realtime del panel y del sitio), commits en GitHub y el agente con PR real.
- Evaluación: solo corrió con el proveedor falso, que es un juego de expresiones regulares y no mide la IA. Con ese proveedor: 30 casos sintéticos, categoría 86,7 %, operaciones exactas 53,8 %, 0 falsos permitidos, **0 cambios prohibidos aplicados**. Para la corrida real: `pnpm eval --provider anthropic` (reporte en `eval/report.md`).

**Simulado:** nada en la demo. Los modos falsos (`LLM_PROVIDER=fake`, `GITHUB_MODE=fake`, `TELEGRAM_MODE=console`, base en memoria) existen solo para desarrollar y probar, y cada comando dice cuándo los usa.

**Pendiente**
- Cargar las credenciales y correr: `pnpm db:migrate && pnpm seed`, `pnpm e2e --strict`, `pnpm eval --provider anthropic`, y los scripts `sync-vercel-env.sh` del sitio y del panel.
- Worker en Railway con webhook: no hay CLI de Railway; el worker corre en una compu con `scripts/run-worker.sh` y polling.
- CI: está en `ci/github-actions.yml`; para activarlo, `gh auth refresh -s workflow` y moverlo a `.github/workflows/ci.yml`.
- Las capturas van por Telegram pero no se suben a ningún lado: el panel muestra el sitio en un iframe en su lugar.
- Vistas previas del agente en repos de terceros con secretos en Preview: apagar los builds de `dale/*` hasta la aprobación (ver `docs/DECISIONES.md`).
- Cobro, auth por agencia con RLS por `factory_id`, WhatsApp, más tipos de operación.

**Alcance:** cambios de textos, precios, disponibilidad, colores, horarios y carteles en una web que cumple el contrato de contenido (`dale.config.json`, SPEC §6); cambios de código con PR en cualquier repo de GitHub, aprobados por la agencia.

**Trabajo previo:** la especificación (`docs/SPEC.md`) y los documentos de diseño se escribieron antes de la hackatón; el código arrancó en la hackatón (ver el historial de commits).
