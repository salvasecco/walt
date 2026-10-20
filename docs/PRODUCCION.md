# Walt en producción: el plan

Fecha: 2026-10-20. Sesión "plan" del push a producción, rama `r1-plan`. Responde a la sección 9, puntos 1 a 3, de `docs/BRIEF-PRODUCCION.md`, y respeta `docs/R1-CONTRATO.md` (donde la investigación lo contradice, va en §9 y no se cambia el contrato).

Cómo leerlo:
- Todo dato de un tercero (precio, límite, política) lleva link a la fuente oficial y fecha; la lista completa está en "Fuentes", al final.
- Lo que no tiene fuente es **hipótesis** y está marcado así. Ninguna cifra de mercado está inventada.
- Las decisiones van como ADR cortos en `docs/DECISIONES.md` › "Producción: ADRs" (ADR-P1 a ADR-P15); acá se citan por número.
- La lista de los 111 está en `docs/PRODUCCION-CHECKLIST.md`; precios, unit economics, competidores, canales y features de valor, en `docs/NEGOCIO.md`.

## 0. En una página

- **Dónde estamos.** El pipeline anda de punta a punta con el modelo real (29 de 30 casos del eval, 0 cambios prohibidos), pero no está listo para agencias reales: la clave anónima de Supabase lee pedidos y mensajes de todos, el panel es de una sola agencia con una contraseña compartida, la cola vive en memoria y el worker corre en la compu de Salva con polling. De los 48 conceptos críticos de la lista de 111, uno está resuelto. Las migraciones del R1 (cola durable, RLS, reetiquetado, modos de IA) ya están en `main`, sin aplicar ni usar todavía.
- **Arquitectura.** Worker en un contenedor Docker en Railway Pro, en la región de la base, con la cola en Postgres (ADR-P1, ADR-P2); panel en Vercel con Supabase Auth y RLS (ADR-P3); GitHub App por agencia (ADR-P4); agente en Vercel Sandbox desde el R2 (ADR-P10); WhatsApp con Kapso en el R2 (ADR-P6). Vercel para todo se evaluó con datos y no conviene hoy: Playwright no tiene guía oficial, Queues sigue en beta, Daemons tiene días de beta y no ahorra plata.
- **Costos.** Con 100 agencias × 20 clientes (supuestos marcados): unos USD 563 por mes sin WhatsApp (USD 317 de IA) y unos USD 1.186 con WhatsApp y Sandbox, o sea unos USD 12 por agencia. La beta cuesta entre USD 100 y 250 por mes.
- **El error más caro** es que algo delicado salga como simple y se publique sin la agencia: se mide aparte en el eval (tiene que dar 0) y el clasificador del diff sube a delicado lo que agregue llamadas de red, dominios nuevos, scripts o iframes.
- **IA y términos de Anthropic.** No se puede pedir el login ni el token de la suscripción de Claude de la agencia; BYOK y los créditos de Walt sí cumplen, y los créditos de API de Max y Team (desde el 2026-10-07) son la forma legal de "usar la suscripción". Hay una zona gris con el agente de código (el Agent SDK corre Claude Code) pagado por Walt: hasta que Anthropic responda por escrito, el agente usa la credencial de la agencia.
- **Releases.** R1: beta con 3 a 5 agencias por Telegram, 25 criterios medibles. R2: WhatsApp, cobros y autoservicio (primer cambio en menos de 15 min). R3: inteligencia comercial y reportes. R4: conectores sin repo y escala.
- **Lo que necesito de Salva** está todo junto en §8 (28 puntos). Lo urgente: host, entidad legal, la pregunta escrita a Anthropic, cuentas de GitHub (organización y App), Telegram (bots de producción y staging) y Anthropic, el scope `workflow` para el CI y un dominio.
- **Para la 90** (§9): el contrato y la investigación coinciden en la cola; quedan abiertos los borradores legibles por la clave anónima, la service role en el panel, el modo `claude_code` y seis huecos chicos, entre ellos un default viejo (`dale.config.json`) que rompe los proyectos nuevos conectados desde el panel.

---

## 1. Auditoría: dónde estamos contra el brief

Sobre `main` `ea0dd00` (2026-10-20). Del R1, en `main` solo están las migraciones `0004_r1.sql` y `0005_r1_cierre_anon.sql` de `r1-infra` (sin aplicar en Supabase y sin uso todavía en el worker ni en el panel). `r1-taxonomia` tiene la taxonomía en `@walt/core` en su rama (según la 90, todavía rompe el typecheck del worker, ai y eval) y `r1-panel` tiene la taxonomía en las pantallas y Supabase Auth en curso.

### 1.1 Por sección del brief

| Brief | Qué pide | Qué hay hoy | Brecha | Release |
|---|---|---|---|---|
| §1 Taxonomía | Consulta, simple, delicado, nuevo y bloqueado; lo ambiguo se le pregunta al cliente; doble clasificación (intención y diff real); reglas por proyecto en lenguaje natural y estructuradas, con plantillas por stack, versiones y simulador; eval nuevo que mida aparte el error caro | `decide.ts` usa las categorías del SPEC: todo `needsCode` es `riesgoso` de código y un proyecto en modo código siempre es `riesgoso`. `maxPriceChangePct` deriva a la agencia (gate, paso 6). `set_banner` y `toggle_section` en `agencia`. Reglas versionadas con `policies` y `limits`, sin texto ni globs. Opciones para ambiguos solo si las dos salen `auto`. El agente revisa el diff por seguridad pero no reclasifica. Eval: 30 sintéticos más 10 inyecciones, solo en español, 29/30 de categoría con el modelo real y 0 cambios prohibidos (`eval/report.md`) | Todo; en curso en `r1-taxonomia` | R1 |
| §2 Datos y aprendizaje | Reetiquetar; señales; ejemplos por similitud; propuestas de reglas; eval global con permiso; métricas por agencia; privacidad desde el diseño | Hay señales sueltas: `approvals` (rechazos), estado `descartado` ("No era eso"), `revertido`, `events` con duración y `cost_usd`. "Lo que piden" sugiere ofertas cuando un tipo de operación se repite 3 veces en 30 días. No hay reetiquetado, ejemplos, métricas de precisión, retención ni DPA | Reetiquetado, ejemplos y métricas en R1; privacidad legal en R2 | R1, R2 |
| §3 Canales | Núcleo agnóstico; Telegram ya; WhatsApp para la venta; un asistente por proyecto; ruteo y desambiguación; invitaciones; reasignar desde el panel | `Channel` e `Incoming` son agnósticos (`apps/worker/src/channel/types.ts`), pero `contacts.telegram_chat_id` (único) y el `callback_data` de 64 bytes son de Telegram. Un solo bot (@wal101_bot) por polling. Nombre del asistente por agencia (`factories.assistant_name`), no por proyecto. Un chat es un solo proyecto: la unicidad impide que un cliente con dos proyectos use el mismo chat. Invitaciones `t.me/<bot>?start=<token>` con QR (hecho). Sin WhatsApp ni reasignación | Telegram en producción en R1; identidad por canal, desambiguación, asistente por proyecto y WhatsApp en R2 | R1, R2 |
| §4 Pago de la IA | BYOK cifrado con topes; la sesión de Claude de la agencia solo si cumple; créditos prepagos; ruteo de modelos; caché; costo por pedido a la vista | Una sola `ANTHROPIC_API_KEY` global (o Bedrock). Sonnet 5.5 interpreta; el agente usa Sonnet 5.5 con reintento en Opus 5.5. Caché de prompts en el system prompt. `cost_usd` por pedido con `packages/core/src/pricing.ts`, que coincide con los precios oficiales salvo la lectura de caché de Sonnet 5.5 (bajó a USD 0,10 por millón el 2026-10-07 [A-PRICE]; el archivo dice 0,20), y costo de IA por cliente y mes en Clientes | BYOK y créditos con recarga manual en R1; Mercado Pago y Paddle en R2 (Stripe cuando haya entidad en EE.UU.); el modo "sesión de Claude" no se ofrece como login (ADR-P5) | R1, R2 |
| §5 Negocio | Plan más uso más comisión; inteligencia comercial; las 7 ideas | Presupuestos: borrador de la IA con los 20 anteriores, la agencia edita y envía, el cliente acepta con un botón, sin link de pago ni seña. Clientes con plan, cupo y abono cargados a mano y salud del cliente. Comando `proponer` (la agencia escribe primero) | Link de pago en R1 (de la agencia) y R2 (integrado); oportunidades en R3 | R1–R3 |
| §6 Producción | Los 111, con lo crítico resuelto | `docs/PRODUCCION-CHECKLIST.md`: de los 48 conceptos críticos para Walt, 1 está resuelto | Casi todo | R1 |
| §7 Autoservicio | Landing, registro, plan, onboarding y primer cambio en menos de 15 min; legales, docs, soporte, estado, analítica | Nada. En Proyectos se conecta un repo (detecta `walt.config.json`) y se genera el QR (hecho). El panel entra con una contraseña compartida | Todo | R2 |
| §8 No romper | Demo con el modelo real, URLs, @wal101_bot, vista previa siempre, delicado con el diff (5cf2d37), comandos de `CLAUDE.md` | Todo vigente en `main` | El CI corre `pnpm test`, `pnpm e2e` y el eval; la demo nueva se suma | — |

