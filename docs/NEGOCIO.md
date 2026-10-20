# Walt: negocio

Fecha: 2026-10-20. Sesión "plan", rama `r1-plan`. Responde a la sección 9, punto 3, de `docs/BRIEF-PRODUCCION.md` (y a sus secciones 3, 4 y 5). Cada dato de un tercero lleva link a la fuente oficial y fecha (lista completa en "Fuentes"); lo que no tiene fuente es **hipótesis** y está marcado así. Precios en USD salvo que se diga otra cosa.

## 0. En una página

- **Precio (propuesta, §1):** plan por agencia según proyectos activos: Freelancer USD 29 (3 proyectos), Agencia USD 99 (10) y Estudio USD 249 (30), con cambios de contenido sin límite, un cupo de cambios de código y USD 1 por cada extra, WhatsApp incluido desde Agencia, y comisión del 5% sobre lo que la agencia cobra por Walt y del 10% sobre las oportunidades que trae Walt. Queda entre Atarim (USD 67), Duda Agency (USD 52 a 69) y GoHighLevel (USD 97 a 497).
- **Unit economics (§2):** medido, la IA cuesta USD 0,0053 por interpretación y unos USD 0,05 por cambio de código; el pedido completo, unos USD 0,03 con Telegram y USD 0,06 con WhatsApp. Margen bruto de 79% a 87% según el plan (hipótesis, con 6,5% de procesador de pagos). CAC (USD 150 a 500) y repago (1 a 6 meses) son hipótesis.
- **Competencia (§3):** nadie junta lo de Walt. Los más cercanos venden a agencias por email o panel (Atarim, GoWP AI Editor) o venden directo a la pyme por WhatsApp o Telegram a USD 20 a 25 por mes (nanogent, autoSite).
- **Canales (§4):** WhatsApp con Kapso al arrancar el R2, con un número por agencia (desde el 2026-10-01 Meta cobra los mensajes de servicio desde el 1.001 de cada número por mes); Telegram para la beta, con Managed Bots para el bot propio de cada agencia en el R2. WhatsApp completo cuesta entre USD 6 y 9 por agencia por mes.
- **IA (§5):** BYOK y créditos de Walt cumplen; el login o el token de la suscripción no. "Usar la suscripción" de forma legal es cargar como BYOK una API key pagada con los créditos de API de Max o Team (desde el 2026-10-07). El agente de código usa la credencial de la agencia hasta que Anthropic confirme por escrito que Walt puede pagarlo.
- **Cobros:** SAS digital en Uruguay; Mercado Pago en Uruguay y Paddle en Brasil; Stripe recién con una entidad de EE.UU., porque no admite Uruguay.
- **Pilotos (§7):** control de alcance y cobro, resumen semanal para la agencia, reporte mensual al cliente final y un motor de oportunidades acotado (feriados y calendario comercial).

---

## 1. Modelo de precios (propuesta para aprobar)

Lo que cobra Walt, en cuatro piezas, como pide el brief: plan por agencia, uso del carril de código, comisión sobre lo que se vende por Walt y WhatsApp metido en el precio. Todos los números son **hipótesis** a validar en la beta; el benchmark que los justifica está en §3.

| Plan | Precio mensual (anual, −2 meses) | Proyectos activos incluidos | Proyecto extra | Asientos | Cambios de código incluidos por mes | WhatsApp |
|---|---|---|---|---|---|---|
| **Freelancer** | 29 (24) | 3 | 10 | 1 | 15 | Telegram incluido; WhatsApp +15 por número |
| **Agencia** | 99 (82) | 10 | 8 | 5 | 60 | 1 número incluido |
| **Estudio** | 249 (207) | 30 | 6 | 15 | 200 | 3 números incluidos |

- **Cambios de contenido y consultas:** sin límite, con uso razonable. Cuestan medio centavo de IA (§2) y son lo que la agencia más quiere regalarle al cliente.
- **Cambio de código o delicado fuera del cupo:** USD 1 cada uno. El mercado cobra la edición con IA a unos USD 3 (GoWP, USD 30 cada 10) y el costo de Walt es de unos USD 0,05 (§2).
- **IA:** incluida para contenido, consultas y presupuestos. El agente de código usa la clave de la agencia hasta que Anthropic confirme que Walt puede pagarlo (§5); con BYOK, la agencia le paga los tokens a Anthropic y Walt solo cobra el plan y los extras.
- **Billetera (créditos de Walt):** saldo prepago para todo lo medido: cambios de código extra, plantillas de WhatsApp (tarifa de Meta al costo) y, si se habilita, IA por encima del uso razonable a costo más 30% (el margen provisorio de 0004). Recarga con Stripe o Mercado Pago y recarga automática opcional (R2).
- **Comisión:** 5% sobre lo que la agencia cobra por Walt a sus propios clientes (extras fuera de cupo, presupuestos, señas) y 10% sobre las oportunidades que origina Walt (R3), además del costo del procesador. Está entre el 0% de ManyRequests y el 7% de 10Web para lo propio, y entre el 0–15% de Upwork y el 15% de la App Store de Shopify para lo que trae la plataforma.
- **Prueba:** 14 días gratis sin tarjeta. **Beta (R1):** gratis 3 meses para 3 a 5 agencias, a cambio de feedback y del consentimiento para usar pedidos anonimizados en el eval (solo de Telegram, §4.3).
- **Por qué por proyecto y no por asiento:** el valor lo cobra la agencia por cliente (un plan de mantenimiento de USD 50 a 150 por mes, §3.3); a USD 6–10 por proyecto, Walt queda en una fracción de eso y le deja margen para revender. Los competidores directos cobran por sitio (GoWP) o por créditos (Atarim).
- **Monedas y cobro:** precios en USD; en Uruguay, Mercado Pago; en Brasil, Paddle en BRL con Pix; Stripe recién con una entidad de EE.UU., porque no admite empresas de Uruguay (ADR-P11, `docs/PRODUCCION.md` §8).

---

## 2. Unit economics

### 2.1 Costo de IA por pedido, medido

Datos propios, con el modelo real (`claude-sonnet-5-5`). Los costos del reporte los calcula `packages/core/src/pricing.ts`, que todavía cobra la lectura de caché de Sonnet 5.5 a USD 0,20 por millón; el precio oficial bajó a USD 0,10 el 2026-10-07 [A-PRICE], así que con los mismos tokens la interpretación cuesta **USD 0,0053**, no 0,0059:

