# Walt: de la hackatón a un producto en producción que se vende solo

Fecha: 20 de octubre de 2026. Esto es un push grande: Walt deja de ser una demo y pasa a ser un producto que una agencia o un freelancer puede encontrar, contratar, configurar y usar con sus clientes reales, sin que nosotros intervengamos. Leé todo antes de empezar.

## 0. Cómo trabajar

- Fuente de verdad actual: `docs/SPEC.md`, `docs/DECISIONES.md`, `docs/ESTADO.md` y `CLAUDE.md`. Este brief los actualiza; donde choquen, gana este brief, y anotás el cambio en `docs/DECISIONES.md`.
- Walt es para **cualquier software entregado**, no solo webs: apps, sistemas, tiendas, CRMs, bots. La web de la panadería es solo el vehículo de la demo.
- El producto se diseña completo y se entrega por releases. Nada de recortar alcance para llegar antes: se ordena por etapas.
- Diferencial global, no local: tiene que poder competir en cualquier país. El orden de mercados es Uruguay como laboratorio unos meses, Brasil en el primer año y después EE.UU., Europa o Australia. Eso pesa en canales, pagos (Mercado Pago, Pix, Stripe) e idiomas (español y portugués de entrada, inglés después).
- **Cada dato de mercado, precio, límite o política de terceros** (Meta, Telegram, Anthropic, competidores) se investiga en la fuente oficial y se anota con link y fecha. Quiero lo más reciente: si un dato tiene más de unos meses, buscá si cambió.
- Nunca inventes estadísticas, ni en los documentos ni en el producto. Si el producto le muestra un número a un cliente, sale de los datos del propio cliente o de una fuente citada. Si no, se presenta como hipótesis.
- Regla de oro de siempre: nunca imprimas un secreto. Siguen viviendo en `~/.walt/.env`.
- No uses la marca OrderEAT en nada de Walt.
- Primero el plan (sección 9) y después la ejecución. No esperes mi respuesta para arrancar el release 1: las decisiones que son mías (plata, legal, cuentas a mi nombre, credenciales) me las mandás juntas en una sola lista. Mientras tanto seguí con el default más simple y reversible, y anotalo.
- Para ejecutar, armá sesiones en paralelo con worktrees, como el kit de `dale/prompts` (00, 01, 02, 04, 90): un dueño por carpeta y la 90 integrando. Antes de decir que algo terminó: `pnpm typecheck`, `pnpm test` y `pnpm eval` en verde, y el eval no puede empeorar.

## 1. La taxonomía de pedidos está mal y es lo primero que se arregla

En la hackatón clasificamos mal. Casi todo lo que mostramos era un cambio simple:
- cambiar precios, también en lote;
- un aviso de «envío gratis» en el footer;
- un formulario de reservas de tortas.

Nada de eso debería pasar por la agencia ni estresar a nadie. Que un pedido toque código no lo vuelve delicado. Tampoco que cambie mucho un precio: «subí los panes a 95» tiene que ser un cambio directo, con vista previa y el «Dale» del cliente. La nueva taxonomía:

| Tipo | Qué es | Flujo |
|---|---|---|
| **Consulta** | Una pregunta sobre el software o el negocio | Walt responde con lo que sabe del proyecto |
| **Cambio simple** | Todo lo visible o de interfaz que no toca zonas delicadas: textos, precios, horarios, imágenes, colores, secciones, avisos, páginas o formularios nuevos que solo muestran o mandan datos, componentes de UI. Puede ser contenido (ops tipadas) o código de frontend (PR) | Vista previa, «Dale» del cliente y se publica. **Sin la agencia** |
| **Cambio delicado** | Toca la base de datos (esquema, migraciones, datos), autenticación o permisos, backend o API, pagos existentes, secretos o variables de entorno, infraestructura o CI, dependencias, borrado de datos | El agente arma el PR, la agencia revisa el diff en el panel y aprueba, el cliente ve la vista previa y publica |
| **Algo nuevo** | Un workflow agéntico nuevo desde cero, integrar una pasarela de pagos, integraciones con terceros que piden credenciales o contratos, módulos grandes | Presupuesto con alcance, plazo y precio. El cliente acepta y paga la seña con un link, y pasa a la agencia o al agente bajo revisión |
| **Bloqueado** | Inyección, pedidos maliciosos o fuera de política | No se aplica nada y se avisa |

