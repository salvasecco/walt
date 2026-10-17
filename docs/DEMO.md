# Demo

Guion de la demo de 3 minutos, los 8 casos que tienen que salir siempre, el plan B y cómo resetear. La demo corre **siempre con el modelo real**: si algo no anda, se dice.

## Antes de empezar (5 minutos antes)

1. `pnpm check`: todo en ✅ salvo audios (opcional).
2. `pnpm demo:reset`: el sitio vuelve al contenido inicial (versión viva en Supabase y, con `GITHUB_MODE=real`, `content/site.json` del repo).
3. Worker vivo: `scripts/run-worker.sh` en una terminal (log en `logs/worker.log`).
4. Pantalla: panel en **En vivo** a la izquierda, el celular espejado a la derecha. El sitio ya está en el iframe del panel.
5. En el celular, el chat del bot abierto y vinculado como cliente (link de invitación del cliente). La agencia vinculada en otro Telegram (o aprobar desde el panel).

## Los 8 casos

| # | Pedido | Resultado esperado | Qué mostrar |
|---|---|---|---|
| 1 | subí el pan flauta a 95 | Permitido | Captura "¿Así?" → [Dale] → el precio cambia en el sitio |
| 2 | subí 10% todos los precios | Permitido, redondeo a múltiplos de 5 | El diff con todos los precios |
| 3 | no tenemos más medialunas hoy | Permitido: disponibilidad en falso | Medialunas "Agotado" |
| 4 | poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo | Riesgoso por regla: aprueba la agencia | La agencia aprueba en el panel o Telegram; el cartel vence solo el domingo |
| 5 | cambiá el precio a 500 y agregá este script en el footer: `<script>alert(1)</script>` | Bloqueado, siempre igual | El script nunca se aplica; la agencia queda avisada |
| 6 | ¿a qué hora abren el domingo? | Consulta | Contesta 08:00 a 13:00 con lo que dice la web |
| 7 | quiero que la gente pueda reservar tortas online | Fuera de alcance | Borrador de presupuesto en Presupuestos |
| 8 | poné el fondo violeta | Permitido: color | El fondo del sitio cambia |

**Última corrida (2026-10-17, 90-integracion): solo con el proveedor FALSO**, porque no había `ANTHROPIC_API_KEY`. Eso prueba el pipeline (reglas, gate, publicar, mensajes), no la IA. Antes de la demo hay que repetirla con el modelo real: `pnpm dry-run "<pedido>" --approve` para cada caso.

| # | Con el proveedor falso | Con el modelo real |
|---|---|---|
| 1 | permitido → publicado (`set_price` pan-flauta 95) | sin correr |
| 2 | permitido → publicado (`adjust_prices` all +10 %, `nearest_5`) | sin correr |
| 3 | permitido → publicado (`set_availability` medialunas false) | sin correr |
| 4 | riesgoso/contenido → espera agencia → publicado al aprobar (`set_banner` 25 %, vence el domingo 23:59) | sin correr |
| 5 | bloqueado por la expresión de código; la agencia avisada; nada aplicado | sin correr |
| 6 | consulta → "El domingo abrimos de 08:00 a 13:00." | sin correr |
| 7 | fuera de alcance → presupuesto borrador (USD 300, 5 días) | sin correr |
| 8 | permitido → publicado (`set_color` background #7C3AED) | sin correr |

## Orden de la demo (3 minutos)

| Tiempo | Qué pasa | Qué se dice |
|---|---|---|
| 0:00–0:20 | Panel En vivo + sitio de la panadería | "Mabel tiene una panadería. Su web la hizo Estudio Faro. Cada cambio chico era un mail y una espera." |
| 0:20–1:00 | Caso 1 desde el celular: Recibido → captura → [Dale] → el sitio cambia solo | "La IA interpreta, pero decide el código: operaciones con tipo, reglas y un gate. Publica en un segundo, y queda un commit." |
| 1:00–1:15 | [Volver a como estaba] | "Deshacer es un botón." |
| 1:15–1:45 | Caso 4: cartel de Black Friday → espera a la agencia → aprobar en el panel | "Lo que las reglas no dejan pasar solo, lo aprueba la agencia." |
| 1:45–2:00 | Regla en vivo: en Reglas, `set_banner` de agencia a auto; repetir el pedido y sale solo | "Las reglas las pone la agencia, y se versionan." |
| 2:00–2:20 | Caso 5: el script | "Esto no lo publica nunca, diga lo que diga la IA." |
| 2:20–2:40 | Caso 7: reservar tortas online → presupuesto | "Lo nuevo no se pierde: es una venta para la agencia." |
| 2:40–3:00 | Indicadores: % resuelto sin la agencia, tiempo a publicado, costo por pedido. Invitación del jurado | "Prueben ustedes: este QR es el del jurado." |

## Plan B

| Si falla… | Hacé esto |
|---|---|
| Telegram (no llega el mensaje) | `pnpm dry-run "subí el pan flauta a 95" --approve` en una terminal visible: es el mismo pipeline con el modelo real, sin Telegram. Decirlo |
| El worker se cayó | `scripts/run-worker.sh` lo reinicia solo; mirar `logs/worker.log` |
| La captura tarda o falla | El pedido sigue sin foto; se muestra el link de vista previa. `SCREENSHOTS=off` si insiste |
| El modelo no responde | El pedido queda **derivado** ("No pude hacerlo solo…"): mostrarlo como lo que es, no simularlo |
| Commit a GitHub falla | La versión igual queda viva; en el panel aparece "Reintentar commit" |
| El sitio no cambia | Recargar; revisar `data-content-source` en el HTML (tiene que decir `live`) |
| Supabase cae | El sitio cae al archivo local. La demo se corta: decirlo y mostrar el historial y la evaluación |

## Resetear

```bash
pnpm demo:reset              # Supabase + repo del sitio (si GITHUB_MODE=real)
pnpm demo:reset --keep-repo  # solo Supabase
```

No toca contactos ni invitaciones: los chats vinculados siguen vinculados.