| Qué | Costo medido | Fuente interna | Notas |
|---|---|---|---|
| Interpretar un pedido (cualquier tipo) | USD 0,00585 en promedio con la tabla vieja (**USD 0,0053** con el precio vigente); p50 0,00566; máximo 0,0201 | `eval/report.json`, 30 casos sintéticos, 2026-10-18 | 29 llamadas: 32.443 tokens de entrada sin caché, 5.983 de salida, 175.728 leídos de caché y 6.276 escritos en caché. El 82% de la entrada sale de la caché |
| Interpretar una inyección | USD 0,0053 en promedio | Mismo reporte, 10 casos | — |
| Cambio de código con el agente (Sonnet 5.5) | **USD 0,033** | `docs/VELOCIDAD.md` (c), 4 turnos | Una sola medición |
| Cambio de código con el agente (Opus 5.5, reintento) | USD 0,082 | `docs/VELOCIDAD.md` (c), 6 turnos | Una sola medición; hoy Opus solo entra si Sonnet falla |
| Responder una consulta | sin medir | — | **Hipótesis:** del orden de una interpretación (lleva el mismo inventario) |
| Borrador de presupuesto | sin medir | — | **Hipótesis:** del orden de una interpretación |

Con esos números, un pedido simple de contenido cuesta medio centavo de dólar de IA, y uno de código, unos 5 centavos (interpretación más agente, con un 15% de reintentos en Opus: hipótesis). La palanca más grande es el ruteo: con `claude-haiku-5-5` (USD 0,10 y 0,50 por millón de tokens de entrada y salida, contra 2 y 10 de Sonnet 5.5 [A-PRICE]) la misma mezcla de tokens costaría unos USD 0,0003 por interpretación; si clasifica igual de bien es un tema a medir en el eval (R1.19), no a suponer.

### 2.2 Costo completo por pedido

Con los supuestos de `docs/PRODUCCION.md` §5 (100 agencias × 20 clientes, 10 pedidos por cliente y mes, 20.000 pedidos):

| Componente | Telegram (R1) | WhatsApp con Kapso (R2) | Cuenta |
|---|---|---|---|
| IA (promedio de todos los pedidos) | USD 0,016 | USD 0,016 | USD 317 ÷ 20.000 |
| Canal | 0 | USD 0,030 | Kapso USD 549 + Meta USD 45, ÷ 20.000 (§4) |
| Infraestructura fija | USD 0,012 | USD 0,014 | USD 246 (más USD 29 de Sandbox en R2) ÷ 20.000 |
| **Total por pedido** | **USD 0,028** | **USD 0,059** | |

### 2.3 Margen por plan

Supuestos (**hipótesis**): 10 pedidos por cliente y mes, 20% de código, infraestructura repartida en partes iguales entre 100 agencias (USD 2,75 cada una), procesador de pagos 6,5% del ingreso (entre Paddle, 5% + USD 0,50, y Mercado Pago en Uruguay, 5,99% + IVA ≈ 7,3% al instante o 4,99% + IVA ≈ 6,1% a 21 días [PAY]), IA pagada por Walt (el peor caso: con BYOK baja el costo).

| Caso | Ingreso | IA | WhatsApp | Infra | Cobro | Costo total | Margen bruto |
|---|---|---|---|---|---|---|---|
| Freelancer con 5 proyectos, sin WhatsApp | 49 | 0,79 | 0 | 2,75 | 3,19 | 6,73 | 86% |
| Freelancer con 5 proyectos y WhatsApp (+15) | 64 | 0,79 | 5,60 | 2,75 | 4,16 | 13,30 | 79% |
| Agencia con 10 proyectos | 99 | 1,58 | 5,71 | 2,75 | 6,44 | 16,48 | 83% |
| Agencia con 20 proyectos | 179 | 3,17 | 5,94 | 2,75 | 11,64 | 23,50 | 87% |
| Estudio con 40 proyectos | 309 | 6,34 | 17,37 | 2,75 | 20,09 | 46,55 | 85% |

**Margen bruto objetivo: 80% o más en todos los planes.** Lo que más lo aprieta es el cargo por número de WhatsApp en los planes chicos (Freelancer con WhatsApp queda en 79%) y la comisión del procesador; por eso WhatsApp es un adicional de USD 15 en Freelancer.

### 2.4 CAC y repago (todo hipótesis)

- **Canal de venta del primer año:** el fundador vende en Uruguay (demos uno a uno, referidos, comunidades de agencias) y después en Brasil. **Hipótesis de CAC:** USD 150 a 500 por agencia, entre horas de venta, eventos y algo de publicidad. No hay dato propio todavía.
- **Repago** = CAC ÷ (ingreso mensual × margen bruto): entre 1 mes (CAC 150, Agencia con 20 proyectos) y 6 meses (CAC 500, Agencia con 10). **Objetivo:** menos de 6 meses.
- **Retención (hipótesis):** 3% de bajas por mes, o sea unos 33 meses de vida; con eso, una Agencia de 20 proyectos deja unos USD 5.000 de margen en su vida. La beta mide la baja real.
- **Comisiones:** si cada cliente final paga por Walt USD 20 por mes en extras u oportunidades (**hipótesis**), el 5% suma USD 1 por cliente, unos USD 20 por agencia por mes: hasta un 11% más de ingreso sin costo extra de IA.
- **Qué mirar en la beta para reemplazar hipótesis por datos:** pedidos por cliente y mes, mezcla de tipos, costo real por pedido (ya se mide), horas de la agencia ahorradas (con su propio valor por cambio), cambios fuera de cupo que la agencia cobra, y cuántos clientes finales usan el canal.

---

## 3. Competidores y sustitutos: benchmark de precios al 2026-10-20

Precios en USD por mes salvo aclaración, de las páginas oficiales; "consultado" quiere decir que la página no muestra fecha y se leyó el 2026-10-20. La tabla completa con todos los links está en "Fuentes" ([COMP]).

### 3.1 Competidores directos (alguien pide un cambio y una IA lo prepara o lo publica)

