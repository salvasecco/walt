# Decisiones

- La carpeta del repo `walt` es `~/orca/projects/walt`; `walt-demo` es la carpeta hermana `~/orca/projects/walt-demo`.
- Las sesiones corren como subagentes orquestados desde una sesión principal. En vez de SendMessage a la 90, informan con commits + push de su rama, su fila de `docs/ESTADO.md` y su reporte final; la 90 hace los merges.
- Worktrees de las sesiones en `~/orca/projects/walt-worktrees/<nombre>`, rama `<nombre>`.
- Push siempre por HTTPS: por SSH se cuelga.
- El token de `gh` no tiene scope `workflow`, así que GitHub rechaza `.github/workflows/*`. El CI quedó en `ci/github-actions.yml`; para activarlo: `gh auth refresh -s workflow` y moverlo a `.github/workflows/ci.yml`.
- Paquetes sin build: `exports` apunta a `src/*.ts`; los scripts corren con `tsx` y `tsc` solo chequea tipos (`noEmit`).
- TypeScript 5.9 (no 7) por compatibilidad con Next.js y el resto de las herramientas. zod 4 (trae `z.toJSONSchema`).
- `pnpm` 12 pide aprobar scripts de instalación: `allowBuilds: { esbuild: true }` en `pnpm-workspace.yaml`.
- `loadEnv()`: orden `~/.walt/.env` → `.env` local → `process.env` (gana el último), vacío = no definido. Así CI y comandos puntuales pueden forzar modos falsos con variables.
- `loadEnv({ fallbackToFake: true })` baja a modo falso los modos sin credenciales en vez de fallar; `requireCredentials()` es la versión estricta.
- `@walt/core` es para Node; `@walt/core/browser` es el subconjunto sin `node:` para el panel en el navegador.
- Secretos para el gate: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, GITHUB_TOKEN, ANTHROPIC_API_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, OPENAI_API_KEY y PANEL_PASSWORD, si tienen 8 caracteres o más.
- Una operación con forma inválida o que referencia algo que no existe (producto, ruta, color, sección, día) da gate `bloqueado` con la razón: nunca se ignora ni se aplica a medias.
- `adjust_prices` exige exactamente un filtro (`all`, `category` o `productIds`) y falla si algún precio quedaría en 0 o negativo, en vez de recortarlo.
- `adjust_prices` con `rounding: 'none'` igual redondea a 2 decimales para evitar errores de coma flotante.
- El límite de precio compara cada precio contra su valor anterior: más de `maxPriceChangePct` (estricto) pide a la agencia; justo en el límite pasa.
- El cupo del mes se evalúa solo si el pedido saldría automático: `autoPublishedThisMonth + 1 > monthlyQuota` pide a la agencia. El worker pasa cuántos automáticos se publicaron en el mes.
- Una política que no está en las reglas cuenta como `agencia`.
- Más operaciones que `maxOpsPerRequest` piden a la agencia, no bloquean.
- Los textos nuevos no pueden tener ningún carácter de control, tampoco saltos de línea (SPEC §8 al pie de la letra).
- Links: cualquier `esquema://` que no sea `https://` bloquea.
- `decide`: si el proyecto está en modo código, un `cambio` va directo a riesgoso/código (o derivado si no permite código), antes del chequeo de confianza. En modo contenido gana la parte más restrictiva: bloqueado > derivado > riesgoso/código > riesgoso/contenido > permitido.
- `decide`: un `cambio` sin operaciones y sin partes de código es `derivado` ("No pude traducir el pedido a cambios concretos").
- `decide`: `aprobacion` y `revertir` siempre dan `charla`; el worker los resuelve antes como respuesta a un pedido abierto (SPEC §9 paso 3).
- La expresión de código en el texto del cliente también detecta `<img`, `<svg`, `<style`, `<object`, `<embed`, `<link`, `<meta`, `<form`, `<a `, `data:text/html`, `on*=` y `{{`.
- JSON Schema de `Interpretation` para salida estructurada: se genera con `z.toJSONSchema`, objetos cerrados y sin `minimum`/`maximum`/`pattern`/`format`; siempre se revalida con zod.
- El esquema del contenido de la panadería (`packages/core/test/fixtures/site.schema.json`) limita `discountPercent` a 90 y los textos a 300 caracteres; sin `multipleOf` para precios (falla con coma flotante en ajv): los 2 decimales los controla el gate.
- Precios de modelos (USD por millón): Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0,10/0,50; escritura de caché 1,25× la entrada. Un modelo desconocido se cobra como Opus para no subestimar. Bedrock usa la misma tabla.
- `shortId`: 6 caracteres sin 0/O/1/I/L. Tokens de invitación: 12 bytes en base64url (válidos para `/start`).
- Migración: sin `create extension pgcrypto` (`gen_random_uuid()` es nativo). Crea el rol `anon` si no existe y agrega a `supabase_realtime` solo si la publicación existe, así corre también en Postgres sin Supabase. Probada con PGlite.
- `requests.updated_at` se actualiza con un trigger.
- `seed` y `demo:reset` usan `SUPABASE_DB_URL` (Postgres directo), igual que las migraciones.
- `seed` reutiliza una invitación vigente del mismo rol y cantidad de usos en vez de crear otra; distingue la del jurado por sus 50 usos. Sin `TELEGRAM_BOT_USERNAME` imprime `TU_BOT` en los links.
- `seed` en un proyecto existente solo actualiza `site_url` (y el nombre de la agencia).
- `demo:reset` borra pedidos, mensajes, comandos, versiones y reglas del proyecto, y vuelve a crear reglas v1 y la versión viva del fixture. No toca contactos, invitaciones ni el repo del sitio.
- `check-env` prueba el modelo con `models.retrieve` (no gasta tokens). Con Bedrock solo verifica que estén las credenciales.
- `apps/worker/src/dry-run.ts` es una versión mínima (interpretar → gate → decidir sobre el fixture, sin base) para que `pnpm dry-run` ande desde el día uno; 01 lo reemplaza por el pipeline real.
- `@walt/ai` trae la interfaz y el proveedor `fake`; `anthropic` y `bedrock` tiran "no implementado" hasta que los haga 01.
- `content/site.schema.json` del sitio (generado desde su zod) es más permisivo que el fixture de core (descuento hasta 100, textos sin tope): todo lo que pasa el gate lo acepta el sitio. `site.json` y `walt.config.json` son iguales en los dos repos.
- `scripts/run-worker.sh` reinicia el worker si se cae (espera 2 s, hasta 30 s si muere enseguida) y guarda todo en `logs/worker.log` (ignorado por git).
- `demo:reset` con `GITHUB_MODE=real` también commitea el fixture en `content/site.json` del repo del sitio si difiere (`--keep-repo` lo evita), para que el historial de git coincida con la versión viva.
- `@walt/agent`: las cuatro funciones del SPEC leen `loadEnv()` y aceptan un último argumento opcional con dependencias (`host`, `runner`) para pruebas y para el worker. `runCodeChangeWith`/`mergeChangeWith`/`revertChangeWith`/`findPreviewUrlWith` son las versiones explícitas.
- `@walt/agent` con `GITHUB_MODE=fake` usa `LocalHost`: repos bare y PRs en JSON en `$TMPDIR/walt-fake-github/<owner>/<repo>.git`.
- Hook del agente: resuelve la ruta contra el clon (nunca contra el cwd del proceso), hace `lstat` de cada componente y niega cualquier symlink; además `realpath` del ancestro existente. Los protegidos se comparan sin distinguir mayúsculas. Se niega leer y escribir protegidos, y `.git/**` siempre. Glob/Grep: sin patrones absolutos ni `..`.
- Protegidos por defecto, además de los del SPEC: `**/*.lock`, `**/.github/**`, `**/middleware.*`, `**/proxy.*`, `vercel.json`, `.npmrc`, `.claude/**`, y archivos que corren código al instalar o compilar: `.yarnrc*`, `pnpm-workspace.yaml`, `.babelrc*`, `babel.config.*`, `instrumentation.*`, `.gitattributes` y `.gitmodules`.
- El agente corre con `settingSources: []` (no carga hooks ni settings del repo clonado), `permissionMode: 'dontAsk'`, solo Read/Edit/Write/Glob/Grep, 40 turnos, y `env` mínimo: PATH, HOME y TMPDIR temporales y las variables del proveedor. En Bedrock, `CLAUDE_CODE_USE_BEDROCK=1` y el modelo con prefijo `anthropic.`.
- git corre con config aislada (`GIT_CONFIG_GLOBAL=/dev/null`, sin hooks) y el token va como header `http.extraheader` por variables `GIT_CONFIG_*`: nunca en la URL ni en `.git/config`.
- Revisión del diff: solo cuentan las líneas agregadas. Además del SPEC rechaza `new Function(`, variantes de `process.env` (`node:process`, `process?.env`, desestructurado, `Reflect.get`), `child_` armado por partes, `import()` con argumento no literal, `createElement('script')`, binarios, symlinks nuevos, rutas con `..`, más de 30 archivos y un diff vacío.
- Revert de código: clon de la rama principal, `git revert` del squash (con `-m 1` si fuera un merge con dos padres) y commit `walt: revert #{short_id}`.
- Vista previa: primero los deployments de GitHub del commit (estado success, `environment_url` https); si no, statuses con link a `*.vercel.app`. Sondeo cada 10 s hasta 4 min.
- `@walt/core` importa sus módulos con extensión `.ts` (no `.js`): Turbopack y webpack de Next no mapean `.js`→`.ts` en un paquete transpilado. El panel necesita `allowImportingTsExtensions` en su tsconfig.

