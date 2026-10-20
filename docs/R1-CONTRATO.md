# Contrato compartido del R1

Lo fija la integración (90) para que las sesiones en paralelo no choquen. Si una sesión necesita cambiarlo, lo propone en su fila de `docs/ESTADO.md` y la 90 lo actualiza. El brief completo está en `docs/BRIEF-PRODUCCION.md`.

## Taxonomía (columna `requests.category`)

| Valor nuevo | Reemplaza a | Flujo |
|---|---|---|
| `consulta` | `consulta` | Walt responde |
| `simple` | `permitido` y casi todo `riesgoso` | Vista previa, «Dale» del cliente y se publica, sin la agencia. Por contenido (ops) o por código (PR) |
| `delicado` | lo de `riesgoso` que toca zonas delicadas | El agente arma el PR, la agencia aprueba el diff en el panel, el cliente ve la vista previa y publica |
| `nuevo` | `fuera_de_alcance` | Presupuesto con alcance, plazo, precio y link de pago (seña) |
| `bloqueado` | `bloqueado` | No se aplica nada |
| `charla`, `derivado` | iguales | Internos: charla sin pedido, y falla técnica sin respuesta automática |

- `requests.lane` sigue siendo `contenido` | `codigo`. El carril no define la categoría.
- Migración de datos: `permitido`→`simple`, `riesgoso`→`delicado`, `fuera_de_alcance`→`nuevo`.
- Doble clasificación: la IA clasifica por intención y después el código mira el diff real (globs delicados, migraciones, `.env*`, manifiestos, auth). Si toca una zona delicada, el pedido sube a `delicado`. Nunca baja solo.
- `maxPriceChangePct` pasa a ser una advertencia visible en la vista previa, no una derivación.
- Ambigüedad: opciones al cliente, nunca escalar a la agencia.

## Reglas por proyecto (tabla `rules`, versionada como hoy)

Columnas nuevas, de la migración de infra:
- `policy_text text not null default ''`: la política en lenguaje natural de la agencia, que entra al prompt de decisión.
- `config jsonb not null default '{}'`: forma `RulesConfig`, definida en `@walt/core` (zod) por la sesión de taxonomía:
  - `delicateGlobs`, `protectedGlobs` y `simpleGlobs`: `string[]`;
  - `alwaysNew`: `string[]` con descripciones cortas de pedidos que siempre son «algo nuevo»;
  - `template`: `string` (`nextjs-supabase`, `wordpress`, `shopify`, `tiendanube`, `generic`);
  - `priceWarnPct`: `number`.
- `policies` y `limits` siguen existiendo. `DEFAULT_RULES` pasa `set_banner` y `toggle_section` a `auto`.

## Aprendizaje

- Tabla `request_labels`: `id`, `request_id`, `factory_id`, `from_category`, `to_category`, `reason`, `actor_user_id`, `created_at`. Es el reetiquetado de la agencia.
- Las señales (`No era eso`, reversión, rechazo, ediciones del PR, tiempo a publicar, costo) salen de `events`, `approvals` y `requests`. Si hace falta, se agregan pasos de evento nuevos.
- Ejemplos para el prompt: los reetiquetados de la misma agencia, recuperados por similitud. El default es `pg_trgm` en Postgres, sin servicio de embeddings; pgvector queda para cuando haya un proveedor de embeddings decidido.

## Multi-tenant

- Panel con Supabase Auth. Tabla `memberships` (`user_id`, `factory_id`, `role`: `owner` | `admin` | `member`). RLS por `factory_id` para `authenticated`.
- La clave anónima solo lee `content_versions` (lo que necesita el sitio). Se cierra la lectura pública de pedidos, mensajes, clientes, etc.
- El worker y las acciones de servidor usan la service role.

## Infra