| Producto | A quién le vende | Precio | Canal | Qué tiene y qué le falta frente a Walt | Fecha |
|---|---|---|---|---|---|
| **Atarim** | Agencias, marca blanca incluida | Free; Pro 67 (−20% anual); Enterprise a medida | Email del cliente → tarea, panel, comentarios en el sitio; centrado en WordPress | El más parecido en comprador y modelo (créditos, aprobación antes de publicar). No entra por WhatsApp o Telegram, no tiene carril de código con PR ni presupuesto con cobro | publicada 2026-06-13 |
| **GoWP AI Editor** | Agencias de WordPress | Free; Pro 39 y Business 99 **por sitio**; 10 ediciones de IA extra: 30; marca blanca 49 aparte | Chat en el panel, mesa de ayuda | Vista previa privada, publicar y deshacer, cobro por edición aprobada (unos 3 por edición extra). Solo WordPress, sin mensajería | consultado |
| nanogent.ai | Directo a la pyme | Agente 25 + armado del sitio 6.000 (oferta) | Telegram, WhatsApp | La experiencia más parecida (vista previa, deploy, undo, deriva lo complejo), pero reemplaza a la agencia | consultado |
| autoSite | Directo a la pyme | Desde 20 | Telegram, WhatsApp | Vista previa en copia de prueba y publicar con "OK"; lanzado en septiembre de 2026 | 2026-09-10 (listado) |
| Macaly | Pyme y agencias | Free, 10, 25; Agency 350 (5 workspaces) | WhatsApp, web | Generador de sitios con agente en WhatsApp; no es un canal del cliente final de una agencia | consultado |
| Otros chicos | Pyme | 0 a 20, o sin precio público | Telegram o WhatsApp | ChilledSites, bot2site, AI Site Biz, WebAssist, Kora, DigitalMirror (servicio en Italia) | consultado |

No apareció ninguno que junte lo de Walt: mensajería del cliente final con la marca de la agencia, reglas fijas en código que deciden, carril de código con PR y diff para la agencia, y presupuesto con link de pago. La idea sí circula: una agencia publicó el 2026-10-05 cómo armar un agente que edita el sitio por WhatsApp o Telegram con borrador, vista previa y aprobación [COMP]. La ventaja es de ejecución, no de concepto.

### 3.2 Sustitutos y vecinos

| Grupo | Ejemplos y precios | Por qué importa |
|---|---|---|
| Plataformas para agencias | Duda: Agency 52 anual o 69 mensual (4 sitios), White Label 149/199, sitio extra 17. GoHighLevel: 97, 297 y 497; WhatsApp 10 por subcuenta más tarifas; AI Employee 50 o 97 por subcuenta. Webflow: workspace Freelancer 16/24 y Agency 35/42 más el plan de cada sitio. Wix Studio: 12 a 149 por sitio (anual). Framer: 10 y 30. 10Web: Agency 42,5 y 80 (7% de lo que factura la agencia en Core) | Fijan lo que una agencia ya paga por herramienta: entre 35 y 300 por mes |
| Agentes de código y creadores con IA | Lovable 25 y 50; Bolt 18 anual; v0 30 y 100 por usuario; Replit 20 y 100; Devin 20 y 200 (Teams desde 80); GitHub Copilot 10 a 100 (agente incluido, créditos desde el 2026-06-01); Cursor dentro de "The X Subscription" desde el 2026-10-12; Builder.io Fusion 24 y 40 por usuario | El agente de código ya es un commodity barato para el equipo; lo que no tienen es el canal del cliente final, las reglas de la agencia y el cobro |
| Herramientas de pedidos | ManyRequests 39 a 99 (portal, retainers, 0% por transacción); Marker.io 39 a 149 | Ordenan los pedidos, no los hacen |
| Mantenimiento tercerizado | GoWP 39 a 99 por sitio; FatLab 99 a 599 (agencias: 59 a 79 por sitio); WP Buffs 89 a 359 por sitio; WP SitePlan 59 a 229 por sitio | Es lo que Walt reemplaza en parte: el costo mayorista por sitio para una agencia |

### 3.3 Cuánto cobran las agencias por mantenimiento y cuánto se lleva una plataforma

- **Planes de mantenimiento:** una revisión informal de más de 100 páginas de planes de EE.UU. (The Admin Bar, actualizada 2026-03-13) encontró casi nada por debajo de USD 75 y la mayoría entre USD 100 y 150 por mes; en el Reino Unido, 18 listas públicas dan una mediana de £50 para el plan de entrada (Whito, verificada 2026-10-19). En Uruguay no hay encuesta; Clutch muestra que 24 de 40 agencias declaran entre USD 25 y 49 por hora (2026-10-20). Son referencias, no promedios del mercado.
- **Comisiones de referencia:** Upwork 0–15% al freelancer y 5–10% al cliente; Fiverr 20% al vendedor; Workana 20% que baja a 5% con el volumen; Codeable 17,5%; Shopify App Store 0% hasta el primer millón y 15% después; 10Web 7% de lo que factura la agencia; ManyRequests y Contra Pro 0% [COMP].

---

## 4. Canales: WhatsApp, Telegram y cuánto cuesta cada uno

### 4.1 WhatsApp Business Platform: lo que importa para Walt

Fuente principal: documentación de Meta para desarrolladores [WA-PRICE] y términos de la plataforma ("Last Modified: September 23, 2026") [WA-TERMS]; casi ninguna página muestra fecha, se consultaron el 2026-10-20.