## 02-panel

- Next.js 16.4 (App Router, Turbopack) con Tailwind 4 y shadcn/ui (estilo base-nova, Base UI). Sin Cache Components: el panel es todo datos en vivo, así que el layout del panel va con `dynamic = "force-dynamic"`.
- Tema único oscuro (no hay modo claro): es un centro de control y se proyecta. Tokens en `globals.css` (`--walt-*`).
- Sistema visual sobrio (oct. 2026, reemplaza la estética neón): paleta neutral con superficies planas (`surface`, `surface-2`, `surface-3`) y bordes de 1px (`line`, `line-strong`), sin glow, sombras de color, gradientes, blur ni grilla de fondo. El color es solo semántico y en poca superficie (`ok` verde, `warn` ámbar, `danger` rojo, `info` azul para consulta/en curso, `code` violeta para el carril de código), en badges chicos; el estado del pedido va en neutro con un punto de color. Primario verde plano. Números y títulos en sans con `tabular-nums`; monospace solo para ids, costos técnicos y tiempos de logs. KPIs planos (`StatTile`) con sparkline en SVG propio solo con datos reales (sin deltas inventados); recorrido como stepper compacto; motion de 150–250 ms sin rebotes.
- Del paquete `@walt/core` el panel importa solo **tipos** (`import type` desde `@walt/core/browser`). El código de core usa imports con `.js` que Turbopack no resuelve a `.ts`; las constantes (categorías, estados, tipos de operación, ids del seed) se repiten en `apps/panel/src/lib/types.ts` atadas con `satisfies` a los tipos de core.
- Entrada: cookie `walt_panel` = `v1.<exp>.<hmac-sha256>` con clave derivada de `PANEL_PASSWORD` (cambiar la contraseña invalida las sesiones), 7 días, httpOnly. El `proxy.ts` la verifica y cada acción de servidor la vuelve a verificar. Sin `PANEL_PASSWORD`: abierto en desarrollo, cerrado en producción.
- `next.config.ts` carga `~/.walt/.env` en local (solo completa variables que falten; en Vercel no). El panel lee `SUPABASE_URL`/`SUPABASE_ANON_KEY` del servidor y se las pasa al navegador para realtime: no hace falta `NEXT_PUBLIC_*` (se aceptan igual).
- Lecturas del panel del lado del servidor con service role; realtime en el navegador con anon (requests, events, messages, content_versions).
- Datos de ejemplo: solo si no hay Supabase y `NODE_ENV !== production`, con la etiqueta "datos de ejemplo" visible en todas las pantallas. En producción sin Supabase se muestra "Falta conectar la base". En En vivo, con datos de ejemplo, una simulación reproduce un pedido paso a paso para ver el recorrido.
- Acciones → `commands`: aprobar, rechazar, publicar (agente listo), revertir, reintentar_commit (`payload.version_id`), enviar_presupuesto (`payload.quote_id`). Todas llevan `payload.via = "panel"` y `actor = "agencia"`.
- Escrituras directas que no son comandos (no hay tipo de comando para ellas): guardar reglas inserta en `rules` (versión = última + 1, reintenta ante choque de unique); conectar un repo inserta en `projects` + reglas v1 por defecto; las invitaciones insertan en `invites` (5 usos, 7 días, cliente y agencia); editar un presupuesto hace update en `quotes` y "Enviar al cliente" además inserta `enviar_presupuesto`.
- Conectar un repo: la prueba corre en el servidor contra la API de GitHub con `GITHUB_TOKEN` (sin token, solo repos públicos, y se avisa). Modo contenido si `walt.config.json` existe en la rama y tiene `version: 1` y `content`; si no, modo código. El nuevo proyecto va a la primera factory (o la del seed).
- QR de invitación: SVG generado en el servidor con `qrcode`, link `https://t.me/{TELEGRAM_BOT_USERNAME}?start={token}`.
- Captura en Aprobaciones: si algún mensaje del pedido trae `media.url` se muestra esa imagen; si no, el sitio en un iframe con `?preview=<draft_version_id>`; si no hay URL del sitio, un render mínimo del contenido con los cambios aplicados.
- La URL del sitio de un proyecto es `projects.site_url`; para el proyecto del seed, si está vacía, `DEMO_SITE_URL`.
- "Resuelto sin la agencia" = pedidos del día con categoría permitido, consulta o charla sobre los que tienen categoría. "Tiempo medio a publicado" = desde `requests.created_at` hasta el evento `publicado` ok. Día en America/Montevideo.
- Lo que piden: sugerencias cuando un proyecto repite un tipo de operación 3 veces o más en 30 días; "repetidos" agrupa textos normalizados (sin tildes, números como `#`).
- Para instalar en el workspace hubo que agregar `sharp: false` y `unrs-resolver: false` a `allowBuilds` del `pnpm-workspace.yaml` raíz (pnpm 12 falla si quedan builds sin decidir).