Reglas del diseño:
- **Si el pedido es ambiguo, se le pregunta al cliente con opciones, nunca se escala a la agencia.** En vez de frenar «subí los panes a 95», mostrá la vista previa con todos los panes y una advertencia visible del tipo «la masa madre baja de $220 a $95», con [Dale] y [No era eso]. El límite de cambio de precio (`maxPriceChangePct`) pasa a ser una advertencia en la vista previa, no una derivación.
- **Doble clasificación.**
  1. Antes de actuar, la IA clasifica por intención.
  2. Después, el código verifica el diff real de forma determinística: rutas tocadas, migraciones, `.env`, `package.json` y otros manifiestos, archivos de auth, lo que la agencia marque como protegido.
  3. Si el diff toca una zona delicada, el pedido sube a delicado solo. Nunca baja solo.
- **Lo define la agencia o el freelancer, por proyecto.** En el panel, en la pantalla Reglas, se carga:
  - una política en lenguaje natural que entra al prompt del agente de decisión, del tipo «si toca esto es simple, si toca esto es delicado, si piden esto es algo nuevo»;
  - reglas estructuradas: globs de rutas delicadas, protegidas y simples, tipos de pedido que siempre son «algo nuevo», umbrales;
  - plantillas por stack para arrancar (Next.js con Supabase, WordPress, Shopify, Tiendanube, etc.);
  - versiones de las reglas, que ya existen, y un **simulador**: pegás un pedido y ves cómo lo clasificaría y por qué.
- **Lo que cambia en el código actual.**
  - Hoy en `decide.ts` el carril de código es `riesgoso` por definición; eso se va.
  - `DEFAULT_RULES` pasa `set_banner` y `toggle_section` a `auto`.
  - Las categorías internas se renombran a la taxonomía nueva, con migración de datos.
- **Eval nuevo.** Los casos de la hackatón con la etiqueta correcta, más casos delicados (migración, endpoint, login) y nuevos (pasarela de pagos, workflow agéntico), en español y portugués. El eval tiene que medir el error caro aparte: algo delicado que pasó como simple.

## 2. Datos y aprendizaje: que el sistema mejore con cada agencia

- **Reetiquetar.** En el panel, en cada pedido: «¿Estuvo bien clasificado?». La agencia lo cambia de tipo, por ejemplo de simple a delicado o al revés, con un motivo opcional. Esa es la señal más valiosa del producto.
- **Señales a guardar:**
  - el «No era eso» del cliente;
  - las reversiones;
  - los rechazos de la agencia;
  - cuánto edita la agencia el PR del agente;
  - el tiempo hasta publicar y el costo por pedido.
- **Uso de esos datos:**
  - Los ejemplos reetiquetados de cada agencia entran como ejemplos al prompt de decisión, recuperados por similitud con pgvector.
  - Walt propone cambios de reglas, por ejemplo: «Marcaste 3 pedidos que tocaban `app/api/**` como delicados. ¿Lo agrego a las reglas?».
  - Con consentimiento, los casos anonimizados alimentan el eval global.
- **Métricas por agencia, visibles en el panel:**
  - precisión de la clasificación;
  - aprobados al primer intento;
  - tasa de «No era eso»;
  - tiempo hasta publicar;
  - costo por pedido;
  - escalamientos.