| Tema | Dato vigente | Qué significa para Walt |
|---|---|---|
| Modelo de cobro | Por mensaje entregado, según categoría (marketing, utility, authentication, service) y país del destinatario, desde el 2025-07-01. Lo que manda el usuario no se cobra | Los pedidos de los clientes no cuestan; cuestan las respuestas que pasen el cupo y las plantillas |
| **Cambio del 2026-10-01** | Los mensajes service (texto libre dentro de la ventana de 24 h) se cobran desde el mensaje 1.001 de cada número por mes, a la misma tarifa que utility; y las plantillas utility se cobran aunque la ventana esté abierta | Un número por agencia (no uno de Walt para todas): cada número tiene su cupo de 1.000 service gratis. Los avisos ("¿Así?", "Listo, publicado") van como texto libre dentro de la ventana, no como plantilla |
| Tarifas en USD (marketing / utility = authentication = service) | Uruguay ("Rest of Latin America") 0,0740 / 0,0113 · Argentina 0,0618 / 0,0260 · Brasil 0,0625 / 0,0068 · México 0,0397 / 0,0085 · EE.UU. 0,0250 / 0,0034 · España 0,0707 / 0,0200 · Australia 0,0842 / 0,0113 [WA-CALC] | Una promoción en Uruguay cuesta unos 7 centavos; un aviso fuera de la ventana, 1 centavo |
| Marketing | No se entregan plantillas de marketing a números de EE.UU. desde el 2025-04-01; Cloud API deja de aceptar marketing el 2027-10-13 (las cuentas nuevas desde el 2027-04-13 ya no pueden): va por la Marketing Messages API, con el mismo cobro. Hay un límite dinámico de marketing por usuario según su interacción | Las oportunidades del R3 salen por la Marketing Messages API desde el diseño; para EE.UU. hace falta otro canal |
| Límites | Por portafolio: 250 usuarios únicos fuera de la ventana en 24 h al crear el portafolio, 2.000 al verificar el negocio, después 10.000, 100.000 e ilimitado; responder al cliente no tiene límite. 80 mensajes por segundo por defecto | Cada agencia verifica su negocio para pasar de 250 a 2.000 |
| Verificación del negocio | Documentos legales, dirección y web con HTTPS que coincidan con la entidad; "may take up to 14 business days" | Walt necesita entidad legal y dominio propios; los trámites arrancan en el R1 |
| Nombre visible | Se revisa al subir de límite; recién aprobado aparece arriba del chat. Si el nombre es de un negocio para el que trabaja una agencia, la relación tiene que constar en la web | La marca de la agencia se ve en el chat cuando su número está verificado |
| Embedded Signup y Tech Provider | Embedded Signup (v4) deja que el cliente conecte su propio número y portafolio desde el sitio del partner. Ser Tech Provider pide verificación del negocio y App Review (unas 24 h); "Tech Providers do not have credit lines", así que cada cliente paga a Meta con su tarjeta, salvo que un Solution Partner ponga su crédito (Multi-Partner Solution). Un partner nuevo da de alta hasta 10 clientes por semana (200 tras verificación y App Review) | Ser Tech Provider no resuelve el cobro: hace falta un BSP o que cada agencia cargue su tarjeta en Meta |
| Números de Walt para las agencias | El modelo "On-Behalf-Of" se dio de baja; los términos prohíben revender la plataforma y hablar "in the voice of another business" sin permiso | Cada agencia tiene su número en su portafolio; Walt no presta números propios |
| Plantillas y opt-in | Revisión "up to 24 hours"; 250 plantillas sin verificar y 6.000 verificado. Solo se escribe primero a quien dio su número y aceptó (el opt-in puede ser general, pero tiene que nombrar al negocio); hay que respetar cualquier baja; la automatización exige una salida clara a una persona | Opt-in registrado por cliente final, botón de baja, y "hablar con una persona" siempre disponible |
| Política de IA (§4.7 "AI Providers") | Desde el 2025-10-15 (el 2026-01-15 para los que ya estaban) se prohíbe usar la plataforma para ofrecer IA cuando es la funcionalidad principal, "rather than incidental or ancillary", a criterio de Meta | Walt es un servicio de cambios con IA como medio, parecido a la atención automatizada que la Comisión Europea da como uso permitido: con alta probabilidad entra (análisis, no dato). El asistente tiene que rechazar lo que no sea del sitio |
| **Datos para IA** | Los datos de la plataforma no se pueden usar para crear, entrenar o mejorar sistemas de aprendizaje automático, ni anonimizados; solo afinar un modelo para uso exclusivo propio | Los chats de WhatsApp **no** pueden ir al eval global ni a ejemplos entre agencias. Los ejemplos de una agencia para esa misma agencia son la zona más defendible; hay que confirmarlo con un abogado |
| Interactivos, audios, webhooks | Hasta 3 botones de respuesta (título de 20 caracteres) y listas de hasta 10 filas; notas de voz en OGG/Opus, URL de descarga que vence a los 5 min; reintentos de webhooks hasta 7 días, con duplicados; firma `X-Hub-Signature-256` | Los botones actuales ([Dale], [No era eso], [Volver a como estaba]) entran; dedupe por `wamid` |
| Identidad | Desde 2026 llegan los BSUID (ids de usuario por negocio, sin teléfono) y el `wa_id` puede faltar cuando el usuario adopta un nombre de usuario | La identidad del cliente no puede depender solo del teléfono (ruteo del R2) |

### 4.2 Cloud API directo, Kapso u otros

| Opción | Qué es | Costo fijo | Mensajes de Meta | Riesgos |
|---|---|---|---|---|
| **Kapso** | Proxy de Cloud API con el mismo esquema que Meta, webhooks, historial consultable, inbox y **setup links**: cada agencia conecta su número con su marca en unos 5 minutos. Se presenta como BSP ("Kapso attaches its credit line to your customers' WhatsApp Business Accounts") [KAPSO] | Free USD 0 (2.000 mensajes, 1 número); Pro USD 25 (100.000 mensajes, 3 números, USD 10 por número extra); **Platform USD 299** (1.000.000 de mensajes, 50 números, USD 5 por número extra, alta con marca propia y facturación centralizada) | "pass through Kapso at cost, with no markup" en cuentas en USD; 5% cambiario en otras monedas | Reintenta webhooks solo unos 50 s (3 intentos) y los pausa si fallan mucho: el worker tiene que estar arriba y reconciliar con su API de historial; una cuenta con el crédito de Kapso no puede volver a tarjeta; su condición de BSP la afirma Kapso (el directorio de Meta pide login) |
| **Meta directo (Tech Provider)** | Embedded Signup propio, canje de tokens, registro de números, webhooks | Sin cargo por número | Tarifa de lista; cada agencia paga con su tarjeta (sin línea de crédito) | Trámite (verificación más App Review) y todo el desarrollo de alta y cobro |
| Twilio | Plataforma de mensajería | — | USD 0,005 por mensaje entrante o saliente, más la tarifa de Meta ("Pricing current as of September 2026") [TWILIO] | Recargo por mensaje |
| 360dialog | BSP | 49 € / 59 USD por número por mes (cliente directo); planes de partner desde 250 € | Tarifa de Meta, 4% si se paga con tarjeta [360] | Caro con muchos números |

Ejemplo (cálculo del investigador, supuestos propios): 2.000 clientes en Uruguay, un número por agencia (100 números) y, por cliente y mes, 4 mensajes de marketing, 4 utility fuera de la ventana, 30 service salientes y 30 entrantes. Meta directo ≈ USD 682 por mes; Kapso Platform ≈ USD 1.231; Twilio ≈ USD 1.362; 360dialog ≈ USD 3.322. Con un solo número de Walt para todos, Meta directo sube a ≈ USD 1.349 porque se pierde el cupo gratis por número.

Con los supuestos de este plan (10 pedidos por cliente y mes, unos 4 mensajes de Walt por pedido, es decir 800 service por número, dentro del cupo de 1.000; 2 avisos utility fuera de la ventana por cliente; y en R3, 2 promociones por cliente), el costo de Meta por agencia de 20 clientes en Uruguay es de unos USD 0,45 por mes sin promociones y unos USD 3,4 con ellas; el de Kapso Platform, USD 5,49 por número. **WhatsApp completo cuesta entre USD 6 y 9 por agencia por mes**: entra en el precio del plan (§1).