### 1.2 Hallazgos del código que cambian el plan

1. **Lectura pública de todo.** `supabase/migrations/0001_init.sql` le da `select` a `anon` con `using (true)` sobre `requests`, `events`, `messages`, `content_versions`, `approvals`, `quotes`, `projects` y `rules`, y `0003_clients.sql` suma `clients`. La clave anónima es pública por diseño (el panel se la pasa al navegador para realtime y el sitio la usa). Con una segunda agencia, cualquiera con esa clave lee las conversaciones y los presupuestos de todas. Es bloqueante para la beta. `0005_r1_cierre_anon.sql` (en `main`, sin aplicar) lo cierra salvo `content_versions`, que sigue con `using (true)` (ver §9).
2. **Panel de una sola agencia.** Contraseña compartida (`apps/panel/src/lib/auth.ts`) y lecturas con service role sin filtro por agencia (`apps/panel/src/lib/data.ts`, `agency.ts`). "Conectar un repo" asigna el proyecto a la primera `factory` que encuentra.
3. **Estado en el proceso.** Colas en memoria (`apps/worker/src/queue.ts`), `awaitingCorrection`, `liveFor`, la vigilancia de deploys y la cadena de escrituras no sobreviven un reinicio. `processed_updates` se marca antes de procesar: si el proceso muere en el medio, el pedido se pierde. `recoverInterrupted` deriva al arrancar todo lo que esté en curso, lo que con dos réplicas derivaría el trabajo de la otra.
4. **Default viejo de `config_path`.** `0001_init.sql` tiene `config_path default 'dale.config.json'` y "Conectar un repo" no manda `config_path` (`apps/panel/src/app/actions.ts`), así que un proyecto nuevo en modo contenido busca `dale.config.json` y no carga el contrato. El seed sí pone `walt.config.json`. Arreglo: migración nueva con el default y los proyectos existentes.
5. **Token personal de GitHub.** `GITHUB_TOKEN` sale de `gh auth token`, con acceso a todos los repos de Salva (DECISIONES › integración real).
6. **SSRF en las capturas.** Playwright abre `projects.site_url`, que solo se valida con `^https://`: no se bloquean IPs privadas, `localhost`, metadata de la nube ni redirecciones.
7. **Zona horaria fija.** `montevideoIso` resta 3 horas fijas. Sirve para Uruguay, Argentina y el horario de Brasilia; no para México, EE.UU. ni Europa.
8. **Comandos por sondeo.** El worker consulta `commands` cada segundo por HTTPS (86.400 consultas por día). Con la cola, los comandos son jobs.
9. **Producción en la compu de Salva.** Worker con polling y `scripts/run-worker.sh`; `/health` existe solo en modo webhook y siempre da 200; no hay Dockerfile; el CI está apagado.
10. **Protegidos del agente frente a la taxonomía nueva.** `@walt/agent` bloquea `package.json`, lockfiles y archivos de config. Con la taxonomía nueva, dependencias, migraciones y auth son "delicado": se pueden tocar con la aprobación de la agencia. La lista se parte en "nunca" (`.env*`, `.git`, CI) y "delicado" (sube la categoría).
11. **Simple por código sin la agencia.** Hoy la revisión del diff (`packages/agent/src/review.ts`) rechaza `<script`, `eval(`, `process.env` y parecidos, pero no ve un `fetch` a un dominio nuevo ni un formulario que manda datos afuera. Si lo simple por código se publica sin la agencia, el clasificador del diff tiene que subir a delicado todo lo que agregue dominios o llamadas de red nuevas, iframes, scripts o píxeles de terceros y `dangerouslySetInnerHTML`.
12. **Vistas previas protegidas.** Si el proyecto de Vercel de la agencia usa Standard Protection (protege todo salvo producción), el cliente final no puede abrir la vista previa del PR sin una cuenta de Vercel, y la captura falla. Vercel ofrece en todos los planes Shareable Links, excepciones por dominio y Protection Bypass for Automation (header `x-vercel-protection-bypass`) [V-DP]. El onboarding tiene que configurar uno de los dos primeros para el cliente y el bypass para la captura.
13. **`DEFAULT_RULES` duplicado.** El panel tiene su copia en `apps/panel/src/lib/sample.ts` (la usa al crear proyectos). Cuando core pase `set_banner` y `toggle_section` a `auto`, el panel tiene que cambiar la suya.

### 1.3 Lo que está bien y se conserva

El principio "un modelo decide, la IA ejecuta y el código valida"; las operaciones tipadas con gate; publicar y volver atrás en un segundo sin build; el hook de rutas y la revisión del diff del agente, con entorno mínimo; `redact` y el gate de secretos; la vista previa siempre para el cliente (5cf2d37); el eval con "cambios prohibidos aplicados = 0"; los tiempos medidos de `docs/VELOCIDAD.md`; los `fallbacks` del modelo y Bedrock como alternativa ya implementada.

---

## 2. Arquitectura objetivo

### 2.1 Diagrama

R1, con lo que se suma después marcado entre paréntesis.

```
 Clientes finales             Agencias y freelancers                    Operación de Walt
 Telegram ──┐                 Panel Next.js en Vercel ─┐                 alertas al Telegram de guardia,
 WhatsApp ──┤ (R2)            Supabase Auth + RLS       │                 errores, logs, página de estado
            ▼                                           ▼
 ┌──────────────── worker: contenedor Docker en un host gestionado (ADR-P1) ─────────────────┐
 │ HTTP  /webhooks/telegram/:bot · /webhooks/github · (R2) /webhooks/whatsapp · /webhooks/pagos │
 │       /healthz · /readyz                                                                    │
 │       verifica secreto o firma → RPC enqueue_job(dedupe_key = canal:id externo) → 200        │
 │ Bucle claim_job (skip locked, un job "running" por proyecto, lease) → handler → complete/fail│
 │   interpretar   @walt/ai: ruteo de modelos, caché de prompts, BYOK o créditos (ADR-P5)       │
 │   decidir       @walt/core: taxonomía, reglas de la agencia, gate, clasificador del diff     │
 │   borrador y captura (Playwright con filtro anti-SSRF) · publicar y volver atrás             │
 │   agente        @walt/agent: clon temporal → Claude Agent SDK → PR con la GitHub App         │
 │                 (R2) dentro de Vercel Sandbox con salida solo a Anthropic y GitHub (ADR-P10) │
 │   presupuesto con link de pago (R1 de la agencia; R2 Mercado Pago y Paddle)                  │
 │   cron: un tick que encola jobs con clave por período                                       │
 │   salida por canal, con rate limit por proveedor y circuit breaker                          │
 └───────────────┬──────────────────────────────────────────────────────────┬─────────────────┘
                 ▼                                                          ▼
 Supabase, en la misma región que el worker:                     GitHub (App por agencia)
 jobs · requests · events · messages · content_versions ·        Vercel de la agencia (vistas previas
 rules · request_labels · memberships · ai_settings · wallets ·  con acceso para el cliente y bypass
 usage_ledger · Vault (secretos de agencias) · Realtime · PITR    para la captura)
                 ▲
 Sitios de los clientes: leen la versión viva y se refrescan por Realtime
```

### 2.2 Piezas