- **Privacidad desde el diseño:**
  - aislamiento por agencia con RLS;
  - consentimiento en los términos;
  - redacción de datos personales antes de guardar ejemplos;
  - política de retención y borrado a pedido;
  - DPA para agencias;
  - cumplimiento de la Ley 18.331 de Uruguay, de la LGPD si entra Brasil y del GDPR si hay clientes en Europa.
  - Los datos de una agencia nunca alimentan a otra salvo agregados y con permiso.

## 3. Canales: WhatsApp, Telegram y un agente por proyecto

Investigá y decidí con datos fechados.

- **WhatsApp Business Platform:**
  - Cloud API directo de Meta frente a un proveedor como Kapso. Lo uso en otro trabajo: es WhatsApp, con una conexión dedicada y un link de configuración por número.
  - Embedded Signup y Tech Provider, para que cada agencia conecte su propio número con su marca, frente a números que pone Walt.
  - Verificación del negocio: requisitos y tiempos, límites de números, tiers de mensajes y aprobación del nombre visible.
  - Precios por mensaje según la categoría (marketing, utilidad, servicio) y la ventana de 24 h.
  - Plantillas y opt-in, obligatorios para los mensajes proactivos de la sección 5.
  - Botones interactivos, audios y webhooks de estado.
- **Telegram:**
  - Un bot por agencia, con su token de BotFather y su marca, o un bot de Walt con links profundos por proyecto.
  - Costo cero y alta instantánea.
  - El costo real es que en LatAm el cliente final vive en WhatsApp. Buscá datos de adopción por país (Uruguay, Argentina, Brasil, México) para medir cuánto interés perdemos.
- **Lo que espero:**
  - El núcleo agnóstico del canal; ya existe `apps/worker/src/channel`.
  - Telegram para la beta privada ya mismo, WhatsApp para la venta general y el costo de WhatsApp metido en el precio.
  - Decime si con Telegram solo alcanza para cerrar las primeras agencias, o si nos come la venta.
- **Un agente por proyecto:**
  - Cada proyecto tiene su asistente: nombre, avatar y tono de la agencia, sus reglas, su conocimiento, sus conectores, su modo de IA y su presupuesto.
  - Ruteo: el teléfono o el chat del cliente lleva al cliente y de ahí a sus proyectos. Si tiene varios, se desambigua.
  - El vínculo se hace con links de invitación (`t.me/<bot>?start=<token>`, `wa.me/<número>?text=<código>`) y la agencia puede reasignar desde el panel.

## 4. Cómo se paga la IA: tres modos a elección de la agencia

1. **Clave propia (BYOK).**
   - La API key de Anthropic de la agencia, por agencia o por proyecto, cifrada en reposo con Supabase Vault o un KMS.
   - Se valida al cargarla, nunca se loguea, y tiene topes y alertas de gasto.
2. **La sesión de Claude de la agencia en el proyecto.**
   - Antes de construir nada, verificá en los términos vigentes de Anthropic qué está permitido. Mis notas dicen que desde el 2026-02-19 está prohibido pedirle a la agencia el login de su suscripción para un producto de terceros.
   - Solo ofrecemos lo que cumpla. Por ejemplo: la agencia corre Claude Code en su compu o en su CI, y Walt le pasa las tareas como canal o MCP sin tener nunca su token. Dejá la decisión documentada con links.
3. **Créditos prepagos en Walt.**
   - Billetera por agencia, recargas con Stripe y Mercado Pago, y recarga automática opcional.
   - Medición por pedido (tokens por precio más margen), presupuestos por proyecto y alertas de saldo bajo.
   - La agencia puede trasladarle el costo a sus clientes.

En los tres modos van ruteo de modelos (uno barato para clasificar y uno fuerte para código), caché de prompts y el costo por pedido a la vista en el panel. El onboarding pregunta «¿Cómo querés pagar la IA?», con la opción de cambiarlo por proyecto.

## 5. Negocio: más plata para nosotros porque hacemos ganar más plata a la agencia y a su cliente