**Recomendación (ADR-P6):** arrancar el R2 con **Kapso** usando su app de Meta y facturación `partner_managed` (Kapso pone el crédito y cobra a Meta al costo; Walt le factura a cada agencia). Plan Pro mientras haya menos de 30 agencias con WhatsApp (USD 25 + USD 10 por número extra) y Platform desde ahí. Escribirle a Kapso en el formato de Meta para poder cambiar de proveedor cambiando la URL base. En paralelo, verificar el negocio de Walt y hacer el camino a Tech Provider; pasar a Cloud API directo (con un Solution Partner para el crédito) cuando el ahorro, unos USD 6.600 por año a la escala del ejemplo, pague el costo de operarlo.

### 4.3 Telegram

| Tema | Dato vigente | Para Walt |
|---|---|---|
| Costo | "bots are able to message their users at no cost" [TG-FAQ] | Cero por mensaje |
| Límites | Evitar más de 1 mensaje por segundo por chat; 20 por minuto en grupos; unos 30 por segundo en total (más con paid broadcasts) [TG-FAQ] | Sobra para la escala del plan |
| Links profundos | Parámetro `start` de hasta 64 caracteres (`A-Z a-z 0-9 _ -`) [TG-LINKS] | Las invitaciones actuales entran |
| Webhooks | Puertos 443, 80, 88 y 8443; header secreto; si no hay 2xx, reintenta "a reasonable amount of attempts" y guarda los updates hasta 24 h; IPs 149.154.160.0/20 y 91.108.4.0/22, solo IPv4 [TG-API] [TG-WH] | Webhook al worker con el secreto; dedupe por `update_id` |
| **Un bot por agencia** | Desde la Bot API 9.6 (2026-04-03) existen los **Managed Bots**: un bot "manager" genera un link `t.me/newbot/<manager>/<nuevo>` y, cuando el usuario confirma, recibe el token por API (`getManagedBotToken`) [TG-API] | Cada agencia crea su bot con su nombre en un clic, sin pasar el token de BotFather a mano; es la forma oficial y evita la cláusula contra operar con credenciales ajenas para evadir moderación [TG-TOS] |
| Datos para IA | Los términos para desarrolladores de bots prohíben juntar datos "aimed at creating large datasets, machine learning models and AI products"; se pueden usar los datos que los usuarios mandan al bot si se les informa el uso y dan un consentimiento "individual, explicit, active and revocable" [TG-TOS] | Los pedidos de Telegram solo entran al eval global con ese consentimiento del cliente final |
| Adopción | Ver §4.4 | |

### 4.4 Adopción de WhatsApp y Telegram por país

_En curso: la investigación se cortó por el límite de uso; se completa en el próximo commit._

---

## 5. Cómo se paga la IA: los tres modos y qué permiten los términos de Anthropic

### 5.1 Qué dicen los términos vigentes (verificado el 2026-10-20)

- **Consumer Terms** (vigentes desde el 2025-10-08), §2: "You may not share your Account login information, Anthropic API key, or Account credentials with anyone else. You also may not make your Account available to anyone else." [A-CONS]
- **Claude Code, Legal and compliance:** "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow." [A-CC-LEGAL]
- **Agent SDK:** "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." [A-SDK]
- **Usage Policy nueva** (rige desde el 2026-11-12): prohíbe "Resell, proxy, or otherwise provide access to Claude through unauthorized means, including services that route requests through consumer subscriptions". [A-AUP]
- **La fecha de las notas de Salva (2026-02-19):** es la de la prensa (WinBuzzer el 2026-02-19, The Register el 2026-02-20). El texto apareció en la página de Claude Code entre el 2026-02-01 y el 2026-02-18 según el Wayback Machine, y pedirle el login a la agencia ya violaba antes el §2 de los Consumer Terms. Desde fines de agosto de 2026 el texto prohíbe además guardar o intermediar credenciales de cualquier cuenta de Claude.ai, incluidas Team y Enterprise. [A-PRESS]
- **BYOK, permitido:** la misma página de Claude Code aclara que esto "does not restrict how customers provision and manage their own API keys … provided the resulting usage is billed to the key owner … and is not resold or intermediated". Los Commercial Terms (vigentes desde el 2025-06-17), A.1: "Anthropic gives Customer permission to use the Services, including to power products and services Customer makes available to its own customers and end users". [A-COM]
- **Ojo con el agente de código:** el Claude Agent SDK corre el binario de Claude Code, y la página legal dice que correr Claude Code dentro de un producto ("in hosted sandboxes or other agent infrastructure") exige que "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential". La licencia del Agent SDK, en cambio, permite usarlo "to power products and services that you make available to your own customers and end users". No hay texto que diga cuál manda para un producto como Walt. [A-CC-LEGAL] [A-SDK]
- **Créditos de API para suscriptores** (desde el 2026-10-07): los planes Max y Team traen créditos mensuales para la Claude Platform (Max 5x USD 100, Max 20x USD 200, Team USD 20 por asiento estándar y USD 100 por premium, con tope de USD 500), que cubren la API, Managed Agents y el Agent SDK, no Claude Code. Se usan creando una API key en la Console. [A-CRED]
- **Claude Code channels:** un servidor MCP que empuja eventos a una sesión de Claude Code abierta; está en research preview, un canal propio no está en la lista permitida (hay que correrlo con `--dangerously-load-development-channels`) y los Service Specific Terms dicen que lo que está en preview "may not be suitable for production use". [A-CHAN]

### 5.2 Los tres modos

| Modo | Cómo funciona | ¿Cumple? | Cuándo |
|---|---|---|---|
| **1. Clave propia (BYOK)** | La agencia carga su API key de Anthropic (por agencia o por proyecto). Se valida con una llamada que no gasta tokens, se guarda cifrada en Vault (`set_ai_key` de 0004), nunca se loguea y tiene tope mensual con aviso al 80% | **Sí**: el uso se factura al dueño de la clave y no se revende | R1 |
| **2. "La sesión de Claude de la agencia"** | **No** se pide login, token OAuth ni `claude setup-token`. Lo que cumple: (a) la agencia con plan Max o Team usa sus créditos de API mensuales, crea una API key en la Console y la carga como BYOK (es el modo 1 con otra fuente de saldo); (b) más adelante, si alguna agencia lo pide, la GitHub Action oficial de Claude Code en el CI de la propia agencia, con su token guardado en sus secretos de GitHub y Walt solo disparando el workflow: está documentado para CI, pero es zona gris cuando el volumen viene de los clientes finales y Walt pierde el control del hook y la revisión del diff | (a) **sí**; (b) zona gris; channels **no** (preview, no apto para producción) | (a) R1; (b) a evaluar en R3 |
| **3. Créditos prepagos de Walt** | Billetera por agencia (`wallets`, `usage_ledger`, `record_usage` de 0004). Walt vende **su servicio** por pedido; el precio sale del costo de tokens más un margen (30% provisorio en 0004). Recarga manual en R1; Stripe y Mercado Pago con recarga automática en R2 | **Sí** para la interpretación y las respuestas (Messages API, A.1 de los Commercial Terms), siempre que se venda el servicio de Walt y no "créditos de Claude" (D.4 prohíbe revender los Services sin aprobación). **Para el agente de código, a confirmar** (ver arriba) | R1 (interpretación), agente según la respuesta de Anthropic |