| Pieza | Dónde corre | Qué hace | Por qué así |
|---|---|---|---|
| Worker | Un contenedor Docker siempre prendido (ADR-P1), 2 GB, imagen de Playwright | Webhooks, cola, pipeline, capturas, agente (R1), cron | Ya es un proceso Node de larga vida con navegador abierto: va tal cual, sin reescribirlo como funciones |
| Cola durable | Tabla `jobs` en Supabase, RPC `enqueue_job`, `claim_job`, `complete_job`, `fail_job` (contrato, `r1-infra`) | Al menos una vez, dedupe por clave, backoff con jitter, dead letter, un job a la vez por proyecto | Sin otra pieza: la base ya está y la escala (20.000 pedidos por mes, hipótesis) es chica |
| Base | Supabase Postgres con RLS por agencia, Vault, Realtime y PITR | Fuente de verdad | Ya está en uso; RLS y Vault resuelven multi-tenant y secretos sin servicios nuevos |
| Panel | Next.js 16.4 en Vercel, Supabase Auth | Reglas, simulador, reetiquetado, aprobaciones, métricas, onboarding (R2) | Ya está en Vercel |
| Agente de código | R1: subproceso en el worker, sin Bash ni web, entorno mínimo y hook de rutas (lo que hay). R2: Vercel Sandbox (GA desde el 2026-01-30), con salida restringida a una lista de dominios y credenciales inyectadas en el tráfico saliente, sin que entren a la VM [V-SBX] | PR, vista previa, merge, revert | En R1 no corre comandos; cuando los necesite (instalar, compilar, testear), va a una VM efímera |
| GitHub | GitHub App por agencia (ADR-P4) | Clonar, ramas, PR, merge, estados de deploy | Reemplaza el token personal; tokens por instalación |
| Canales | Telegram (R1), WhatsApp (R2, ADR-P6) | Entrada y salida | Núcleo agnóstico ya existente |
| Observabilidad | Ver §2.4 | Logs, errores, trazas, uptime, estado | Lo mínimo que una persona puede operar |

### 2.3 Cómo viaja un pedido con la taxonomía nueva

- **Simple de contenido:** webhook → `enqueue_job` → interpretar → decidir (simple) → borrador y captura → "¿Así?" con [Dale] y [No era eso] (y la advertencia de precio si corresponde) → publicar con locking optimista sobre la versión viva → commit de fondo → "Listo".
- **Simple de código:** interpretar → agente → PR → clasificador del diff. Si toca una zona delicada, sube a delicado; si no, la vista previa va al cliente → [Dale] → merge → espera del deploy → "Listo".
- **Delicado:** agente → PR → la agencia aprueba el diff en el panel → el cliente ve la vista previa → [Dale] → merge.
- **Nuevo:** borrador de presupuesto → la agencia lo ajusta (o sale solo si su regla lo permite) → el cliente recibe alcance, plazo, precio y link para pagar la seña → al pagarla, pasa a la agencia o al agente bajo revisión.
- **Ambiguo:** opciones al cliente, nunca a la agencia. **Bloqueado:** no se aplica nada y se avisa.

### 2.4 Herramientas elegidas, con versión y fecha

Versiones: las del lockfile cuando ya se usan; si no, la última estable publicada (registro de npm, GitHub Releases o Microsoft Artifact Registry, consultados el 2026-10-20).

| Pieza | Herramienta | Versión | Fecha de la fuente | Por qué |
|---|---|---|---|---|
| Runtime | Node.js 24 LTS (Krypton) | 24.22.0 | 2026-10-14 [NODE] | Ya es el runtime del repo |
| Imagen del worker | Imagen oficial de Playwright | `mcr.microsoft.com/playwright:v1.64.1-noble` | playwright 1.64.1 del 2026-10-14 [MCR] | Misma versión que el lockfile; trae Chromium y sus dependencias |
| Host del worker | Railway Pro, región US East | — | páginas sin fecha, consultadas 2026-10-20 [RW] | ADR-P1; plan B Render Pro |
| Base, auth, secretos | Supabase Pro + Supabase Auth + Vault; `@supabase/supabase-js` | 2.118.0 | 2026-10-15 [NPM] | Ya en uso; Vault está en alpha pública (ADR-P9) |
| Migraciones | Supabase CLI + acción `supabase/setup-cli` | 2.121.0 / v3.0.1 | 2026-10-14 / 2026-09-24 [SB-CLI] | ADR-P8 |
| Cola | Tabla `jobs` propia (0004) | — | — | Supabase Queues (pgmq) sigue en alpha pública y fuera del SLA [SB-Q] |
| Telegram | grammY | 1.46.0 | 2026-08-26; Bot API 10.3 del 2026-08-24 [TG-API] | Ya en uso |
| Modelos | `claude-sonnet-5-5` (interpretar), `claude-haiku-5-5` (clasificar, si el eval lo confirma), `claude-opus-5-5` (respaldo del agente) | — | precios vigentes en [A-PRICE] | ADR-P5 |
| SDK de IA | `@anthropic-ai/sdk` y `@anthropic-ai/bedrock-sdk` | 0.135.0 / 0.35.0 | 2026-10-15 [NPM] | Ya en uso |
| Agente | `@anthropic-ai/claude-agent-sdk` | 0.3.302 en el lockfile (última 0.3.304, 2026-10-19) | [NPM] | Ya en uso; ver ADR-P5 sobre quién paga su uso |
| Sandbox del agente (R2) | Vercel Sandbox | GA desde 2026-01-30 | [V-SBX] | Salida restringida e inyección de credenciales |
| GitHub | GitHub App + `@octokit/rest` (+ `@octokit/app` para tokens de instalación) | 22.0.1 / 16.1.4 | 2026-08-02 para `@octokit/app` [NPM] | ADR-P4 |
| CI | GitHub Actions: `actions/checkout`, `actions/setup-node`, `pnpm/action-setup` | v7.0.1, v7.1.0, v6.1.0 (el yml de hoy usa v4) | 2026-07-20, 2026-10-08, 2026-09-05 [GH-REL] | Actualizar al activar el CI |
| Logs | pino (JSON a stdout; Railway los guarda 30 días en Pro) | 10.4.0 | 2026-10-02 [NPM] | El logger JSON más simple para Node |
| Errores y heartbeat | Sentry, `@sentry/node` | 11.8.0 | 2026-10-15 [SENTRY] | Errores, trazas y monitor de "el loop sigue vivo" en un solo SDK |
| Uptime, página de estado y guardia | Better Stack | — | consultado 2026-10-20 [BS] | Monitor de `/healthz`, página de estado y llamadas a la guardia |
| Trazas (R2) | OpenTelemetry JS: `@opentelemetry/api`, `sdk-node` | 1.9.1 / 0.223.0 | 2026-03-25 / 2026-10-06 [OTEL] | En R1 alcanza con `trace_id` en jobs, eventos y logs |
| Panel | Next.js | 16.4.2 | 2026-10-15 [NPM] | Ya en uso |

### 2.5 Por qué el worker no va entero a Vercel

Se evaluó con datos de las páginas oficiales de Vercel (consultadas el 2026-10-20):
- **Lo que entra bien:** webhooks, interpretación, esperas y cron. Functions llega a 800 s en Pro (30 min en beta) [V-FN]; Workflow es GA desde el 2026-04-16, con `sleep` sin cómputo y pasos durables [V-WF]; Sandbox es GA y es el mejor lugar para el agente [V-SBX].
- **Lo que no entra limpio:** las capturas (no hay guía oficial de Playwright; la vigente usa `puppeteer-core` con `@sparticuz/chromium-min` y menciona el límite de 250 MB del bundle) y cualquier proceso que quede corriendo. Vercel Queues sigue en beta (desde el 2026-02-27), sin dead letter y atando cada mensaje al deployment que lo publicó [V-Q]. Daemons, el contenedor de larga vida de Vercel, está en beta pública desde el 2026-10-15, solo en producción, sin tráfico entrante y sin autoescalado [V-DMN].
- **Costo:** todo en Vercel Pro costaría unos USD 61 a 168 por mes sin tokens (con supuestos de uso por pedido), contra USD 26 a 57 del contenedor en Railway con staging (§5); el costo no decide.
- **Decisión (ADR-P1):** el worker va en un contenedor con la cola en Supabase, como dice el contrato; el agente pasa a Vercel Sandbox en el R2; se revisa cuando Daemons sea GA.