- **Modelo de precios.**
  - Plan por agencia (proyectos, clientes, asientos) y uso de los cambios de código o delicados.
  - Comisión sobre lo que se vende por Walt: presupuestos y oportunidades.
  - Costo de WhatsApp trasladado o con cupo incluido.
  - Documento de unit economics: costo por pedido (IA, canal, infraestructura), margen bruto objetivo y supuestos de CAC y repago marcados como hipótesis.
  - Benchmark de precios de competidores, fechado.
- **Inteligencia comercial, la feature estrella.** Un motor de oportunidades proactivas por proyecto.
  - **Señales:**
    - el calendario comercial de cada país: Black Friday, Cyber Monday, Hot Sale, el Día de la Madre (cambia según el país) y Navidad;
    - el estado del software: contenido viejo, links rotos, páginas lentas, stock y precios;
    - analytics, si está conectado.
  - **Cada oportunidad trae:**
    - qué hacer y por qué, con evidencia de los datos del cliente o de una fuente citada;
    - una vista previa del cambio ya armado;
    - el precio que fijó la agencia;
    - un link de pago.
  - **Un ejemplo:** «Se viene el Black Friday y no tenés ninguna promoción. Te armé estas tres. Dame el OK y las publicamos por USD 15». Ese número del 15% que se dice por ahí no se usa sin fuente.
  - **Quién gana:** el cliente aprueba con un toque y gana ventas, la agencia cobra sin estar encima, y Walt se lleva una parte.
  - **Lo que controla la agencia:**
    - qué tipos de oportunidad se mandan;
    - un tope de frecuencia, sin spam;
    - si se mandan solas o pasan antes por ella;
    - su lista de precios.
  - En WhatsApp, fuera de la ventana de 24 h, va con plantillas aprobadas y opt-in.
- **Más valor para evaluar.** Evaluá estas ideas y proponé otras más valiosas. Ordená por cuánta plata le generan a la agencia y a su cliente contra el esfuerzo, y elegí cuáles van a piloto:
  1. Monitoreo y arreglo: caída, errores, formularios o checkout rotos, con alerta, diagnóstico y PR de arreglo. A la agencia le llega «incidente resuelto».
  2. Un reporte mensual automático para el cliente final, con los cambios hechos, el tiempo ahorrado y los resultados si hay datos. Justifica lo que cobra la agencia y baja la cancelación.
  3. Control de alcance y cobro: cupo de cambios por plan del cliente, cobro automático de extras y presupuestos con seña.
  4. Un gerente de cuenta para la agencia: clientes en riesgo, oportunidades de upsell y el estado de la cartera.
  5. Conectores sin repo (Shopify, Tiendanube, WordPress/WooCommerce, Wix, Webflow), para atender clientes que no tienen código propio. Agranda mucho el mercado.
  6. Consultas respondidas con la base de conocimiento de cada cliente, y escalamiento con diagnóstico.
  7. Mejoras de conversión y pruebas A/B propuestas por Walt.

## 6. Producción: la lista de los 111

Esta es la lista típica de lo que un producto en producción tiene que tener resuelto. Armá `docs/PRODUCCION-CHECKLIST.md` con una tabla: número, concepto, si aplica a Walt (sí, no o parcial), cómo lo resolvemos, estado y release. No todo aplica; lo que no aplica se justifica en una línea.

