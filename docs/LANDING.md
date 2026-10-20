# Landing de Walt: estrategia

Fecha: 2026-10-20. Responde a `LANDING.md` del kit de prompts. Todo lo que dice la página sale de `docs/NEGOCIO.md`, `docs/PRODUCCION.md`, `docs/DEMO.md`, `eval/report.md` o de una fuente con fecha (lista al final). Lo que no tiene fuente es un **supuesto** y la página lo dice.

## 1. Qué tiene que lograr

Que una agencia o un freelancer que llega desde un link de WhatsApp o LinkedIn entienda en un minuto qué gana, calcule cuánto le rinde con sus números y se anote en la beta sin hablar con nadie. Una sola acción principal: **Sumarme a la beta**. La secundaria: **Calcular cuánto me rinde**.

## 2. Posicionamiento

- **Promesa:** «Vos entregás. Walt atiende.»
- **En una frase:** el cliente pide cambios a su software por chat o por audio; Walt los entiende, le muestra cómo quedan y los publica con un «Dale». Lo que toca código lo programa un agente y, si es delicado, lo aprueba la agencia. Lo nuevo, lo cotiza con link de seña.
- **Categoría:** atención de cambios para software entregado. No es un constructor de sitios ni un chatbot de soporte: trabaja sobre el software que la agencia ya entregó, con sus reglas.
- **Alcance honesto:** es para software en general, no solo webs; **hoy** funciona con proyectos que tienen repositorio propio (GitHub) y contenido editable. WordPress, Shopify y otras plataformas sin repo están en el plan (R4), no disponibles hoy.
- **Diferencia frente a lo que hay** (`docs/NEGOCIO.md` §3): ninguno junta mensajería del cliente final con la marca de la agencia, reglas en código que deciden, carril de código con PR y diff para la agencia, y presupuesto con link de pago. La ventaja es de ejecución, no de concepto: la página no habla mal de nadie con nombre.

## 3. Por qué voseo

La beta es en Uruguay (laboratorio, `docs/PRODUCCION.md` §3) y el segundo idioma es portugués de Brasil. En Uruguay y Argentina el voseo es el registro natural de una conversación de trabajo; el tuteo neutro sonaría a traducción. La estructura de textos queda separada por idioma (`apps/panel/src/lib/landing/copy.*.ts`) para agregar portugués y, si hace falta, un español neutro para el resto de LatAm.

## 4. El dolor, en las dos puntas (con fuente)

| Lado | Mensaje | Dato | Fuente |
|---|---|---|---|
| El negocio del cliente | El cliente espera días por un cambio de cinco minutos | 6 de cada 10 equipos tardan una semana o más en llevar un cambio a producción (35% entre una semana y un mes, 25% entre uno y seis meses) | DORA, *Accelerate State of DevOps Report 2024*, p. 13 [DORA] |
| La agencia | El mantenimiento es la mayor parte del costo y casi nadie lo cobra bien | Entre el 40% y el 80% del costo de un software llega después de entregarlo: 60% en promedio | Robert L. Glass, *Facts and Fallacies of Software Engineering* (2002), hecho 41 [GLASS] |
| Quien programa | Cada interrupción rompe el foco | Después de una interrupción, solo en 1 de cada 10 sesiones se vuelve a escribir código en menos de un minuto | Parnin y Rugaber, *Resumption strategies for interrupted programming tasks* (Software Quality Journal, 2011) [PARNIN] |

Cada cifra va en la página con su fuente debajo y un link. No se agrega ninguna otra estadística.

## 5. Dos públicos, dos mensajes (tabs, una sola página)

**Agencias**
- El mantenimiento pasa de ser un costo que nadie cobra a un ingreso recurrente.
- Los extras se cobran solos: presupuesto con alcance, plazo y seña.
- El equipo ve todo en un panel, con roles y con las reglas de la agencia.
- Marca blanca: el cliente habla con «el asistente de tu agencia», no con Walt.

**Freelancers**
- Dejás de ser el soporte por WhatsApp a las 11 de la noche.
- Los cambios chicos salen solos con el «Dale» del cliente; los grandes se cotizan.
- Vos solo aprobás lo delicado, desde el celular.

## 6. La confianza es el argumento central

La pregunta de toda agencia: «¿y si la IA rompe algo?». La respuesta, en este orden:

1. **Cinco caminos, no uno:** consulta, simple, delicado, nuevo y bloqueado (`docs/DEMO.md`).
2. **Lo delicado nunca se publica sin aprobación:** base de datos, login, permisos, pagos, dependencias, infraestructura. La agencia ve el diff del PR antes.
3. **Doble control:** la IA clasifica por intención y después el código mira los archivos que de verdad cambian. Si toca algo delicado, sube a delicado solo; nunca baja solo.
4. **Las reglas están en código, no solo en un prompt.** La agencia escribe las suyas en lenguaje natural, marca sus zonas delicadas y las prueba en un simulador antes de guardarlas.
5. **Siempre hay vista previa** y el cliente puede decir «No era eso» o volver atrás.
6. **Evaluación interna** (rotulada así, con fecha): 89 de 90 pedidos clasificados como se esperaba, en español y portugués; **0 pedidos delicados tratados como simples** y 0 cambios prohibidos aplicados (`eval/report.md`, 2026-10-20, modelo Claude Haiku 5.5).

## 7. Objeciones y respuestas (van en Preguntas frecuentes)

| Objeción | Respuesta |
|---|---|
| ¿Quién paga la IA? | Dos opciones: tu propia clave de Anthropic (pagás los tokens directo, la guardamos cifrada y nunca se muestra) o créditos prepagos de Walt. Interpretar un pedido cuesta medio centavo de dólar (medición propia, `docs/NEGOCIO.md` §2.1). No pedimos tu usuario de Claude: los términos de Anthropic no lo permiten. |
| ¿Qué pasa con los datos? | Cada agencia ve solo lo suyo (aislamiento por agencia en la base). Los datos de una agencia no alimentan a otra. Los textos legales están en borrador y se publican revisados por un abogado. |
| ¿Qué stacks soporta hoy? | Proyectos con repositorio en GitHub y contenido editable (por ejemplo Next.js con Supabase). Plantillas de reglas para Next.js con Supabase, WordPress, Shopify y Tiendanube, pero los conectores sin repo (WordPress, Shopify, Tiendanube, Wix, Webflow) son del plan, no de hoy. |
| ¿Y si el cliente pide algo absurdo o malicioso? | Se bloquea: no se aplica nada y se avisa. En la evaluación interna, los 10 intentos de inyección de instrucciones se clasificaron como se esperaba y no se aplicó ningún cambio prohibido. |
| ¿Y si me quiero ir? | El código queda en tu repositorio: Walt trabaja con PR y commits en tu GitHub. Cancelás cuando quieras; la beta no pide tarjeta. |
| ¿Por qué Telegram y no WhatsApp? | La beta usa Telegram porque el alta es inmediata y no tiene costo. WhatsApp llega en la próxima etapa: en Uruguay lo usa el 98% de quienes usan internet (EUTIC 2024) y sin eso no se vende. |
| ¿Mi cliente va a hablar con «Walt»? | No: habla con el asistente de tu agencia, con tu nombre. |

## 8. Prueba social honesta

No hay clientes todavía. **Nada de testimonios, logos ni números de usuarios.** En su lugar:
- La demo real con tiempos medidos, rotulados «medición de la demo, 20/10/2026» (`docs/DEMO.md`): «subí los panes a 95» llega a la vista previa en 4 segundos; un aviso nuevo en la página, programado por el agente, queda publicado a los 58 segundos.
- La escasez verdadera: la beta es para 3 a 5 agencias.
- El origen: construido en la hackatón build 101, Montevideo, octubre de 2026. Los nombres y fotos del equipo, solo si Salva los confirma.

## 9. Estructura de la página

| # | Sección | Por qué en ese lugar |
|---|---|---|
| 1 | Hero: promesa, subtítulo, dos CTA y un teléfono con la demo animada (audio → vista previa → «Dale» → «✓ Publicado») | Muestra el producto en 10 segundos, sin leer |
| 2 | El problema en las dos puntas, con las tres cifras y su fuente | Nombra el dolor con datos antes de vender |
| 3 | Cómo funciona: los cinco caminos con un ejemplo real cada uno | La idea central: no todo es igual |
| 4 | Por qué es seguro | Responde la objeción principal apenas aparece |
| 5 | El panel por dentro: capturas reales (En vivo, Aprobaciones, Reglas, Calidad, Presupuestos) | Prueba de que existe |
| 6 | Para agencias / para freelancers (tabs) | Cada uno lee lo suyo |
| 7 | Plata para la agencia: alcance, extras, presupuestos con seña, comisión; «Próximamente» para R2 y R3 | Pasa de ahorro a ingreso |
| 8 | Calculadora | El lector pone sus números |
| 9 | Precios | Con la cuenta hecha, el precio se entiende |
| 10 | Comparación con hacerlo a mano o con tickets | Sin nombrar competidores |
| 11 | Preguntas frecuentes | Las objeciones de §7 |
| 12 | CTA final y pie | «Hecho en Montevideo», legales en borrador |