---

## 3. Releases y criterios de aceptación

Cada criterio se mide con una prueba, un número del eval o un dato de la base. Antes de cerrar cualquier release: `pnpm typecheck`, `pnpm test` y `pnpm eval` en verde, y el eval no empeora.

### R1: beta privada con 3 a 5 agencias por Telegram

| # | Criterio | Cómo se mide |
|---|---|---|
| R1.1 | Categorías migradas (`permitido`→`simple`, `riesgoso`→`delicado`, `fuera_de_alcance`→`nuevo`) sin perder filas | Conteo por categoría antes y después de la migración |
| R1.2 | Eval nuevo de 60 casos o más, en español y portugués: los de la hackatón reetiquetados, delicados (migración, endpoint, login, dependencias), nuevos (pasarela de pagos, workflow agéntico) y las inyecciones | `pnpm eval`: categoría ≥ 95% con el modelo real; **error caro (delicado o bloqueado que sale simple) = 0**; cambios prohibidos aplicados = 0 |
| R1.3 | Los tres casos de la hackatón dejan de pasar por la agencia: "subí los panes a 95" sale simple con la advertencia de precio visible; el aviso de envío gratis y el formulario que solo manda datos salen simples por PR | Casos con esas etiquetas en el eval y en `pnpm dry-run` |
| R1.4 | Doble clasificación determinística: un diff que toca una zona delicada (migraciones, `.env*`, manifiestos, auth, globs de la agencia, dominios o llamadas de red nuevas) sube a delicado y nunca baja | Una prueba unitaria por zona |
| R1.5 | Reglas por proyecto con texto, globs, `alwaysNew`, `priceWarnPct` y 5 plantillas por stack; simulador que usa el mismo código que el worker | Prueba del simulador contra el eval; p95 ≤ 10 s |
| R1.6 | Reetiquetado desde el detalle del pedido, guardado en `request_labels` y usado como ejemplo (`pg_trgm`) en el pedido parecido siguiente | Prueba de punta a punta y la demo |
| R1.7 | Métricas por agencia en el panel: precisión contra reetiquetas, aprobados al primer intento, tasa de "No era eso", tiempo a publicar, costo por pedido, escalamientos | Consultas con datos de prueba conocidos |
| R1.8 | Cola durable: matar el worker en cada paso del pipeline no pierde pedidos; cada uno termina publicado, esperando o derivado | Prueba que mata el proceso en cada paso; como mucho un mensaje repetido al cliente por caída |
| R1.9 | Un update de Telegram que llega 3 veces crea 1 pedido | Prueba |
| R1.10 | Un pedido a la vez por proyecto: dos del mismo proyecto van en serie y dos de proyectos distintos en paralelo | Prueba con dos réplicas del worker |
| R1.11 | DLQ: un job que falla 5 veces queda `dead`, aparece en Atención y dispara una alerta en menos de 5 min | Prueba con un proveedor falso que siempre falla |
| R1.12 | Worker en el host (ADR-P1) con webhook de Telegram, `/healthz` y `/readyz`, staging y producción separados (bot, base o esquema, variables) | Checklist de despliegue |
| R1.13 | Deploy sin cortes y rollback | 0 updates perdidos en un deploy con tráfico de prueba; rollback a la imagen anterior en ≤ 5 min |
| R1.14 | Nada de producción corre en la compu de Salva | Inventario |
| R1.15 | Supabase Auth con `memberships`; RLS por agencia en todas las tablas; la clave anónima solo lee lo que necesita el sitio | Pruebas automáticas: un usuario de la agencia A no lee ni escribe nada de B; anon no lee pedidos ni mensajes |
| R1.16 | GitHub App instalada por agencia; ningún token personal en producción | Inventario de secretos; tokens de instalación de 1 h |
| R1.17 | BYOK: clave cifrada en Vault, validada al cargarla, nunca en logs, tope mensual por proyecto con aviso al 80% y corte al 100% | Prueba que busca la clave en logs, eventos y mensajes; prueba de tope |
| R1.18 | Créditos de Walt: libro de movimientos por agencia, costo por pedido = tokens × precio × (1 + margen), saldo visible, aviso de saldo bajo, recarga manual | Prueba del libro: saldo = recargas − consumos |
| R1.19 | Ruteo de modelos decidido con datos: el modelo barato clasifica solo si iguala la precisión de Sonnet en el eval | Corrida del eval con los dos modelos |
| R1.20 | CI de GitHub Actions activo y obligatorio para mergear (typecheck, test, eval falso en cada PR, eval real en `main`) y migraciones con la CLI de Supabase | Protección de rama y corridas en verde |
| R1.21 | Backups con PITR (si se aprueba) y una restauración de prueba en staging, documentada | Acta de la prueba |
| R1.22 | Logs JSON con `request_id`, errores en el servicio de errores, monitor externo, página de estado y alertas a la guardia | Alerta de prueba recibida |
| R1.23 | SLOs de §6 publicados y medidos | Tablero |
| R1.24 | Demo nueva en `docs/DEMO.md` con el modelo real: simple que se publica solo, delicado que pasa por la agencia, nuevo con presupuesto y link de pago, y una reetiqueta que cambia la decisión siguiente | Corrida grabada |
| R1.25 | Beta: 3 a 5 agencias con al menos 2 clientes cada una durante 4 semanas, y 50 pedidos reales anonimizados en `eval/cases/reales.jsonl`, solo de clientes que dieron su consentimiento explícito y revocable (términos de Telegram para bots, §4.3) | Base y eval |

### R2: WhatsApp, cobros y autoservicio

| # | Criterio | Cómo se mide |
|---|---|---|
| R2.1 | Una agencia conecta su número de WhatsApp sola (ADR-P6) y recibe el primer pedido | Tiempo de conexión ≤ 15 min en 5 agencias |
| R2.2 | WhatsApp con la misma calidad que Telegram: botones, audios, dedupe por `wamid`, estados `sent/delivered/read/failed` | Pruebas con el entorno de prueba del proveedor |
| R2.3 | Ventana de 24 h respetada: fuera de la ventana solo salen plantillas aprobadas con opt-in registrado | Prueba que intenta mandar texto libre fuera de la ventana |
| R2.4 | Costo de WhatsApp por mensaje medido y asignado a cada agencia | Conciliación con la factura del proveedor (diferencia < 2%) |
| R2.5 | Suscripciones con prueba gratis de 14 días: Mercado Pago en Uruguay y Paddle en Brasil (ADR-P11; Stripe no admite empresas de Uruguay), facturas electrónicas y reintentos de cobro | Pruebas de webhooks de pago idempotentes |
| R2.6 | Créditos de IA con recarga y recarga automática | Prueba de recarga automática al cruzar el umbral |
| R2.7 | Presupuestos con link de pago y seña: en Uruguay con el split de Mercado Pago (la plata va a la agencia y Walt retiene su comisión); en Brasil, con la cuenta de la agencia y la comisión facturada en la suscripción | Pago de prueba de punta a punta |
| R2.8 | Autoservicio completo: landing, registro, plan, onboarding (GitHub App, hosting de vistas previas con acceso para el cliente, canal, modo de IA, plantilla de reglas, marca, invitar con link o QR) | Mediana ≤ 15 min del registro al primer cambio publicado, medida en al menos 10 agencias con analítica del embudo |
| R2.9 | Términos, privacidad, DPA y política de uso aceptable publicados y revisados por un abogado; docs, soporte y página de estado | Links publicados |
| R2.10 | Bot de Telegram propio por agencia, creado con Managed Bots (Bot API 9.6) y token en Vault, opcional | Prueba con dos bots |
| R2.11 | Portugués en el asistente y en el panel | Eval en portugués ≥ 95% de categoría |
| R2.12 | Identidad por canal y desambiguación: un cliente con varios proyectos elige con opciones; la agencia reasigna desde el panel | Prueba |

### R3: inteligencia comercial y reportes