- Cola durable en Postgres: tabla `jobs`, con claim atómico por RPC (`for update skip locked`), reintentos con backoff exponencial y dead letter. Un pedido a la vez por proyecto, con advisory lock por RPC.
- La red de la compu de Salva solo deja salir el 443: todo va por supabase-js y RPC, nunca por Postgres directo.
- Las migraciones nuevas son archivos `0004_*.sql` en adelante. Las aplica Salva en el SQL Editor hasta que el CI con la CLI de Supabase esté activo.

## Esquema 0004

Lo agrega la sesión de infra (`supabase/migrations/0004_r1.sql`, más `0005_r1_cierre_anon.sql`). Se aplican a mano en el SQL Editor: `pnpm db:migrate` dice qué falta y `pnpm db:migrate --copy 0004` la copia. Las dos son idempotentes.

**Orden:** 0004 junto con el worker nuevo (cambia las categorías; un trigger traduce las viejas para que el worker de hoy no falle). 0005 recién cuando el panel use sesiones de Supabase Auth para el realtime: cierra la lectura anon de todo salvo `content_versions`, y el panel de hoy escucha requests, events, messages, quotes, projects y clients con la anon.

**Tablas y columnas nuevas**

| Qué | Columnas | Notas |
|---|---|---|
| `requests.category` | `consulta`, `simple`, `delicado`, `nuevo`, `bloqueado`, `charla`, `derivado` | Datos migrados. Trigger `requests_legacy_category`: `permitido`→`simple`, `riesgoso`→`delicado`, `fuera_de_alcance`→`nuevo` al escribir |
| `rules` | `policy_text text` (''), `config jsonb` ('{}') | `config` con la forma `RulesConfig` de `@walt/core` |
| `request_labels` | `id`, `created_at`, `request_id`, `factory_id`, `from_category`, `to_category` (`consulta`, `simple`, `delicado`, `nuevo`, `bloqueado`), `reason`, `actor_user_id` (→ `auth.users`) | No cambia `requests.category`: queda la decisión original para medir precisión. Índice GiST `pg_trgm` en `requests.raw_text` |
| `memberships` | `id`, `user_id` (→ `auth.users`), `factory_id`, `role` (`owner`, `admin`, `member`), unique (`user_id`, `factory_id`) | |
| `jobs` | `id`, `kind`, `queue` (`default` o `agent`), `payload`, `project_id`, `request_id`, `dedupe_key` (único), `status` (`pending`, `running`, `done`, `failed`), `attempts`, `max_attempts` (5), `run_after`, `last_error`, `dead`, `created_at`, `locked_at`, `locked_by`, `lease_until`, `finished_at` | Cola durable del worker. Solo la service role escribe; los miembros leen los de sus proyectos |
| `processed_updates` | `key text` (único), `source` ('telegram'), `update_id` pasa a nullable (sigue único), `id` identity como PK | WhatsApp y otros webhooks usan `key`, por ejemplo `wa:<id>` |
| `content_versions` | `version int` (1, 2, 3… por proyecto, lo pone un trigger), `publish_key text` (único) | Locking optimista en `publish_version_v2` |
| `ai_settings` | `factory_id`, `project_id` (null = de la agencia), `mode` (`byok`, `credits`, `claude_code`), `secret_id` (Vault), `key_hint`, `key_validated_at`, `monthly_cap_usd`, `request_cap_usd`, `alert_pct` (80), `model_classify`, `model_code`; unique nulls not distinct (`factory_id`, `project_id`) | Sin fila: la clave de Walt, como hoy (`platform` en el ledger). Nunca guarda la clave |
| `wallets` | `factory_id` (PK), `balance_usd`, `markup_pct` (30, provisorio), `low_balance_usd` (5), `auto_recharge`, `auto_recharge_usd` | Se mueve solo por RPC |
| `usage_ledger` | `factory_id`, `project_id`, `request_id`, `kind` (`ai`, `agent`, `recharge`, `adjustment`), `mode` (`platform`, `byok`, `credits`, `claude_code`), `model`, tokens (`input`, `output`, `cache_read`, `cache_write`), `cost_usd`, `price_usd`, `wallet_delta_usd`, `balance_after_usd`, `reference` (único), `detail` | Una fila por llamada al modelo o recarga |
| `github_installations` | `factory_id`, `installation_id` (único), `account_login`, `account_type`, `suspended_at` | Solo la escribe el servidor tras verificar con GitHub que el usuario tiene esa instalación |