**Recomendación (ADR-P5):**
1. R1: BYOK (con la vía de créditos Max/Team explicada en el onboarding) y créditos de Walt para interpretar, responder y presupuestar.
2. El agente de código corre con la credencial de la agencia (BYOK, créditos Max/Team o Bedrock propio) hasta tener una confirmación escrita de Anthropic de que Walt puede pagar el uso del Agent SDK con su cuenta para sus clientes. Si no la hay antes del R2, el agente del modo créditos pasa a la Messages API con herramientas propias (las de lectura y edición que ya usa, con el mismo guard y la misma revisión del diff), que es uso directo de la API y entra en A.1.
3. Hoy, sin fila en `ai_settings`, el esquema 0004 usa la clave de Walt para todo (modo `platform`); para el agente, eso es justo el caso a confirmar.
4. En los tres modos: ruteo de modelos (Haiku 5.5 para clasificar si el eval lo confirma, Sonnet 5.5 para interpretar, Opus 5.5 solo como respaldo del agente), caché de prompts y costo por pedido visible en el panel. Con el precio vigente de lectura de caché de Sonnet 5.5 (USD 0,10 por millón desde el 2026-10-07), `packages/core/src/pricing.ts` sobreestima un poco: hay que actualizarlo.
5. El modo 3 tiene un techo de Anthropic: los tiers pasaron a Start, Build y Scale el 2026-06-26, con topes de gasto mensual de USD 500, 1.000 y 200.000; el tier lo asigna Anthropic según el historial [A-RL]. Con el escenario base (USD 317 por mes de IA, `docs/PRODUCCION.md` §5) Start alcanza para la beta, pero no para 100 agencias en el escenario alto: hay que pedir el cambio de tier antes.

---

## 7. Features de valor: priorización

Escala de 1 a 5. **Plata** = cuánto le genera o le ahorra a la agencia y a su cliente final (juicio del equipo: **hipótesis** hasta medirlo en la beta). **Esfuerzo** = cuánto falta construir sobre lo que ya existe (5 = más). Se ordena por plata ÷ esfuerzo; las estratégicas se marcan aparte aunque su cociente sea menor.

| # | Idea | Origen | Plata | Esfuerzo | Plata ÷ esfuerzo | Qué ya existe | Piloto | Release |
|---|---|---|---|---|---|---|---|---|
| 1 | **Feriados y fechas especiales**: antes de un feriado, Walt pregunta "¿Abrís el lunes?" y deja armado el cambio de horario o el cartel | propia | 3 | 1 | 3,0 | `set_hours`, `set_banner` con vencimiento, comando `proponer` | **Sí**: es la primera oportunidad del motor y no necesita analytics | R3 (en Telegram puede ir antes) |
| 2 | **Reporte mensual al cliente final** con los cambios, el tiempo hasta publicar y los resultados si hay datos | brief, idea 2 | 3 | 1 | 3,0 | Pedidos, eventos con tiempos y costo por cliente (Clientes) | **Sí** | R3 |
| 3 | **Control de alcance y cobro**: cupo por plan del cliente, lo que pasa el cupo se ofrece como extra con precio y link de pago, presupuestos con seña | brief, idea 3 | 5 | 2 | 2,5 | `clients.monthly_quota`, "cambios usados en el mes", presupuestos con botones | **Sí**: R1 con el link de pago de la agencia; R2 integrado con comisión | R1–R2 |
| 4 | **Resumen semanal para la agencia** (gerente de cuenta): clientes en riesgo, pedidos repetidos que son una oportunidad de venta, cupos por agotarse | brief, idea 4 | 3 | 2 | 1,5 | Salud del cliente, "Lo que piden", Atención | **Sí**, por Telegram a la agencia | R2 |
| 5 | **Precios desde una foto o una planilla**: el cliente manda la lista y Walt arma el cambio en lote con vista previa | propia | 3 | 2 | 1,5 | `set_price`, `adjust_prices`, audios (misma idea con imágenes) | Candidato | R2 |
| 6 | **Monitoreo liviano**: caída, formularios y checkout rotos, con alerta e incidente a la agencia | brief, idea 1 | 4 | 3 | 1,3 | Capturas con Playwright | Sí, la versión liviana | R3 |
| 7 | **Inteligencia comercial** (la feature estrella): oportunidades por calendario comercial, estado del sitio y analytics, con vista previa, precio y link de pago | brief §5 | 5 | 4 | 1,25 | Vista previa, presupuestos, `proponer` | **Sí**, acotada: 3 a 5 fechas por país más contenido viejo | R3 |
| 8 | Consultas con base de conocimiento por cliente y escalamiento con diagnóstico | brief, idea 6 | 2 | 2 | 1,0 | `answerConsulta` sobre el inventario | No: mejora incremental | R2–R3 |
| 9 | **Conectores sin repo** (WordPress/WooCommerce, Tiendanube, Shopify, Wix, Webflow) | brief, idea 5 | 5 | 5 | 1,0 | Nada: cada plataforma es un producto | Spike técnico de un conector en R3 | R4 (estratégica) |
| 10 | Traducción del sitio (español, portugués, inglés) como cambio con vista previa | propia | 3 | 3 | 1,0 | Contrato de contenido | No | R4 |
| 11 | Monitoreo completo con diagnóstico y PR de arreglo | brief, idea 1 | 4 | 5 | 0,8 | Agente de código | No, después de la versión liviana | R4 |
| 12 | Sincronizar horarios y feriados con el perfil de Google del negocio | propia | 3 | 4 | 0,75 | `set_hours` | No: exige aprobación de acceso a la API de Google y OAuth por cliente | R4 |
| 13 | Mejoras de conversión y pruebas A/B propuestas por Walt | brief, idea 7 | 3 | 5 | 0,6 | Nada | No: pide analítica, variantes y tráfico suficiente para medir, que un sitio chico no suele tener | Después de R4 |