| # | Criterio | Cómo se mide |
|---|---|---|
| R3.1 | Motor de oportunidades por proyecto con calendario comercial por país (UY, AR, BR, MX), estado del sitio (contenido viejo, links rotos, páginas lentas) y analytics si está conectado | Cada oportunidad trae evidencia de datos del cliente o fuente citada, vista previa armada, precio de la agencia y link de pago |
| R3.2 | Controles de la agencia: tipos, tope de frecuencia, envío automático o con revisión, lista de precios | Prueba de tope: nunca más de N por cliente por mes |
| R3.3 | En WhatsApp, fuera de la ventana, solo plantillas de marketing aprobadas y opt-in | Prueba |
| R3.4 | Métricas del piloto: tasa de aceptación, ingresos para la agencia, comisión de Walt, bajas de opt-in | Tablero; la meta de aceptación se fija con la línea de base del primer mes (hoy no hay dato) |
| R3.5 | Reporte mensual al cliente final con cambios, tiempos y resultados solo con datos del propio cliente | Revisión de 10 reportes: cero números sin fuente |
| R3.6 | Monitoreo liviano (caída, formularios y checkout) con alerta, diagnóstico e incidente | Prueba con un sitio roto a propósito |

### R4: conectores sin repo y escala

| # | Criterio | Cómo se mide |
|---|---|---|
| R4.1 | Conectores sin repo, en el orden que marquen los datos del piloto (candidatos: WordPress/WooCommerce, Tiendanube, Shopify) con operaciones tipadas sobre sus APIs | Eval por conector; vista previa y vuelta atrás funcionando |
| R4.2 | 2 o más réplicas, escalado por largo de cola, retención de `events` | Prueba de carga a 5 veces el volumen del R3 |
| R4.3 | Inglés; para EE.UU. y Europa, residencia de datos y GDPR (DPA y cláusulas tipo) | Revisión legal |
| R4.4 | API pública `/v1` solo si hay demanda, con versionado y webhooks salientes firmados | — |

---

## 4. Riesgos

Probabilidad e impacto: A alto, M medio, B bajo (juicio del equipo).

| # | Riesgo | Prob. | Impacto | Mitigación | Cuándo |
|---|---|---|---|---|---|
| 1 | **Error caro**: algo delicado sale como simple y se publica sin la agencia (por ejemplo, un PR "simple" que agrega un `fetch` a un dominio externo o un formulario que manda datos afuera) | M | A | Doble clasificación determinística con reglas de red, dominios, scripts e iframes (hallazgo 11); error caro = 0 como condición de merge del eval; vista previa siempre; "Volver a como estaba"; cada reetiqueta de simple a delicado es un incidente | R1 |
| 2 | **Inyección de prompt** que llega al código | M | A | El texto del cliente nunca entra al agente (entra la ficha); agente sin Bash ni web, con hook de rutas y revisión del diff; con comandos, sandbox con salida a una lista blanca (ADR-P10). Lo simple por código no lo mira un humano: por eso el riesgo 1 manda | R1 |
| 3 | **Fuga entre agencias** | M | A | RLS con pruebas automáticas por tabla; anon cerrado (hallazgo 1 y §9); service role solo detrás de un chequeo de membresía; revisión de seguridad antes de abrir la beta | R1 |
| 4 | Términos de Anthropic: suscripciones y agente de código | M | A | No se ofrece el login ni el token de la suscripción de la agencia (prohibido). El agente usa el Agent SDK, que corre el binario de Claude Code, y la página legal de Claude Code pide que en ese caso cada usuario final use su propia credencial: hasta tener una confirmación escrita de Anthropic, el agente corre con la credencial de la agencia; plan B, el agente sobre la Messages API (ADR-P5 y `docs/NEGOCIO.md` §5) | R1 |
| 5 | Dependencia de un solo proveedor de modelo (caídas, precios, rechazos) | M | M | `fallbacks` del servidor (ya en uso), Bedrock como alternativa (ya implementado), breaker por proveedor, presupuestos y alertas de gasto, tabla de precios de core actualizada en cada cambio | R1 |
| 6 | WhatsApp: verificación del negocio, aprobación de plantillas, política de IA de Meta y calidad del número | M | A | Empezar los trámites durante el R1; proveedor y modelo de números de ADR-P6; opt-in registrado y topes de frecuencia; Telegram sigue como canal | R1 (trámites), R2 |
| 7 | Telegram frena la venta: en Uruguay el 98% de quienes usan internet usa WhatsApp y Telegram no aparece en la medición oficial; en Brasil, 99% contra 57% de smartphones con la app; en México, 91% contra 30% | A | M | Beta con agencias cuyos clientes acepten Telegram; trámites de WhatsApp durante el R1 y WhatsApp al principio del R2; demos de venta con WhatsApp (`docs/NEGOCIO.md` §4.4 y §4.5) | R1–R2 |
| 8 | Sin entidad legal: no hay cuenta empresa de Mercado Pago, verificación de Meta ni contratos; Stripe además exige una entidad de EE.UU. | A | A | SAS digital en Uruguay (§8); mientras tanto, beta gratis y cobros manuales | Ya |
| 9 | Vistas previas protegidas o fuera de Vercel | A | M | Onboarding que configura acceso del cliente y bypass para la captura (hallazgo 12); sin Vercel (por ejemplo Netlify), la vista previa del PR se busca en los deployments de GitHub o la revisa la agencia | R1–R2 |
| 10 | Una sola persona opera todo | A | A | Guardia con un segundo, runbooks, degradación automática a "derivado", página de estado | R1 |
| 11 | Costos que se disparan (abuso, bucles del agente) | M | M | Topes por chat, proyecto y agencia; tope de turnos y de tiempo del agente; presupuesto mensual de IA con corte; alertas | R1 |
| 12 | Datos personales en prompts, logs y ejemplos | M | A | Logs sin el texto del cliente; redacción de datos personales antes de guardar ejemplos o casos de eval; retención y borrado a pedido; DPA (R2) | R1–R2 |
| 13 | Cambios frecuentes del Claude Agent SDK y de Claude Code | M | M | Versiones fijas, Renovate con CI y una prueba de humo del agente contra un repo falso | R1 |
| 14 | Agencias conservadoras desconfían de "simple sin la agencia" | M | M | Plantilla de reglas "conservadora" (todo código es delicado) elegible en el onboarding; simulador para ver cómo clasifica antes de activar | R1 |
| 15 | Migraciones aplicadas a mano fuera de orden (cerrar la lectura anónima antes de que el panel use Supabase Auth corta el realtime del panel) | M | M | El orden está en el contrato ("Esquema 0004": 0004 con el worker nuevo, 0005 cuando el panel use sesiones); la CLI de Supabase en el CI lo vuelve automático | R1 |
| 16 | Términos de Meta y de Telegram sobre datos para IA: los chats de WhatsApp no pueden usarse para entrenar ni mejorar modelos, y Telegram exige consentimiento explícito para usar lo que mandan los usuarios | M | M | Ejemplos reetiquetados solo dentro de la misma agencia; eval global solo con pedidos de Telegram con consentimiento; nada de WhatsApp (ADR-P15) | R1–R2 |

---

## 5. Costos mensuales estimados: 100 agencias × 20 clientes

**Supuestos (todos hipótesis; la beta los mide):**
- **H1, volumen:** 10 pedidos por cliente final por mes → 20.000 pedidos. Rango: 5 a 20 (10.000 a 40.000).
- **H2, mezcla:** 20% con agente de código (4.000 corridas), 15% consultas, 5% algo nuevo (presupuesto), el resto contenido o charla.
- **H3, agente:** USD 0,033 por corrida con Sonnet 5.5 (una sola medición, `docs/VELOCIDAD.md`) y un 15% de reintentos con Opus 5.5 a USD 0,082 → USD 0,045 por pedido de código.
- **H4, interpretación:** USD 0,0053 por pedido. Es el consumo medido en el eval (29 llamadas) recalculado con el precio vigente de lectura de caché de Sonnet 5.5, que bajó de 0,20 a 0,10 por millón el 2026-10-07 [A-PRICE] (`pricing.ts` todavía tiene 0,20 y calcula USD 0,0059).
- **H5:** consulta USD 0,005 y borrador de presupuesto USD 0,01 (sin medir); audios en el 10% de los pedidos, de 30 s, con `gpt-transcribe` a USD 0,0045 por minuto [OAI].
- Precios de infraestructura de las páginas oficiales consultadas el 2026-10-20; WhatsApp y Kapso van en `docs/NEGOCIO.md` §4 porque dependen del modelo de cobro.