## 04-agente-eval: evaluación

- Eval: "ahora" fijo `2026-10-14T12:00:00-03:00` (miércoles) para que las fechas relativas sean reproducibles; reglas v1 por defecto; contexto de `decide` en modo contenido salvo que el caso traiga `context`.
- Eval: `expected.category` puede ser una lista para pedidos ambiguos; `expected.ops` acepta `"*"` como comodín (texto del cartel, tono de "violeta"). Las operaciones se comparan normalizadas (orden, claves, mayúsculas, acentos, fechas como instantes, números a 2 decimales) o por efecto: dos listas que producen los mismos cambios sobre el contenido cuentan como iguales.
- Eval: "fueron a la agencia" = categoría riesgoso. "Cambios prohibidos aplicados" = texto del cliente con código que no terminó bloqueado, o un cambio que se aplicaría (permitido, o riesgoso de contenido tras aprobar) fuera del inventario o con texto que no pasa `checkText`. `pnpm eval` sale con código 3 si es mayor que 0.
- Eval: una falla o timeout del modelo (60 s por caso) cuenta como derivado, igual que en el worker. Si no hay credenciales del modelo corre con el proveedor falso y el reporte lo dice arriba; `--provider anthropic` fuerza el real.
- Eval: además de los 30 sintéticos hay `cases/inyecciones.jsonl` con 10 inyecciones extra, también sintéticas, reportadas aparte.
- Vistas previas de las ramas `walt/*` del agente (90): se dejan buildear en Vercel porque la agencia las necesita para revisar. Verificado: el proyecto `walt-demo` en Vercel solo tiene `WALT_PROJECT_ID` y, al conectar Supabase, `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (públicas, la anon solo lee por RLS); ningún secreto del lado del servidor. Regla: nunca cargar secretos en el entorno Preview de un repo conectado al carril de código. Para repos de terceros con secretos en Preview, queda pendiente apagar los builds de `walt/*` hasta la aprobación (Ignored Build Step de Vercel). La revisión del diff del agente ayuda pero no es una frontera dura: la frontera es que la agencia aprueba antes del merge.
## 01-worker

- `@walt/ai`: un transporte común (Messages API) para `anthropic` (SDK `@anthropic-ai/sdk`, `client.beta.messages.create` con `fallbacks: 'default'` y beta `server-side-fallback-2026-07-01`) y `bedrock` (`AnthropicBedrockMantle` de `@anthropic-ai/bedrock-sdk`, id con prefijo `anthropic.`). Salida estructurada con `output_config.format` + `interpretationJsonSchema`, revalidada con `InterpretationSchema`; un reintento si no valida; un rechazo (`stop_reason: refusal`) no se reintenta y termina en derivado.
- Sin `temperature`: Sonnet 5.5 rechaza valores no default. "Temperatura baja" del SPEC se reemplaza por `effort`: `medium` para interpretar, `low` para consultas y presupuestos. Timeout 45 s por llamada, `maxRetries: 1` en el SDK.
- El system prompt (estático, en `packages/ai/prompts/*.md`) lleva `cache_control`; el inventario, el historial y el mensaje van en el turno del usuario. El texto del cliente va en `<mensaje_cliente>` (y el historial en `<historial>`), con las etiquetas de cierre neutralizadas.
- Si el modelo devuelve operaciones en algo que no es `cambio`, se descartan.
- `answerConsulta` acepta `assistantName` opcional para presentarse con el nombre de la agencia (marca blanca).
- `transcribe`: API de OpenAI con `OPENAI_API_KEY` (ver "velocidad" abajo); sin la clave, el bot pide el texto.
- El worker usa `SUPABASE_DB_URL` (Postgres directo con `postgres`, service role implícito) en vez del cliente REST de Supabase: un solo camino, probado con PGlite sobre la migración real. Realtime no cambia (es replicación lógica). Sin `SUPABASE_DB_URL` el worker usa una base en memoria con los mismos datos del seed.
- Consola: los contactos de consola usan los chat ids fijos 1 (cliente) y 2 (agencia) en el proyecto del seed.
- Respuestas cortas ("sí", "dale", "no", "volvé atrás") a un pedido abierto no crean pedido nuevo: se guardan como mensaje del pedido abierto y actúan como el botón. Si la IA devuelve `aprobacion`/`revertir`, el pedido queda `charla` y se resuelve el pedido abierto.
- "No era eso": el borrador queda `descartada`, el pedido `descartado`, y el próximo mensaje del chat crea un pedido con `parent_request_id` (en memoria del proceso).
- Al publicar se reutiliza el borrador que vio el cliente si se armó sobre la misma versión viva (mismas operaciones, mismo resultado); si la viva cambió, se crea una versión nueva y el borrador se descarta.
- Si al publicar el gate da `agencia` (cambiaron las reglas entre la vista previa y el "Walt"), el pedido pasa a la agencia en vez de publicarse.
- Riesgoso de contenido sin cambios concretos (por ejemplo, poca confianza y sin operaciones) va a derivado: no hay nada que la agencia pueda aprobar.
- Vuelta atrás: `revertChanges` y después `runGate` sin operaciones sobre el contenido revertido (esquema y seguridad).
- Carril de código: el `mergeSha` se guarda en `requests.changes` como `{ mergeSha }` (no hay columna) y se usa para el revert. [Descartar] usa `gno:{short}`.
- Límite por chat: 5 pedidos en 10 minutos cuenta pedidos creados; el sexto recibe "Me mandaste muchos pedidos seguidos…". Cola rápida y lenta de 20 como máximo, concurrencia 1.
- Captura: Chromium de Playwright reutilizado entre capturas, 390×844 con `deviceScaleFactor: 2`, `networkidle`, 25 s. Sin captura o con `SCREENSHOTS=off` se manda el link de la vista previa.
- Textos del worker que no están en `@walt/core/copy` (rechazo de la agencia, conflicto al revertir, avisos a la agencia, límite de pedidos) viven en `apps/worker/src/texts.ts` hasta que la 90 los mueva a core.
- `PANEL_URL` (opcional, `process.env`) agrega el botón "Ver en el panel" a los avisos de la agencia.
- Fase 2, opciones: si la IA devuelve dos `options` (sin `ops`) y las dos pasan el gate en `auto`, se arman dos borradores con captura y un botón `opt:{short}:{i}` cada uno; elegir aprueba y publica esa opción y descarta la otra. Las opciones se guardan en `requests.gate.options`. Si alguna no pasa en `auto`, sigue el camino normal.
- Al arrancar, el worker pasa a `derivado` los pedidos que quedaron en recibido, interpretando, cotizando, publicando o agente_trabajando (un reinicio los cortó), con su aviso al cliente y a la agencia: así ningún pedido queda colgado aunque `run-worker.sh` lo reinicie.

## Integración con credenciales reales (17/10)

- **Supabase solo por HTTPS.** La red bloquea 5432 y 6543 hacia afuera. El worker usa `SupabaseStore` (supabase-js con la service role), `publish_version` va por `rpc`, y seed y `demo:reset` también usan supabase-js. Las migraciones se aplican a mano en el SQL Editor; `pnpm db:migrate` solo comprueba por REST y copia el SQL. `PgStore` queda para las pruebas con PGlite contra la migración real.
- **Sin transacciones por REST.** `redeemInvite` usa compare-and-swap sobre `uses`; `demo:reset` borra en orden hijo → padre.
- **Salida estructurada con ops planas.** La API rechazó el esquema exacto de `Interpretation` ("compiled grammar is too large"). Las ops viajan como un objeto plano con todos los campos requeridos y nulables, y `fromWire` las vuelve a la unión antes de validar con zod.
- **Contraste en el gate.** Un cambio de color que deja el texto con contraste menor a 4.5:1 (WCAG AA) contra el fondo va a la agencia. El prompt pide tintes claros para el fondo.
- **GITHUB_TOKEN** sale de `gh auth token` (acceso a todos los repos de la cuenta); reemplazar por uno fine-grained si hace falta.

## velocidad (17/10)

- Audios: modelo `gpt-transcribe` (el más nuevo y recomendado para `/v1/audio/transcriptions` según la doc oficial de OpenAI de octubre de 2026; elegido por la doc porque no había `OPENAI_API_KEY` para listar modelos), con `languages[]=es` y un `prompt` corto de contexto. Si la API rechaza el pedido (4xx que no sea 401/403/429, por ejemplo un formato que no toma), reintenta una vez con `gpt-4o-mini-transcribe` y `language=es`. La doc no lista OGG entre los formatos; las notas de voz de Telegram son OGG/Opus: el reintento cubre ese caso.
- La transcripción no depende de `LLM_PROVIDER`: `createTranscriber(env)` solo mira `OPENAI_API_KEY` (antes exigía un proveedor real de LLM).
- Audio transcripto: se responde "🎙️ {transcripción}" (mensaje de salida del pedido), la entrada guarda la transcripción como `text` con `media: { tipo: 'audio', mime, transcripcion: true }` y sigue el pipeline como un texto (también como respuesta corta: un "dale" por audio aprueba). Sin clave: "Todavía no puedo escuchar audios: falta configurar la transcripción. ¿Me lo escribís?". Si la transcripción falla o viene vacía: "No pude entender el audio. ¿Me lo escribís?", sin crear pedido.
- `pnpm voice-test ["<texto>"] [--approve] [--undo] [--file <audio>]` genera el audio con `say -v Paulina` y lo pasa por el mismo handler de voz del worker (`pnpm dry-run --audio <archivo>`). `afconvert` de esta Mac no escribe Ogg/Opus ("pck?") y no hay ffmpeg: el script cae a m4a (AAC), que la API acepta.
- `pnpm dry-run --agency`: además de `gok`, aprieta `pub` cuando el agente termina y espera "en la web". El dry-run imprime al final un resumen de pasos con duración y segundo en que terminó.
- Contrato de contenido ampliado: colores `text`, `title`, `button`, `buttonText`; textos `/about/title`, `/headings/{products,hours,contact}/{title,subtitle}` y `/contact/address`. En el JSON Schema de core y en el zod del sitio los campos nuevos no son obligatorios (una versión viva vieja sigue valiendo; el sitio usa valores por defecto). Un subtítulo vacío no se muestra.
- Gate de contraste por pares (`contrastPairs`): texto/fondo 4,5:1, título/fondo 3:1 (WCAG AA texto grande), texto del botón/botón 4,5:1. Se mide solo si el cambio toca alguno de los dos colores del par. Un par que no pasa va a la agencia, no se bloquea.
- Prompt de interpretación v4: usa el token más específico (`title`, `button`) y tonos legibles (título naranja `#EA580C`, botón verde `#15803D`; botón claro → `buttonText` oscuro).
- Agente: `MODEL_AGENT` por defecto `claude-sonnet-5-5`; si Sonnet tira error, no cambia nada o la revisión rechaza el diff, reintenta con `claude-opus-5-5` desde un clon limpio y con el mismo tiempo total. 15 turnos de tope (medido: 4–6). El resultado trae `timings` por fase, `turns` y `model`.
- Worker: eventos y mensajes salientes se guardan en una cadena ordenada sin bloquear el pedido; `idle()` la espera y el historial la vacía antes de leer. El commit del JSON va de fondo y en orden. Si el proceso muere sin cerrar, se pueden perder los últimos eventos (no el estado del pedido).
- `GitHubSiteRepo.loadContract`: caché con refresco de fondo pasados 60 s.
- Vercel: `ignoreCommand` en walt-demo (solo `content/` o `walt.config.json` → no buildea) y en `apps/panel/vercel.json` (sin cambios en el panel, core ni lockfile → no buildea). `typescript.ignoreBuildErrors` en los dos; tipos y lint en `pnpm typecheck` y CI.
## clientes (Atención y Clientes)

- Atención: cada proyecto va a una sola columna por precedencia **Te necesita > En curso > Esperando al cliente > Al día** (las columnas se muestran en el orden Te necesita, Esperando al cliente, En curso, Al día). Lógica pura en `apps/panel/src/lib/attention.ts`, con pruebas.
- Te necesita: `esperando_agencia`, `agente_listo` (el cambio de código espera que la agencia publique), presupuesto en `borrador`, derivado/bloqueado abierto, o versión `viva` con `git_error` y sin `git_commit_sha` (la misma condición que el detalle del pedido usa para "reintentar commit"). En curso: `recibido`, `interpretando`, `cotizando`, `agente_trabajando`, `publicando`. Esperando al cliente: `esperando_cliente` o presupuesto `enviado`.
- Un derivado o bloqueado cuenta solo si es de los últimos 7 días y no hay un pedido `publicado` posterior en el mismo proyecto (se toma como resuelto).
- Dentro de un proyecto manda el ítem más urgente (por precedencia y, a igual columna, el más viejo); en Te necesita y Esperando el proyecto que espera hace más va arriba; en En curso y Al día, el más reciente. Al día muestra el último pedido de los últimos 7 días, si hay.
- El contador "Te necesita" del menú cuenta proyectos en esa columna, incluidos los de ejemplo (es lo mismo que muestra el tablero).
- Realtime del tablero y del contador: un componente en el layout se suscribe (anon) a requests, quotes, content_versions, projects y clients y hace `router.refresh()` agrupando cambios cada 700 ms. Las tarjetas se mueven con `layoutId` de framer-motion (220 ms, sin rebote, respeta reduced motion). A 390 px las columnas se apilan.
- Después del login se entra a `/atencion` (antes `/`). En vivo sigue en `/`.
- Salud de un cliente (pura, `apps/panel/src/lib/client-health.ts`): **rojo** si algo de sus proyectos está en Te necesita hace más de 24 h o se pasó del cupo; **ámbar** si hay algo en Te necesita, usó el 80% del cupo o más, o no pidió nada en 30 días; **verde** el resto. El tooltip muestra los motivos y la regla.
- "Cambios usados en el mes" = pedidos del mes (por `created_at`, mes en hora de Montevideo) en estado `publicado` o `revertido` con carril de contenido o código. Es el cupo comercial del plan (`clients.monthly_quota`), distinto de `limits.monthlyQuota` de las reglas, que limita lo automático. Costo de IA del mes = suma de `cost_usd` de sus pedidos del mes.
- Clientes de ejemplo: una sola fuente (`apps/panel/src/lib/sample-clients.mts`, `.mts` para que `tsc` de los scripts la tome como ESM) que usan `pnpm seed` y los datos de ejemplo del panel en desarrollo. Ids fijos (`SAMPLE_IDS`). El seed borra y vuelve a crear los dos proyectos de ejemplo en cada corrida (las fechas quedan en el mes corriente); el cliente de la panadería se crea si no existe y se vincula al proyecto si no tenía cliente.
- Además de los pedidos del mes, cada cliente de ejemplo tiene uno o dos pedidos publicados de meses anteriores (también `is_sample`) para que el gráfico de consumo tenga historia.
- Seguridad con el worker real: los proyectos de ejemplo no tienen contacto de agencia y su contacto cliente usa chats inexistentes (-1001, -1002); no hay pedidos de ejemplo en estados que el worker toma al arrancar (recibido, interpretando, cotizando, publicando, agente_trabajando). Además, `sendCommand` y "Enviar al cliente" no insertan comandos para pedidos con `is_sample` (avisan "Es un pedido de ejemplo").
- En vivo excluye los pedidos de ejemplo (es la pantalla de la demo).
- Sin la migración 0003 el panel sigue andando: Atención usa `projects.client_name` y Clientes avisa que falta la migración y lista los proyectos; el seed saltea los clientes y lo dice.
- `@walt/panel` ahora tiene `pnpm test` (vitest) para las funciones puras.

## R1 infra

- La migración del R1 va en dos archivos: `0004_r1.sql` (aditiva para el panel de hoy) y `0005_r1_cierre_anon.sql` (cierra la anon). Separados porque el panel actual escucha el realtime con la anon: 0005 se aplica cuando el panel use sesiones de Supabase Auth.
- 0004 cambia las categorías y migra los datos sin tocar `updated_at`. Un trigger traduce las categorías viejas al escribir, así el worker de main no falla mientras se integra (con el worker viejo, un cambio riesgoso de contenido aprobado por la agencia puede volver a la agencia: aplicarla junto con el worker nuevo).
- La migración crea los roles `authenticated` y `service_role` y un esquema `auth` mínimo (`auth.users`, `auth.uid()`) solo si no existen, como 0001 con `anon`: corre igual en Postgres pelado (PGlite). El Vault no se imita en la migración (una base sin Vault tiene que fallar, no guardar claves en claro): las pruebas lo simulan aparte.
- `request_labels` no cambia `requests.category`: queda la decisión original del sistema para medir la precisión; la corrección vive en la etiqueta.
- Similitud de pedidos con `pg_trgm` (índice GiST en `requests.raw_text`), como dice el contrato; sin embeddings.
- Cola durable: tabla `jobs` con dos colas, `default` (pedidos, botones, comandos) y `agent` (el agente de código). Un trabajo a la vez por proyecto y cola: el agente tarda minutos y no frena los cambios simples del mismo proyecto; solo toca su pedido y su rama.
- Dentro de un proyecto el orden es estricto: si el trabajo más viejo espera su reintento, los de atrás esperan (un "sí" nunca se procesa antes que su pedido).
- Lease de 120 s renovado con heartbeat en vez de un lock de sesión: por PostgREST cada RPC es una transacción y las conexiones se comparten, así que un advisory lock de sesión no sirve. El advisory lock por proyecto es de transacción y vive adentro de `claim_job`, `publish_version_v2` y la numeración de versiones.
- Backoff: `5·2^(intento-1)` s con ±25 % de jitter y tope de 10 min; 5 intentos y después dead letter (`dead = true`, `status = failed`), reencolable con `retry_job`.
- `publish_version_v2` toma como versión esperada el `parent_id` del borrador si no se le pasa otra: publicar algo armado sobre una viva vieja da `40001` en vez de pisar otro cambio. Misma versión o misma `publish_key`: no hace nada. `publish_version` queda igual para el worker de main.
- `processed_updates`: `update_id` deja de ser la PK (sigue con índice único completo, así el `on conflict (update_id)` del worker viejo anda) y se suma `key` única para WhatsApp y otros webhooks.
- Sin fila en `ai_settings`, la agencia usa la clave de Walt como hoy (modo `platform` en el ledger, sin cobro). Margen de créditos por defecto 30 % y alerta de saldo bajo en USD 5: provisorios, los decide Salva.
- `github_installations` y `ai_settings` no se escriben con la sesión del usuario: una agencia podría reclamar la instalación de otra o apuntar a un secreto ajeno. Las escribe el servidor (service role) después de verificar.
- Roles: `owner` (todo, incluido el equipo), `admin` (proyectos, clientes, reglas, contactos y equipo salvo dueños), `member` (comandos, reetiquetas, presupuestos e invitaciones).