1 Rate Limiting · 2 Caching · 3 Load Balancing · 4 Reverse Proxies · 5 API Gateways · 6 CI/CD · 7 Docker · 8 Kubernetes · 9 Service Discovery · 10 Circuit Breakers · 11 Timeouts · 12 Retries · 13 Exponential Backoff · 14 Idempotency · 15 Message Queues · 16 Pub/Sub · 17 Event-Driven Architecture · 18 Distributed Transactions · 19 Saga Pattern · 20 Dead Letter Queues · 21 Cron Jobs · 22 WebSockets · 23 Long Polling · 24 Server-Sent Events · 25 Database Indexing · 26 Query Optimization · 27 N+1 Queries · 28 Connection Pooling · 29 Read Replicas · 30 Sharding · 31 Partitioning · 32 Replication · 33 Leader Election · 34 CAP Theorem · 35 Eventual Consistency · 36 Optimistic Locking · 37 Pessimistic Locking · 38 Distributed Locks · 39 Race Conditions · 40 Deadlocks · 41 Memory Leaks · 42 Garbage Collection · 43 Thread Safety · 44 Backpressure · 45 Autoscaling · 46 Horizontal Scaling · 47 Vertical Scaling · 48 CDN · 49 Edge Caching · 50 Cache Invalidation · 51 Feature Flags · 52 Blue-Green Deployment · 53 Canary Releases · 54 Rolling Deployments · 55 Rollbacks · 56 Health Checks · 57 Liveness & Readiness Probes · 58 Monitoring · 59 Logging · 60 Distributed Tracing · 61 Metrics · 62 Alerts · 63 SLOs · 64 SLIs · 65 Error Budgets · 66 Observability · 67 Secrets Management · 68 IAM · 69 OAuth · 70 JWT Rotation · 71 TLS · 72 Encryption at Rest · 73 Encryption in Transit · 74 WAF · 75 DDoS Protection · 76 CORS · 77 CSRF · 78 SQL Injection · 79 XSS · 80 SSRF · 81 Database Migrations · 82 Schema Versioning · 83 Disaster Recovery · 84 Backups · 85 Failover · 86 Multi-Region Deployment · 87 Chaos Engineering · 88 Cost Optimization · 89 Cold Starts · 90 Serverless Limits · 91 Latency · 92 Throughput · 93 P99 Latency · 94 Tail Latency · 95 Network Partitions · 96 Clock Skew · 97 DNS · 98 TCP vs UDP · 99 HTTP/2 & HTTP/3 · 100 gRPC · 101 Webhooks · 102 API Versioning · 103 Semantic Versioning · 104 Infrastructure as Code · 105 Terraform · 106 Helm Charts · 107 Build Caching · 108 Dependency Hell · 109 Production Incidents · 110 On-Call · 111 Postmortems

Lo que para Walt es crítico sí o sí:
- **Idempotencia y colas.**
  - Los updates de Telegram y los webhooks de WhatsApp llegan repetidos: deduplicar y publicar de forma idempotente.
  - Pasar la cola en memoria (`apps/worker/src/queue.ts`) a una cola durable, con reintentos, backoff exponencial y dead letter queue.
  - Un cambio a la vez por proyecto, con un lock distribuido (advisory lock de Postgres) y locking optimista en las versiones de contenido.
- **Timeouts, circuit breakers y rate limiting** contra el modelo, GitHub, Vercel y WhatsApp.
  - Rate limiting también por cliente y por agencia, por abuso y por costo.
  - Manejo de los 429 de cada proveedor.
- **Despliegue.**
  - El worker hoy corre en mi compu (`scripts/run-worker.sh`). Va a un host gestionado, con health checks, liveness y readiness, staging, despliegue sin cortes y rollback.
  - Ojo con los límites de serverless: una corrida del agente de código dura más de lo que aguanta una función; va en un worker o en un sandbox.
- **Seguridad multi-tenant.**
  - RLS de Supabase por agencia y roles (dueño, admin, miembro; agencia frente a cliente).
  - Una GitHub App por agencia en lugar de mi token personal, y secretos cifrados.
  - Rotación de JWT, CORS y CSRF en el panel, y XSS al mostrar mensajes de clientes.
  - SSRF en las capturas y en todo lo que el agente pida por la red.
  - Prompt injection: el mensaje del cliente siempre es entrada no confiable. El sandbox del agente sale a la red solo por lo necesario y no ve secretos.
  - WAF, DDoS y log de auditoría.
- **Datos.**
  - Hoy las migraciones se pegan a mano en el SQL Editor. Pasan a la CLI de Supabase en el CI, con versionado de esquema.
  - Backups con PITR, plan de recuperación ante desastres y retención.