| Rubro (USD por mes) | Bajo (10.000 pedidos) | Base (20.000) | Alto (40.000) | Fuente o cuenta |
|---|---|---|---|---|
| IA: interpretar | 53 | 106 | 212 | H1 × H4 |
| IA: agente de código | 91 | 181 | 362 | H1 × 20% × USD 0,045 |
| IA: consultas, presupuestos, audios | 15 | 30 | 59 | H5 |
| **Subtotal IA** | **159** | **317** | **633** | Lo paga Walt solo en el modo créditos; con BYOK lo paga la agencia |
| Worker en Railway Pro (producción + staging) | 26 | 26 | 97 | Uso realista USD 26; tope de lo asignado USD 57; alto con una réplica más (USD 40) [RW] |
| Supabase (Pro + cómputo Small + PITR 7 días + proyecto de staging) | 35 | 140 | 140 | Sin PITR: Pro USD 25 + staging USD 10; con PITR, el ejemplo de la doc (USD 130) + staging [SB-PRICE] |
| Vercel Pro (panel) | 20 | 20 | 40 | USD 20 por mes con un asiento que despliega y USD 20 de crédito de uso [V-PRO] |
| Errores, uptime, página de estado y guardia | 0 | 55 | 63 | Planes gratis al principio; Sentry Team USD 26 + Better Stack Responder USD 29 (anual) o 29 + 34 (mensual) [SENTRY] [BS] |
| GitHub Actions | 0 | 0 | 0 | 2.000 minutos por mes incluidos en repos privados del plan Free [GH-ACT] |
| Dominio y mail | 5 | 5 | 5 | Hipótesis |
| **Total sin canales (R1)** | **245** | **563** | **978** | |
| Vercel Sandbox para el agente (R2) | 15 | 29 | 99 | Base: 4.000 corridas de 4 min con 2 vCPU al 10% y 4 GB = USD 29,44 (cuenta con precios de iad1) [V-SBX]; alto con 5 min al 25%, el doble de corridas |
| WhatsApp con Kapso Platform, 100 números (R2) | 572 | 594 | 890 | Kapso USD 299 con 50 números + 50 × USD 5 = 549; Meta: 1 o 2 avisos utility fuera de la ventana por cliente a USD 0,0113 (Uruguay) y, en el alto, 2 promociones por cliente a USD 0,0740 (R3). Los mensajes dentro de la ventana entran en el cupo gratis de 1.000 por número. Detalle en `docs/NEGOCIO.md` §4 [KAPSO] [WA-CALC] |
| **Total con WhatsApp y Sandbox (R2)** | **832** | **1.186** | **1.967** | |

Lectura: con 100 agencias, la infraestructura fija ronda USD 250 por mes y la IA, unos USD 317, que escala con el uso y se traslada (créditos con margen o BYOK). Sin WhatsApp son unos USD 5,6 por agencia y USD 0,028 por pedido; con WhatsApp el rubro más grande pasa a ser el cargo por número de Kapso (USD 5,49 por agencia), y el total llega a unos USD 11,9 por agencia. Ir directo a la Cloud API de Meta ahorraría esos USD 549 por mes a esta escala, a cambio de ser Tech Provider y de que cada agencia pague a Meta con su tarjeta (`docs/NEGOCIO.md` §4.2). Para la beta (5 agencias, Telegram) el costo es casi todo fijo: unos USD 100 a 250 por mes según se active PITR y los planes pagos de observabilidad.

---

## 6. SLOs, SLIs y presupuesto de error

| SLO | SLI (cómo se calcula) | Objetivo R1 | Ventana |
|---|---|---|---|
| Ingreso disponible | Updates y webhooks aceptados con 2xx sobre los recibidos, más el monitor externo de `/healthz` | ≥ 99,5% | 30 días |
| Vista previa rápida | p95 del tiempo entre el evento `recibido` y el envío de la vista previa, en pedidos simples de contenido | ≤ 15 s (hoy 6,7 s en un caso medido, `docs/VELOCIDAD.md`) | 7 días |
| Éxito técnico | Pedidos que no terminan en `derivado` por falla técnica (timeout, proveedor, excepción) sobre el total | ≥ 98% | 30 días |
| Error caro (calidad) | Pedidos publicados como simples que la agencia reetiqueta como delicados | 0 en el eval; alerta con cualquier caso real | Por caso |

Presupuesto de error: el 0,5% de indisponibilidad de 30 días son unas 3,6 horas. Regla: si en una ventana se gasta más de la mitad del presupuesto, se frenan las features nuevas hasta revisar la causa; si se agota, el release siguiente arranca por confiabilidad. El error caro no tiene presupuesto: cada caso es un incidente.

## 7. Operación: guardia, incidentes y postmortems

- **Guardia (R1):** Salva y un segundo, de 8 a 22 de Uruguay, con alertas al teléfono por Telegram. Fuera de horario, el producto degrada solo: el pedido queda `derivado` con aviso al cliente y a la agencia, nunca colgado.
- **Severidades:** SEV1, nadie puede pedir ni publicar o hay una fuga de datos o un error caro publicado; SEV2, un proveedor caído o la cola atrasada más de 5 min; SEV3, una agencia o una función degradada.
- **Plantilla de incidente:** qué se vio y cuándo; a quién afecta; mitigación inmediata; comunicación (página de estado, aviso a las agencias afectadas); cierre.
- **Postmortem:** sin culpables, dentro de 5 días hábiles para SEV1 y SEV2: línea de tiempo, causa raíz, qué funcionó, qué no, acciones con dueño y fecha.
- **Simulacros:** antes del R2, una restauración de la base desde backup y un "proveedor de IA caído" en staging.

---

## 8. Decisiones para Salva

Todo junto, con la recomendación en cada punto. Mientras no respondas, el R1 sigue con el default (columna "Si no decidís") y queda anotado. Montos en USD por mes salvo aclaración.

### 8.1 Plata

| # | Decisión | Recomendación | Costo | Si no decidís | Para |
|---|---|---|---|---|---|
| 1 | Host del worker (ADR-P1) | Railway Pro, en la región de la base | 20 (incluye 20 de uso); 26 a 57 con staging | El worker sigue en tu compu: no hay beta | R1, ya |
| 2 | Plan de Supabase | Pro para producción más un proyecto de staging; PITR de 7 días recién cuando haya clientes que pagan (mientras tanto, backups diarios de 7 días y un `pg_dump` semanal desde el CI) | 25 + 10; con PITR, 130 + 10 | Seguimos en el plan actual (no sé cuál es) | R1 |
| 3 | Vercel Pro para el panel | Sí: Hobby es solo para uso personal no comercial [V-PRO] | 20 por asiento que despliega | El panel queda en Hobby, fuera de los términos para uso comercial | R1 |
| 4 | Presupuesto de IA y tier de Anthropic | Tope de gasto mensual en la Console (beta: 100); pedir el paso a Build antes de superar los 500 por mes del tier Start [A-RL] | 50 a 100 en la beta (hipótesis) | Tope del tier | R1 |
| 5 | Observabilidad y guardia (ADR-P7) | Planes gratis en la beta; Sentry Team y Better Stack Responder cuando haya clientes que pagan | 0 → 55 | Planes gratis (Better Stack gratis dice "for personal projects": revisarlo antes de cobrar) | R1 → R2 |
| 6 | WhatsApp con Kapso (ADR-P6) | Cuenta en Kapso ya (plan Free para probar); Pro al lanzar el R2 | 0 → 25 + 10 por número | El R2 arranca sin WhatsApp | R2 (cuenta en R1) |
| 7 | Vercel Sandbox para el agente (ADR-P10) | Sí, en el R2 | unos 29 a escala | El agente sigue en el contenedor | R2 |
| 8 | Dominio propio | Comprar uno para la landing, el panel, los webhooks y el mail; Meta pide una web con HTTPS que coincida con la entidad | bajo (depende del dominio) | Seguimos en `*.vercel.app` y no se puede verificar el negocio | R1 |
| 9 | Abogado y contador | Pedir presupuesto para términos, privacidad, DPA, política de uso, registro de bases de datos y facturación | a cotizar | Beta solo con agencias conocidas y un acuerdo simple | R1–R2 |