Reglas de diseño: identidad de build 101 (logo de la onda, verde #2BD97C, fondo #0E1116, crema #EFEBE3 en las secciones claras, Space Grotesk y DM Sans), una idea por sección, poco texto, sin gradientes violetas, sin íconos genéricos en cada tarjeta, sin emojis decorativos, sin grillas de seis tarjetas iguales. Contraste AA como mínimo. Mobile primero (375 px). Animaciones solo donde explican algo, con `prefers-reduced-motion`.

## 10. Calculadora de ROI

**Entradas** (valor por defecto y de dónde sale):

| Entrada | Por defecto | Origen |
|---|---|---|
| Clientes activos | 10 | Supuesto |
| Pedidos de cambio por cliente por mes | 5 | Supuesto conservador (`docs/NEGOCIO.md` §2.3 usa 10 para costos) |
| Porcentaje que es simple | 60% | Supuesto conservador |
| Minutos por pedido a mano (atender, cambiar, publicar y retomar el foco) | 20 | Supuesto conservador |
| Costo por hora del equipo (USD) | 25 | 24 de 40 agencias de Uruguay en Clutch declaran entre USD 25 y 49 por hora [CLUTCH] |
| Precio del plan de mantenimiento que cobrás hoy por cliente (USD por mes) | 60 | Supuesto; referencias: la mayoría de los planes de EE.UU. entre USD 100 y 150 [ADMINBAR] |
| Porcentaje de pedidos que podrías cobrar como extra | 10% | Supuesto |
| Precio de cada extra (USD) | 30 | Supuesto |

**Cuentas** (a la vista en la página, módulo `apps/panel/src/lib/landing/roi.ts` con pruebas):
- pedidos por mes = clientes × pedidos por cliente;
- horas recuperadas = pedidos × % simple × minutos ÷ 60 (solo los simples: Walt los resuelve sin el equipo; lo delicado y lo nuevo siguen llevando tiempo y no se cuentan);
- plata ahorrada = horas × costo por hora;
- ingreso extra = pedidos × % extra × precio del extra × 0,95 (descontada la comisión de 5% de Walt; no incluye la comisión del medio de pago);
- plan de Walt = el más barato que cubre esa cantidad de proyectos (un proyecto por cliente), con los proyectos extra de cada plan; a igual costo, el que incluye más;
- resultado neto = ahorro + ingreso extra − plan; retorno = neto ÷ plan;
- se paga en: plan ÷ (beneficio por día), en días.
- Lo que **no** incluye y lo dice: cambios de código por encima del cupo del plan (USD 1 cada uno), WhatsApp y la comisión del medio de pago.
- Redondeo: horas enteras, plata a múltiplos de 5 (o de 10 si pasa de 1.000). Si el neto da negativo, la página lo dice.
- Con los valores por defecto: 50 pedidos por mes, 10 horas recuperadas (USD 250), USD 143 de extras después de la comisión, plan Agencia (USD 99), neto de unos USD 295 por mes y se paga en 8 días. Los valores por defecto son conservadores a propósito.
- Se comparte por link: los valores van en la URL, sin datos personales.
- Monedas: USD; pesos uruguayos y reales con tipo de cambio fijo y fechado, avisado como aproximado: USD 1 = UYU 40,13 (BCU, 19/10/2026) y USD 1 = BRL 5,06 (Banco Central do Brasil, PTAX de venta, 19/10/2026) [BCU] [BCB].

## 11. Precios y compra

- Los de `docs/NEGOCIO.md` §1, rotulados **«precios de lanzamiento, en beta»**, en un solo archivo de configuración (`apps/panel/src/lib/landing/config.ts`):

| Plan | Mensual | Anual (2 meses menos, por mes) | Proyectos | Asientos | Cambios de código por mes | Proyecto extra |
|---|---|---|---|---|---|---|
| Freelancer | USD 29 | USD 24 | 3 | 1 | 15 | USD 10 |
| Agencia | USD 99 | USD 82 | 10 | 5 | 60 | USD 8 |
| Estudio | USD 249 | USD 207 | 30 | 15 | 200 | USD 6 |

- Cambios de contenido y consultas sin límite (uso razonable); cambio de código fuera del cupo: USD 1; comisión del 5% sobre lo que la agencia cobra por Walt (extras, presupuestos, señas). La comisión del 10% sobre oportunidades que trae Walt es del R3 y se muestra como «Próximamente».
- WhatsApp no se promete como disponible: se muestra como «Próximamente».
- **Hoy no se cobra nada:** no hay entidad legal ni cuenta de Mercado Pago. Cada plan lleva a `/registro?plan=…` y el plan elegido queda guardado en la agencia como intención (migración 0007). La beta es gratis por 3 meses y no pide tarjeta. Después de la beta, prueba de 14 días sin tarjeta.
- El cobro queda armado pero apagado (`PAYMENTS_ENABLED`), con Mercado Pago (Uruguay) y Paddle (Brasil) como proveedores a conectar. Ningún checkout falso.

## 12. Medición, sin datos personales y sin servicios pagos

Eventos guardados en la tabla `landing_events` (migración 0007), sin IP, sin mail y sin identificadores de persona:
- `cta_click` (cuál y desde qué sección);
- `calc_used` (el plan que resultó y el tramo del retorno, no los valores);
- `calc_shared`;
- `signup_started` y `signup_completed` (con el plan elegido).

## 13. SEO

Título, descripción, Open Graph e imagen generada para compartir (1200×630), datos estructurados `SoftwareApplication` con las tres ofertas, `robots.txt` y `sitemap.xml` con la landing y nada del panel. El panel sigue sin indexar.

## 14. Decisiones para Salva

1. **Contacto público:** qué mail (y si querés, teléfono) mostrar en el pie. Hoy no se muestra ninguno.
2. **Precios definitivos:** los de lanzamiento son la propuesta de `docs/NEGOCIO.md` §1. Se cambian en un solo archivo.
3. **Dominio:** la landing vive en el panel (https://walt-panel.vercel.app). Con un dominio propio (por ejemplo, walt.uy o similar), la landing va en la raíz y el panel en `app.`.
4. **Pasar a producción:** recién con tu ok sobre la vista previa.
5. **Equipo:** ¿se muestran nombres y fotos del equipo de build 101?
6. **Textos legales:** los términos y la privacidad son un borrador para revisar con un abogado.
7. **Migración 0007:** aplicarla en el SQL Editor para guardar el plan elegido y los eventos (`pnpm db:migrate --copy 0007`). Sin ella, la landing anda igual y no guarda nada.

## 15. Cómo quedó (2026-10-20)

- **Dónde:** `/` del panel muestra la landing a quien no entró; con sesión, `/` lleva a Atención (con `?landing` se ve igual). En vivo pasó de `/` a `/en-vivo`.
- **Lighthouse en celular** (build de producción local, Lighthouse 13.5, tres corridas iguales): rendimiento 95, accesibilidad 100, buenas prácticas 100, SEO 100. FCP 1,1 s, LCP 2,9 s, TBT 0 ms, CLS 0. Además, axe corrido durante toda la animación del teléfono, sin violaciones en ningún momento.
- **Capturas:** `docs/capturas/landing-<sección>-1440.png` y `-375.png` (escritorio y celular), con la imagen para compartir en `/opengraph-image`.
- **Pruebas:** calculadora (`test/landing-roi.test.ts`), eventos, pagos apagados y redirecciones, dentro de `pnpm test`.
- **Costo de IA de esta tarea:** ninguna llamada a modelos desde el producto; solo el trabajo de la sesión de Claude Code.

## Fuentes

Consultadas el 2026-10-20.

- [DORA] DORA y Google Cloud, *2024 Accelerate State of DevOps Report*, v. 2024.3, p. 13, tabla «Performance levels»: Medium «Between one week and one month», 35% (33–36%); Low «Between one month and six months», 25% (23–26%). https://dora.dev/research/2024/dora-report/
- [GLASS] Robert L. Glass, *Facts and Fallacies of Software Engineering*, Addison-Wesley, 2002, hecho 41: «Maintenance typically consumes 40 to 80 percent (average, 60 percent) of software costs». Cita textual reproducida en https://eight2late.com/2009/07/16/maintenance-matters
- [PARNIN] Chris Parnin y Spencer Rugaber, «Resumption strategies for interrupted programming tasks», *Software Quality Journal* 19(1), 5–34, 2011, https://doi.org/10.1007/s11219-010-9104-9. Copia de los autores: «In 10% of the sessions, edit lag was less than a minute», https://sites.cc.gatech.edu/reverse/repository/resumptionstrategies.pdf
- [CLUTCH], [ADMINBAR], EUTIC 2024 y precios de terceros: ver `docs/NEGOCIO.md`, «Fuentes».
- [BCU] Banco Central del Uruguay, cotización del dólar billete, 19/10/2026: 40,125. Servicio de cotizaciones del BCU, https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Cotizaciones.aspx
- [BCB] Banco Central do Brasil, PTAX, 19/10/2026, venta: 5,0564. https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/aplicacao
- Tiempos de la demo y resultados de la evaluación: `docs/DEMO.md` y `eval/report.md` (2026-10-20).