Por qué los conectores sin repo son estratégicos aunque su cociente sea bajo: según W3Techs (estadística del 2026-10-20), el 32,1% de los sitios no usa ningún CMS que ellos detecten; WordPress está en el 39,6% de todos los sitios, Shopify en el 5,3%, Wix en el 4,2%, Squarespace en el 2,4%, Webflow en el 0,8% y Tiendanube/Nuvemshop en el 0,3% [W3T]. Hoy Walt atiende sitios con repo propio, que en general caen en ese 32,1%: los conectores multiplican el mercado, pero cada uno es un producto aparte.

**Pilotos elegidos**, en orden: (3) control de alcance y cobro, porque es plata directa para la agencia y para Walt y casi todo existe; (4) el resumen semanal a la agencia, porque cuesta poco y usa datos que ya están; (2) el reporte mensual y (1)+(7) el motor de oportunidades acotado, que son el R3. Métrica de cada piloto: cobros extra por cliente y mes (3), clientes en riesgo recuperados (4), aperturas y bajas de los reportes (2), y tasa de aceptación e ingresos por oportunidad (1, 7). Ninguna meta numérica se fija antes de tener la línea de base de la beta.

---

## Fuentes

Consultadas el 2026-10-20. "Sin fecha" = la página no muestra fecha de publicación ni de actualización. Las de infraestructura están en `docs/PRODUCCION.md` › "Fuentes".

**Anthropic**

| Clave | Qué | Link | Fecha |
|---|---|---|---|
| A-PRICE | Precios de la API y notas de versión | https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/release-notes/overview | sin fecha; lectura de caché de Sonnet 5.5 a 0,10 desde 2026-10-07 |
| A-RL | Rate limits, tiers Start, Build y Scale | https://platform.claude.com/docs/en/api/rate-limits | sin fecha; tiers desde 2026-06-26 |
| A-CONS | Consumer Terms, §2 y §3 | https://www.anthropic.com/legal/consumer-terms | vigentes desde 2025-10-08 |
| A-COM | Commercial Terms, A.1, D.4 y D.5 | https://www.anthropic.com/legal/commercial-terms | vigentes desde 2025-06-17 |
| A-CC-LEGAL | Claude Code, Legal and compliance (autenticación y "Can customers offer Claude Code in their products?") | https://code.claude.com/docs/en/legal-and-compliance | sin fecha; sección de autenticación desde 2026-02 (Wayback) |
| A-SDK | Claude Agent SDK, nota sobre el login de claude.ai | https://code.claude.com/docs/en/agent-sdk/overview | sin fecha |
| A-AUP | Usage Policy nueva | https://www.anthropic.com/legal/aup | rige desde 2026-11-12 |
| A-PRESS | Prensa sobre la prohibición de usar OAuth de suscripciones en apps de terceros | https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/ · https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546 | 2026-02-19 · 2026-02-20 |
| A-CRED | Créditos de API para suscriptores Max y Team | https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers · https://support.claude.com/en/articles/17154008 | 2026-10-07 |
| A-CHAN | Claude Code channels (research preview) y Service Specific Terms | https://code.claude.com/docs/en/channels · https://code.claude.com/docs/en/channels-reference · https://www.anthropic.com/legal/service-specific-terms | sin fecha · términos del 2026-08-31 |
| A-CI | GitHub Actions de Claude Code y `claude setup-token` | https://code.claude.com/docs/en/github-actions · https://code.claude.com/docs/en/authentication | sin fecha |

**Canales**

| Clave | Qué | Link | Fecha |
|---|---|---|---|
| WA-PRICE | Precios de WhatsApp Business Platform (por mensaje, cambio del 2026-10-01, cupo de 1.000 service) | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing | sin fecha; "pricing updates that became effective as of October 1, 2026" |
| WA-CALC | Calculadora oficial de tarifas por país | https://whatsappbusiness.com/products/platform-pricing/ | sin fecha |
| WA-TERMS | Meta Terms for WhatsApp Business Platform (§4.1 reventa, §4.7 AI Providers, uso de datos) | https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform | modificados 2026-09-23 |
| WA-POLICY | WhatsApp Business Messaging Policy (opt-in, plantillas, escalamiento a una persona) | https://whatsappbusiness.com/policy/ | 2026-09-23 |
| WA-LIMITS | Messaging limits, throughput, números por portafolio | https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits | sin fecha |
| WA-ES | Embedded Signup, Tech Providers, Multi-Partner Solutions | https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview · https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview | sin fecha |
| WA-MM | Marketing Messages API (fin del marketing por Cloud API el 2027-10-13) y pausa a EE.UU. | https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/overview | anuncio del 2026-10-13 |
| WA-VER | Verificación del negocio y nombre visible | https://www.facebook.com/business/help/2058515294227817 · https://www.facebook.com/business/help/757569725593362 | sin fecha |
| WA-HOOK | Webhooks: reintentos hasta 7 días, duplicados, firma | https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview | sin fecha |
| WA-AI | Comisión Europea sobre la política de IA de Meta | https://ec.europa.eu/commission/presscorner/detail/en/ip_25_2896 · https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1276 | 2025-12-04 · 2026-06-09 |
| KAPSO | Kapso: documentación, setup links, facturación, webhooks y precios | https://docs.kapso.ai/ · https://kapso.com/pricing · https://kapso.com/platform | sin fecha |
| TWILIO | Precio de WhatsApp en Twilio | https://www.twilio.com/en-us/whatsapp/pricing | "current as of September 2026" |
| 360 | Precios de 360dialog | https://docs.360dialog.com/docs/get-started/pricing · https://docs.360dialog.com/partner/get-started/pricing | 2026-10-01 |
| TG-FAQ | Telegram Bots FAQ (costo y límites) | https://core.telegram.org/bots/faq | sin fecha |
| TG-LINKS | Links profundos | https://core.telegram.org/bots/features#deep-linking | sin fecha |
| TG-API | Bot API 10.3, webhooks y Managed Bots (9.6) | https://core.telegram.org/bots/api · https://core.telegram.org/bots/api-changelog · https://core.telegram.org/bots/features#managed-bots | 2026-08-24 · 2026-04-03 |
| TG-WH | IPs, puertos y TLS de los webhooks | https://core.telegram.org/bots/webhooks | sin fecha |
| TG-TOS | Términos para desarrolladores de bots (§4.3 datos, §5.2 operación) | https://telegram.org/tos/bot-developers | sin fecha |

**Competidores y mercado**