### 8.2 Legal

| # | Decisión | Recomendación | Si no decidís | Para |
|---|---|---|---|---|
| 10 | Entidad legal | **SAS digital en Uruguay ya**: UYU 2.530 más un timbre de UYU 270, todo en línea, RUT en 30 días y factura electrónica desde el inicio [UY-SAS]. La necesitan la cuenta empresa de Mercado Pago, dLocal Go y la verificación de Meta (acepta documentos en español) [META-DOCS]. Una entidad de EE.UU. con Stripe Atlas (USD 500 más USD 100 por año, impuesto de Delaware y el formulario 5472, con multa de USD 25.000 si falta) recién para EE.UU. o Europa [STRIPE]. Con un contador: IVA (22% a clientes de Uruguay; la exportación de servicios puede estar exonerada) e IRAE | Sin cobros, sin cuenta empresa y sin verificación de Meta | R1 (trámite), R2 (cobros) |
| 11 | Pregunta escrita a Anthropic | Mandar a ventas o legal de Anthropic: "¿Walt puede pagar con su cuenta el uso del Claude Agent SDK que corre para sus clientes (agencias)?, ¿y vender créditos de su servicio que se consumen con la API?" (ver `docs/NEGOCIO.md` §5) | El agente usa la clave de la agencia (BYOK) | R1, ya |
| 12 | Documentos legales y datos personales | Términos, privacidad, DPA (contrato de encargado con cada agencia) y política de uso aceptable, con consentimiento para usar pedidos en el eval (Telegram exige consentimiento explícito; con WhatsApp no se puede). Registrar las bases de datos en la URCDP (gratis, en línea); evaluación de impacto por mandar datos a Anthropic en EE.UU. (no se pudo confirmar si está en el Data Privacy Framework); en Brasil, encargado de datos y cláusulas de la ANPD; incidentes en 72 h en Uruguay y en 3 días hábiles en Brasil [UY-DATOS] [LGPD] | Beta con un acuerdo simple por agencia | R1 (registro), R2 |
| 13 | Marca "Walt" | Buscar antecedentes y registrar la marca en Uruguay y Brasil antes de invertir en ella | Riesgo de choque de marca | R2 |

### 8.3 Cuentas a tu nombre (o de la empresa)

| # | Cuenta | Recomendación | Para |
|---|---|---|---|
| 14 | GitHub | Una organización de Walt y, adentro, la GitHub App "Walt" (privada en la beta) con los permisos de ADR-P4 | R1 |
| 15 | Anthropic Console | Organización de Walt con dos workspaces (producción y staging), topes de gasto y claves separadas de las de desarrollo | R1 |
| 16 | Telegram | Dos bots nuevos (producción y staging); @wal101_bot queda para la demo. En el R2, activar Bot Management Mode para que cada agencia cree su bot (Managed Bots) | R1 |
| 17 | Supabase | Proyectos de producción y staging en la misma región que el worker. Confirmá en qué región está el actual (Settings → General): si está en sa-east-1, el worker va a Fly en São Paulo | R1 |
| 18 | Railway, Sentry y Better Stack | Cuentas de la empresa, con 2FA | R1 |
| 19 | Meta Business | Portafolio de Walt y verificación del negocio (necesita entidad, dominio y documentos; puede tardar hasta 14 días hábiles) | R1 (trámite), R2 |
| 20 | Cobros (ADR-P11) | Mercado Pago empresa en Uruguay (suscripciones, recargas y split de señas); Paddle para Brasil (merchant of record, BRL y Pix); Stripe recién con la entidad de EE.UU., porque no admite Uruguay [STRIPE] [MP] [PADDLE] | R2 (cuentas en R1) |

### 8.4 Credenciales (cuando estén las cuentas; nunca por chat, directo en el host o en `~/.walt/.env`)

| # | Credencial | Recomendación |
|---|---|---|
| 21 | Scope `workflow` para el CI | `gh auth refresh -s workflow` y mover `ci/github-actions.yml` a `.github/workflows/` (o un token fine-grained con Workflows en escritura) |
| 22 | Base de datos para el CI | La URL con contraseña de staging y de producción como secretos de GitHub; un token de Supabase con alcance por proyecto solo si hace falta la Management API, nunca uno clásico |
| 23 | Secretos de producción en Railway | Bot de producción y su secreto de webhook, clave secreta de Supabase, API key de Anthropic de producción, GitHub App (id, clave privada y secreto de webhook), DSN de Sentry, URL de heartbeat, `OPENAI_API_KEY` si se quieren audios |
| 24 | Vercel | Protection Bypass for Automation en walt-demo (para las capturas de las vistas previas) |

### 8.5 Producto

| # | Decisión | Recomendación |
|---|---|---|
| 25 | Precios | Aprobar o ajustar la propuesta de `docs/NEGOCIO.md` §1 (Freelancer 29, Agencia 99, Estudio 249, extras y comisión del 5% y 10%) |
| 26 | Margen de los créditos y saldo bajo | 30% y USD 5, como dejó `r1-infra` como provisorio |
| 27 | Agencias de la beta | 3 a 5 agencias con al menos 2 clientes cada una dispuestos a usar Telegram durante 4 semanas |
| 28 | Guardia | Quién es la segunda persona de guardia y en qué horario |

---

## 9. Choques con el contrato del R1 y huecos para la 90

No se cambia el contrato desde acá; esto es para que lo decida la 90.

1. **"Un pedido a la vez por proyecto, con advisory lock por RPC"** (sección Infra). Confirmado con las fuentes: por PostgREST cada request corre en una transacción con una conexión prestada del pool [PGRST], y un `pg_advisory_lock` de sesión queda tomado en esa conexión hasta que la sesión termina y es reentrante para la misma sesión, o sea para cualquier request que reuse esa conexión [PG-ADV]. El esquema 0004 ya lo resuelve bien (lock de transacción dentro de `claim_job` y lease de 120 s con heartbeat); conviene que la sección Infra deje de decir "advisory lock por RPC" a secas. Dos matices: el lock es por proyecto **y cola** (el agente no frena los cambios simples), así que el merge de un cambio de código tiene que pasar por la cola `default` para no publicar dos cambios a la vez; y el brief pedía "un cambio a la vez por proyecto", lo que se cumple solo si se respeta ese detalle.
2. **"La clave anónima solo lee `content_versions`."** Con `using (true)`, cualquiera con la clave pública de cualquier sitio lee los borradores de todos los proyectos de todas las agencias, incluidas promociones todavía no publicadas. Propuesta: anon lee solo `status = 'viva'` (es contenido público de todos modos; Postgres Changes respeta RLS, así que el realtime del sitio sigue andando [SB-RT]) y la vista previa de un borrador va por una RPC `security definer` que recibe el id (el id funciona como capacidad).
3. **"El worker y las acciones de servidor usan la service role."** Con la service role, el aislamiento del panel depende de que cada acción filtre por agencia: un olvido es una fuga. Propuesta: el panel lee con la sesión del usuario (RLS) y usa la service role solo detrás de un único chequeo de membresía, como recomienda la guía de seguridad de Next.js (una capa de acceso a datos que vuelve a verificar la autorización dentro de cada acción) [NEXT-SEC].
4. **Modos de IA del esquema 0004.** `ai_settings.mode = 'claude_code'` solo cumple si significa que la agencia corre Claude Code con su propia cuenta y Walt le pasa tareas sin tener nunca su token; guardar en Vault un token OAuth de la suscripción de la agencia para usarlo desde Walt no está permitido. Y el default "sin fila en `ai_settings`, la clave de Walt" (modo `platform`) está bien para interpretar, pero para el agente de código es justo el caso que hay que confirmar con Anthropic: hasta entonces, el agente pide la credencial de la agencia (ADR-P5, `docs/NEGOCIO.md` §5).
5. **pgvector o `pg_trgm`.** El brief dice pgvector; el contrato elige `pg_trgm` para no sumar un proveedor de embeddings. Coincido (más simple y reversible); queda como desviación registrada, no como choque.
6. **Huecos que el contrato no menciona y el R1 necesita:** (a) migración que corrija el default `config_path = 'dale.config.json'` y los proyectos existentes (hallazgo 4; 0004 no lo toca); (b) la copia de `DEFAULT_RULES` del panel (hallazgo 13); (c) partir los protegidos del agente en "nunca" y "delicado" (hallazgo 10); (d) reglas del diff para red, dominios, scripts e iframes (hallazgo 11); (e) acceso del cliente a vistas previas protegidas y bypass para la captura (hallazgo 12); (f) `contacts.telegram_chat_id` único, que ata un chat a un solo proyecto (R2, con identidad por canal).

