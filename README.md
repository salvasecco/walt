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
- **Panel:** PANEL_URL_PENDIENTE
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
pnpm db:migrate && pnpm seed     # base y datos de la panadería; el seed imprime los links de invitación
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

ESTADO_PENDIENTE

**Alcance:** cambios de textos, precios, disponibilidad, colores, horarios y carteles en una web que cumple el contrato de contenido (`dale.config.json`, SPEC §6); cambios de código con PR en cualquier repo de GitHub, aprobados por la agencia.

**Trabajo previo:** la especificación (`docs/SPEC.md`) y los documentos de diseño se escribieron antes de la hackatón; el código arrancó en la hackatón (ver el historial de commits).