| Clave | Qué | Link | Fecha |
|---|---|---|---|
| COMP | Páginas de precios: Atarim, GoWP, nanogent, autoSite, Macaly, Duda, GoHighLevel, Webflow, Wix Studio, Framer, 10Web, Lovable, Bolt, v0, Replit, Devin, GitHub Copilot, Cursor, Builder.io, ManyRequests, Marker.io, FatLab, WP Buffs, WP SitePlan | https://atarim.io/pricing/ · https://www.gowp.com/pricing/ · https://nanogent.ai/ai-web-agent · https://autosite.dittu.org · https://macaly.com/pricing · https://www.duda.co/pricing · https://www.gohighlevel.com/pricing · https://webflow.com/pricing · https://www.wix.com/studio/plans · https://www.framer.com/pricing · https://10web.io/agency/pricing/ · https://docs.lovable.dev/introduction/subscription-plans · https://bolt.new/pricing · https://v0.app/pricing · https://replit.com/pricing · https://docs.devin.ai/admin/billing/self-serve · https://github.com/features/copilot/plans · https://cursor.com/pricing · https://www.builder.io/pricing · https://www.manyrequests.com/pricing · https://marker.io/pricing · https://fatlabwebsupport.com/pricing/ · https://wpbuffs.com/plans/ · https://wpsiteplan.com/pricing/ | Atarim 2026-06-13; Webflow cambio 2026-05-13; Framer 2026-06-16; Devin 2026-04-14; Copilot 2026-06-01; Cursor 2026-10-12; WP SitePlan 2026-10-17; el resto sin fecha |
| COMP-PATRON | Agencia que publica cómo armar un agente que edita el sitio por WhatsApp o Telegram | https://colorwhistle.com/?p=111540 | 2026-10-05 |
| CARE | Precios de planes de mantenimiento | https://theadminbar.com/what-is-a-website-care-plan-and-whats-included/ · https://whito.co.uk/research/uk-agency-retainers/ · https://clutch.co/uy/web-designers | 2026-03-13 · 2026-10-19 · 2026-10-20 |
| FEES | Comisiones de plataformas: Upwork, Fiverr, Workana, Codeable, Contra, Shopify App Store, Wix Studio | https://support.upwork.com/hc/en-us/articles/211062538-Learn-about-the-Freelancer-Service-Fee · https://help.fiverr.com/hc/en-us/articles/9234443621137-Your-earnings-page · https://help.workana.com/hc/en-us/articles/360041235874-How-is-the-commission-calculated-at-Workana · https://www.codeable.io/pricing/ · https://contra.com/pricing · https://shopify.dev/docs/apps/launch/distribution/revenue-share · https://www.wix.com/studio/partner-program | sin fecha |
| W3T | Uso de CMS en la web | https://w3techs.com/technologies/overview/content_management | 2026-10-20 |

**Cobros y legal**

| Clave | Qué | Link | Fecha |
|---|---|---|---|
| STRIPE | Países soportados (Uruguay no; Brasil y México sí), Atlas, tarifas, Billing, Tax, Pix desde EE.UU. y límites de Connect | https://stripe.com/global · https://stripe.com/atlas · https://stripe.com/pricing · https://stripe.com/billing/pricing · https://docs.stripe.com/payments/pix · https://stripe.com/connect/pricing · https://docs.stripe.com/connect/direct-charges | sin fecha |
| DE-IRS | Impuesto anual de Delaware y formulario 5472 del IRS | https://corp.delaware.gov/frtax/ · https://www.irs.gov/instructions/i5472 | sin fecha · revisado 12/2024 |
| MP | Mercado Pago Uruguay: link de pago, cobros online, suscripciones y split de marketplace; Brasil: split 1 a 1 y alta con CPF o CNPJ | https://www.mercadopago.com.uy/herramientas-para-vender/link-de-pago · https://www.mercadopago.com.uy/herramientas-para-vender/suscripciones · https://www.mercadopago.com.uy/developers/es/docs/subscriptions/overview · https://www.mercadopago.com.uy/developers/es/docs/checkout-pro/how-tos/integrate-marketplace · https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites | sin fecha |
| PADDLE | Paddle: comisión, países, BRL y Pix, productos prohibidos | https://www.paddle.com/pricing · https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle · https://developer.paddle.com/concepts/payment-methods/pix · https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle | sin fecha · prohibidos act. 2026-04-13 |
| PAY | Resumen de comisiones usado en el margen (Paddle 5% + USD 0,50; Mercado Pago Uruguay 5,99% o 4,99% + IVA) | ver PADDLE y MP | — |
| DLOCAL | dLocal Go: países, precios y split | https://helpcenter.dlocalgo.com/es/articles/9251261-que-costos-tengo-por-vender-con-dlocal-go · https://dlocalgo.com/wp-content/uploads/2024/09/pricinglist.pdf | 2026-09-08 · lista de 2024 |
| UY-SAS | SAS digital: costo y trámites | https://www.gub.uy/tramites/registro-sociedad-acciones-simplificada-sas-persona-fisica · https://www.gub.uy/tramites/inscripcion-sociedad-acciones-simplificada-formacion-sas · https://www.impo.com.uy/bases/leyes/19820-2019 | act. 2026-02-11 · 2026-09-22 · ley de 2019 |
| UY-CFE | Factura electrónica obligatoria para contribuyentes de IVA desde 2025 y exportación de servicios | https://www.efactura.dgi.gub.uy/principal/ampliacion_de_contenido/universalizacion-de-facturacion-electronica-plazo-para-restantes-contribuyentes-de-iva · https://www.gub.uy/direccion-general-impositiva/comunicacion/publicaciones/estan-gravadas-iva-exportaciones | sin fecha · 2024-06-17 |
| UY-DATOS | Ley 18.331, registro de bases en la URCDP, Decreto 64/020 (incidentes, delegado), adecuación de la UE | https://www.impo.com.uy/bases/leyes/18331-2008 · https://www.gub.uy/tramites/inscripcion-bases-datos-personales · https://www.impo.com.uy/bases/decretos/64-2020 · https://ec.europa.eu/commission/presscorner/detail/en/ip_24_161 | act. 2026-06-15 (trámite) · 2020-02-17 · 2024-01-15 |
| LGPD | LGPD, encargado (Res. ANPD 18/2024), incidentes (Res. 15/2024), transferencias (Res. 19/2024) | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm · https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024 | 2024 |
| GDPR | Reglamento 2016/679 (arts. 3, 27, 28, 33), cláusulas tipo 2021/914 y DPA de Anthropic | https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679 · https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32021D0914 · https://www.anthropic.com/legal/data-processing-addendum | DPA vigente desde 2025-02-24 |
| META-DOCS | Documentos que Meta acepta para verificar el negocio | https://www.facebook.com/business/help/159334372093366 | sin fecha |

**Adopción por país:** en curso (ver §4.4).
