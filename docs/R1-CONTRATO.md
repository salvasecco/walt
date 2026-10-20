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