**RPC** (por supabase-js: `db.rpc(nombre, { p_… })`)

| Función | Quién | Qué hace |
|---|---|---|
| `similar_labeled_requests(p_factory, p_text, p_k = 5)` | service role, authenticated (RLS) | Últimas etiquetas de pedidos de la agencia, ordenadas por `similarity(raw_text, p_text)`. Devuelve `request_id`, `raw_text`, `from_category`, `to_category`, `reason`, `similarity`, `labeled_at` |
| `label_request(p_request, p_to_category, p_reason, p_actor)` | service role, authenticated | Inserta la etiqueta con `from_category` = la categoría actual. Con sesión, el actor es el usuario; con la service role, `p_actor` |
| `create_factory(p_name, p_assistant_name, p_owner)` | authenticated, service role | Crea la agencia y deja al usuario (o `p_owner`) como `owner` |
| `is_member(p_factory)`, `has_factory_role(p_factory, p_roles)`, `is_project_member`, `is_project_admin`, `is_request_member`, `is_contact_member`, `is_command_member` | authenticated | Helpers de las políticas |
| `enqueue_job(p_kind, p_payload, p_project, p_request, p_queue, p_dedupe_key, p_run_after, p_max_attempts)` | service role | Devuelve `id` e `inserted` (false si la `dedupe_key` ya estaba) |
| `claim_job(p_worker, p_queues, p_lease_seconds = 120)` | service role | Toma el próximo listo con `for update skip locked` y advisory lock por proyecto. Un trabajo a la vez por proyecto y cola, en orden. Reencola los leases vencidos |
| `heartbeat_job`, `complete_job`, `fail_job(…, p_retry, p_base_seconds = 5, p_max_backoff_seconds = 600)`, `dead_letter_job`, `retry_job`, `jobs_summary`, `purge_old_rows` | service role | Backoff `5·2^(intento-1)` s con ±25 % de jitter; al agotar `max_attempts`, dead letter |
| `project_lock_key`, `lock_project(p_project, p_scope)` | service role | Advisory lock de transacción por proyecto (por PostgREST no hay locks de sesión: lo que dura un trabajo es el lease de `jobs`) |
| `publish_version_v2(p_project, p_version, p_expected_live, p_key)` | service role | Como `publish_version`, pero solo publica un borrador hecho sobre la viva actual (`p_expected_live` o su `parent_id`): si no, error `40001`. Republicar la misma versión o la misma `p_key` devuelve `already: true`. `publish_version` sigue igual |
| `record_usage(…)`, `credit_wallet(p_factory, p_amount_usd, p_reference, …)`, `usage_since(p_factory, p_since, p_project)` | service role | En modo `credits`, `record_usage` descuenta `price_usd` de la billetera en la misma transacción |
| `set_ai_key(p_factory, p_project, p_key)`, `get_ai_key(p_factory, p_project)`, `clear_ai_key(p_factory, p_project)` | service role | BYOK con Supabase Vault (`vault.create_secret` adentro de una función security definer). La clave se valida antes con una llamada barata y nunca se loguea |

**RLS para `authenticated`:** los miembros leen todo lo de sus agencias (factories, projects, clients, contacts, invites, rules, requests, events, messages, content_versions, approvals, quotes, commands, request_labels, jobs, memberships, ai_settings, wallets, usage_ledger, github_installations). Escriben: cualquier miembro inserta `commands`, `request_labels` (con `actor_user_id = auth.uid()`) e `invites`, y edita `quotes`; `owner` y `admin` manejan `projects`, `clients`, `contacts`, `rules` y el equipo (`memberships`; un admin no toca dueños). `processed_updates` es solo de la service role.

**Anon (después de 0005):** solo `select` en `content_versions`, y ninguna función.