- **Observabilidad.**
  - Logs estructurados con id de pedido y trazas de punta a punta: canal, worker, modelo, GitHub, deploy y canal de vuelta.
  - Métricas, alertas, SLOs y SLIs (por ejemplo, p95 del tiempo hasta la vista previa y disponibilidad) y presupuesto de error.
  - Página de estado, guardia, y plantillas de incidente y postmortem.
- **CI/CD.**
  - Activar GitHub Actions. Hoy el token no tiene scope `workflow`: si hace falta uno nuevo, ponelo en mi lista.
  - Typecheck, tests y eval en cada PR, entornos de vista previa, feature flags y canary.

Elegí cada herramienta con su versión y la fecha de la fuente. Lo más simple que aguante 100 agencias con 20 clientes cada una gana sobre lo más sofisticado.

## 7. Venta de punta a punta, en autoservicio

El recorrido completo, sin que intervengamos:
1. La landing.
2. El registro y la cuenta de la agencia.
3. El plan y la facturación, con prueba gratis, Stripe y Mercado Pago.
4. El asistente de onboarding:
   - conectar la GitHub App y los repos;
   - el hosting para las vistas previas (Vercel, Netlify);
   - el canal (token del bot de Telegram o Embedded Signup de WhatsApp);
   - el modo de IA;
   - la plantilla de reglas del stack;
   - la marca;
   - invitar clientes con un link o un QR.
5. **El primer cambio publicado en menos de 15 minutos.**

Va también:
- términos, privacidad, DPA y política de uso aceptable;
- documentación, soporte y página de estado;
- analítica del embudo.

La factura electrónica de Uruguay (DGI) queda anotada para cuando haya cobros reales.

## 8. Lo que ya existe y no hay que romper

- La demo sigue andando con el modelo real.
- Panel en https://walt-panel.vercel.app, sitio demo en https://walt-demo.vercel.app y bot @wal101_bot.
- Siempre hay vista previa para el cliente, y lo delicado lo aprueba la agencia desde el panel, con el diff a la vista. Commit 5cf2d37.
- Los comandos de `CLAUDE.md` siguen funcionando: `pnpm dry-run`, `pnpm e2e`, `pnpm eval`.

## 9. Entregables

1. **Primero, `docs/PRODUCCION.md`, con:**
   - la auditoría del estado actual contra este brief;
   - la arquitectura objetivo;
   - las decisiones, como ADRs cortos en `docs/DECISIONES.md`;
   - los releases con criterios de aceptación medibles;
   - riesgos y costos mensuales estimados;
   - la lista **«Decisiones para Salva»**, todo junto y con tu recomendación en cada punto.

   Como base para los releases:
   - **R1**, beta privada con 3 a 5 agencias por Telegram: taxonomía nueva, reglas configurables, simulador, reetiquetado, cola durable, worker desplegado, multi-tenant con RLS, GitHub App y los modos de IA.
   - **R2**: WhatsApp, cobros y onboarding en autoservicio.
   - **R3**: inteligencia comercial y reportes al cliente final.
   - **R4**: conectores sin repo y escala.
2. `docs/PRODUCCION-CHECKLIST.md`, con los 111.
3. `docs/NEGOCIO.md`: precios, unit economics, competidores y la priorización de las features de valor, con fuentes.
4. **R1 implementado de punta a punta**, con pruebas, eval actualizado, `docs/ESTADO.md` al día y una demo nueva en `docs/DEMO.md`. El caso de la demo es un cambio simple que se publica solo, otro delicado que pasa por la agencia, otro de algo nuevo que termina en presupuesto con link de pago y una reetiqueta que cambia la próxima decisión.
5. **Un reporte final** con:
   - qué quedó hecho, con commits y PRs;
   - qué falta;
   - cuánto se gastó en IA y servicios;
   - qué necesitás de mí.