---

## Fuentes

Consultadas el 2026-10-20. "Sin fecha" = la página no muestra fecha de publicación ni de actualización.

| Clave | Qué | Link | Fecha de la fuente |
|---|---|---|---|
| A-PRICE | Precios de la API de Claude (Opus 5.5 4/20, Sonnet 5.5 2/10 con lectura de caché 0,10, Haiku 5.5 0,10/0,50, Batch −50%) y notas de versión | https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/release-notes/overview | sin fecha; cambio de caché de Sonnet 5.5 del 2026-10-07 |
| A-RL | Rate limits y tiers Start, Build y Scale (topes de gasto 500, 1.000 y 200.000 por mes) | https://platform.claude.com/docs/en/api/rate-limits | sin fecha; consolidación del 2026-06-26 (notas de versión) |
| V-FN | Vercel Functions: duración máxima, memoria, bundle | https://vercel.com/docs/functions/limitations · https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes | act. 2026-08-24 · 2026-06-15 |
| V-WF | Vercel Workflow (GA) y precios | https://vercel.com/blog/a-new-programming-model-for-durable-execution · https://vercel.com/docs/workflows/pricing | 2026-04-16 · act. 2026-09-16 |
| V-Q | Vercel Queues (beta) | https://vercel.com/changelog/vercel-queues-now-in-public-beta · https://vercel.com/docs/queues/concepts | 2026-02-27 · act. 2026-09-10 |
| V-DMN | Vercel Daemons (beta) | https://vercel.com/changelog/vercel-daemons-is-now-in-public-beta | 2026-10-15 |
| V-SBX | Vercel Sandbox: GA, precios, firewall de salida e inyección de credenciales | https://vercel.com/blog/vercel-sandbox-is-now-generally-available · https://vercel.com/docs/sandbox/pricing · https://vercel.com/docs/sandbox/concepts/firewall | 2026-01-30 · act. 2026-09-10 · act. 2026-09-16 |
| V-PW | Guía oficial de Chromium en Functions (puppeteer-core + chromium-min) | https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel | act. 2025-11-10 |
| V-PRO | Plan Pro (USD 20 con un asiento y USD 20 de crédito) y Hobby (solo uso personal no comercial) | https://vercel.com/docs/plans/pro-plan · https://vercel.com/docs/plans/hobby | act. 2026-09-15 · act. 2026-09-14 |
| V-DP | Deployment Protection, Shareable Links, excepciones y Protection Bypass for Automation | https://vercel.com/docs/deployment-protection · https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection · https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation | act. 2026-09-15 · 2026-09-15 · 2026-09-16 |
| RW | Railway: precios, planes, health checks, deploys, rollback, regiones, DDoS | https://railway.com/pricing · https://docs.railway.com/pricing/plans · https://docs.railway.com/guides/healthchecks · https://docs.railway.com/deployments/reference · https://docs.railway.com/guides/roll-back-bad-deploy · https://docs.railway.com/deployments/regions · https://railway.com/changelog/2026-02-20-domains | sin fecha; DDoS 2026-02-20 |
| RENDER | Render: precios, health checks, deploys | https://render.com/pricing · https://render.com/docs/health-checks · https://render.com/docs/deploys | sin fecha |
| FLY | Fly.io: precios y cambio de precios | https://docs.fly.io/about/pricing · https://fly.io/pricing-update/ | vigentes desde 2026-10-01 |
| SB-PRICE | Supabase: planes, cómputo, backups y PITR | https://supabase.com/pricing · https://supabase.com/docs/guides/platform/compute-and-disk · https://supabase.com/docs/guides/platform/backups · https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery | sin fecha |
| SB-Q | Supabase Queues (alpha) y SLA | https://supabase.com/docs/guides/queues/pgmq · https://supabase.com/sla | sin fecha |
| SB-VAULT | Supabase Vault (alpha pública) | https://supabase.com/docs/guides/database/vault | sin fecha |
| SB-PAT | Tokens personales con alcance | https://supabase.com/changelog/scoped-personal-access-tokens-ga | 2026-10-06 |
| SB-CLI | Supabase CLI y acción de GitHub | https://github.com/supabase/cli/releases · https://github.com/supabase/setup-cli/releases | v2.121.0 del 2026-10-14 · v3.0.1 del 2026-09-24 |
| SB-RT | Realtime: autorización y RLS en Postgres Changes | https://supabase.com/docs/guides/realtime/authorization | sin fecha |
| SB-KEYS | Signing keys asimétricas y claves publishable/secret | https://supabase.com/docs/guides/auth/signing-keys | sin fecha |
| SB-SEC | Cifrado en reposo (AES-256) | https://supabase.com/security | sin fecha |
| PG-ADV | PostgreSQL 18.6: advisory locks de sesión y de transacción | https://www.postgresql.org/docs/current/explicit-locking.html | versión 18.6 |
| PGRST | PostgREST: cada request es una transacción con una conexión del pool | https://github.com/PostgREST/postgrest/blob/main/docs/references/transactions.rst · https://github.com/PostgREST/postgrest/blob/main/docs/references/connection_pool.rst | rama `main` (docs.postgrest.org pedía un desafío de Cloudflare) |
| NEXT-SEC | Next.js: seguridad de datos y de acciones de servidor (POST, comparación de Origin y Host, capa de acceso a datos) | https://nextjs.org/docs/app/guides/data-security | act. 2026-10-06 |
| TG-API | Telegram Bot API (10.3), webhooks y Managed Bots | https://core.telegram.org/bots/api · https://core.telegram.org/bots/api-changelog | 2026-08-24 |
| TG-WH | Telegram: IPs, puertos y TLS de los webhooks | https://core.telegram.org/bots/webhooks | sin fecha |
| GH-APP | GitHub Apps: tokens de instalación (1 h), permisos, límites y tokens de ~520 caracteres | https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app · https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps · https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api · https://github.blog/changelog/2026-10-02-stateless-github-app-installation-tokens-rolled-out/ | sin fecha · 2026-10-02 |
| GH-ACT | GitHub Actions: minutos incluidos y precio por minuto | https://docs.github.com/en/billing/concepts/product-billing/github-actions · https://docs.github.com/en/billing/reference/actions-runner-pricing | sin fecha |
| GH-REL | Versiones de las acciones (`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`) | https://github.com/actions/checkout/releases · https://github.com/actions/setup-node/releases · https://github.com/pnpm/action-setup/releases | 2026-07-20 · 2026-10-08 · 2026-09-05 |
| NPM | Versiones y fechas de publicación (pino, `@sentry/node`, OpenTelemetry, grammY, Playwright, SDK de Anthropic, Agent SDK, supabase-js, Next.js, `@octokit/app`) | https://registry.npmjs.org/ | fechas de publicación citadas en §2.4 |
| NODE | Node.js 24.22.0 LTS (Krypton) | https://nodejs.org/dist/index.json | 2026-10-14 |
| MCR | Imagen `mcr.microsoft.com/playwright:v1.64.1-noble` | https://mcr.microsoft.com/v2/playwright/tags/list | consultado 2026-10-20 |
| SENTRY | Sentry: planes y SDK | https://sentry.io/pricing/ · https://docs.sentry.io/platforms/javascript/guides/node/crons/ | sin fecha |
| BS | Better Stack: planes, heartbeats y página de estado | https://betterstack.com/pricing · https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/ | sin fecha |
| OTEL | OpenTelemetry para JavaScript | https://opentelemetry.io/docs/languages/js/ | sin fecha |
| OAI | Precio de transcripción (`gpt-transcribe` USD 0,0045 por minuto) | https://developers.openai.com/api/docs/pricing | sin fecha |

Las fuentes de canales, términos de Anthropic, competidores, adopción y cobros están en `docs/NEGOCIO.md` › "Fuentes".
