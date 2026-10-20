# Demo

Guion de la demo del R1 (octubre de 2026): la taxonomía nueva en cuatro casos. Un cambio simple se publica solo con el «Dale» del cliente, uno delicado pasa por la agencia, uno de algo nuevo termina en presupuesto con link de pago, y una reetiqueta de la agencia cambia la decisión siguiente. La demo corre **siempre con el modelo real** (Haiku 5.5 clasifica, Sonnet 5.5 escribe el código): si algo no anda, se dice. La de la hackatón quedó abajo, en «Demo de la hackatón».

## Antes de empezar (10 minutos antes)

1. `pnpm check`: todo en ✅ salvo audios (opcional) y las migraciones que falten (`pnpm db:migrate` dice cuáles).
2. `pnpm demo:reset`: el sitio vuelve al contenido inicial (versión viva en Supabase y `content/site.json` del repo).
3. Worker vivo: `scripts/run-worker.sh` (log en `logs/worker.log`). Al arrancar dice el modelo, la base, la cola y `polling como @wal101_bot`; `curl localhost:8080/readyz` tiene que dar `ready`.
4. Pantalla: el panel (https://walt-panel.vercel.app) en **Aprobaciones** a la izquierda y el celular espejado a la derecha, con el chat de @wal101_bot vinculado como cliente. El sitio, https://walt-demo.vercel.app, en otra pestaña.
5. **Reetiqueta en vivo solo con la 0004 aplicada** (tabla `request_labels` y la RPC de parecidos). Sin la 0004, ese caso se muestra con `pnpm demo:r1 reetiqueta` en una terminal visible.

## Los cuatro casos

| # | Pedido (por Telegram) | Qué pasa | Qué mostrar |
|---|---|---|---|
| 1 | subí los panes a 95 | **Simple** por contenido. Vista previa con los tres panes a $95 y la advertencia «Ojo: Pan de masa madre baja de $220 a $95 (-57%)», con [Dale] y [No era eso]. Sin la agencia | El «Ojo» en la captura; [Dale] y el sitio cambia en segundos. Antes la masa madre iba a la agencia por el límite de precio: ahora es una advertencia para el cliente |
| 1b | agregá un aviso de envío gratis arriba del footer | **Simple por código**: el agente arma el PR, la doble clasificación revisa el diff (`revision_diff`: simple) y el cliente recibe la vista previa de Vercel. [Dale] mergea y avisa cuando está en la web | Que tocar código no lo vuelve delicado. Tarda: vista previa en unos 40 s y en la web en otros 15 s; arrancalo temprano |
| 2 | guardá las reservas en la base de datos | **Delicado**: lo dice la IA por intención y lo confirma el código mirando el diff (migración, endpoint `app/api/**`, SQL). El agente arma el PR y la agencia recibe [Aprobar] / [Rechazar] con el PR y la vista previa | En el panel, Aprobaciones con el diff. Recién si la agencia aprueba, el cliente ve la vista previa y publica. En la demo, **rechazalo** (o cerralo): mergear una tabla nueva en el sitio de la panadería no compila |
| 3 | quiero cobrar las tortas online con Mercado Pago | **Algo nuevo**: borrador de presupuesto (en la prueba, «Cobros online con Mercado Pago», USD 450, 6 días). La agencia lo revisa y lo manda desde **Presupuestos**; el cliente toca [Aceptar] y recibe el link de la seña (50%) | El link es de prueba (`pagos.walt.example`): todavía no cobra; Mercado Pago real es R2. La agencia recibe «aceptó el presupuesto» |
| 4 | poné un cartel de 50% de descuento en todo → reetiqueta → poné un cartel con 40% de descuento en todo hasta el domingo | El primero sale **simple** (advertencia del descuento). En el panel, en el detalle del pedido, «¿Estuvo bien clasificado?» → **delicado**, motivo «los descuentos grandes los aprueba la agencia». El segundo, parecido, sale **delicado**: espera a la agencia con la vista previa | El ejemplo reetiquetado entra al prompt de decisión (parecidos por `pg_trgm`, solo de la misma agencia). Sin la 0004: `pnpm demo:r1 reetiqueta` |

Otros simples que salen igual: «subí el pan flauta a 95», «el domingo abrimos de 9 a 13», «cambiá el título a naranja», y el cartel de Black Friday (antes pasaba por la agencia; ahora es simple, y si el descuento pasa el umbral de la agencia lleva la advertencia).

## Última corrida (2026-10-20, 90-integracion)

Con el modelo real: `claude-haiku-5-5` clasifica (prompt v8) y `claude-sonnet-5-5` escribe el código. Base **en memoria** (`--memoria` o `pnpm demo:r1`), porque la 0004 no está aplicada; los casos de contenido con `GITHUB_MODE=fake` (para no commitear en el repo del sitio) y los de código con GitHub y Vercel reales. Además, `pnpm e2e --strict` en verde contra la base real sin la 0004 (Supabase, modelo, GitHub y el HTML del sitio).

| Caso | Comando | Resultado | Tiempo | Costo de IA |
|---|---|---|---|---|
| 1 | `pnpm dry-run "subí los panes a 95" --memoria --undo` | simple/contenido, advertencia de la masa madre → publicado → revertido | vista previa a los 4,1 s | USD 0,0014 |
| 1 | `pnpm dry-run "subí el pan flauta a 95" --memoria --undo` | simple/contenido → publicado → revertido | vista previa a los 2,9 s | USD 0,0003 |
| 1 | `pnpm dry-run "el domingo abrimos de 9 a 13" --memoria --undo` | simple/contenido (domingo 09:00–13:00) → publicado → revertido | 2,9 s | USD 0,0003 |
| 1 | `pnpm dry-run "cambiá el título a naranja" --memoria --undo` | simple/contenido (`title`) → publicado → revertido | 3,6 s | USD 0,0003 |
| 1b | `pnpm dry-run "agregá un aviso de envío gratis arriba del footer" --memoria --undo` | simple/código: PR #13 en walt-demo, `revision_diff` simple, vista previa → [Dale] → mergeado y en la web → revertido y en la web | vista previa a los 40 s; en la web a los 58 s | USD 0,0005 + agente USD 0,0432 |
| 2 | `pnpm dry-run "guardá las reservas en la base de datos" --memoria --approve` | delicado/código: PR #14 (migración, endpoint, formulario), `revision_diff` delicado → espera a la agencia con [Aprobar]. PR cerrado después | 63 s | USD 0,0003 + agente USD 0,1136 |
| 2 | `pnpm demo:r1 delicado` | lo mismo con PR #15; el build de Vercel de ese PR falló, así que esperó la vista previa 4 min (ya arreglado: con el build fallado sigue sin esperar). La agencia lo descartó | 272 s | USD 0,0003 + agente USD 0,0649 |
| 3 | `pnpm dry-run "quiero cobrar las tortas online con Mercado Pago" --memoria` y `pnpm demo:r1 nuevo` | nuevo → presupuesto USD 450, 6 días → la agencia lo manda → el cliente acepta → link de la seña USD 225 (de prueba) | presupuesto a los 5,3 s | USD 0,0005 |
| 4 | `pnpm demo:r1 reetiqueta` (3 veces) | 50%: simple → reetiqueta a delicado → 40%: delicado/contenido, espera a la agencia; 3 de 3. Antes del arreglo de `decide`, 1 de 3 se iba al agente por código | 11 s | USD 0,0012 |

## Orden de la demo (4 minutos)

| Tiempo | Qué pasa | Qué se dice |
|---|---|---|
| 0:00–0:20 | Panel + sitio de la panadería. Mandar ya el 1b (envío gratis): tarda | "Mabel tiene una panadería; su web la hizo Estudio Faro. Walt atiende sus pedidos por Telegram." |
| 0:20–1:00 | Caso 1: «subí los panes a 95» → captura con el «Ojo» → [Dale] → el sitio cambia | "Lo simple no pasa por la agencia, aunque cambie mucho un precio: el cliente ve la advertencia y decide." |
| 1:00–1:30 | Caso 1b: llega la vista previa del aviso → [Dale] → en la web | "Que toque código no lo vuelve delicado. El código igual revisa el diff: si toca la base, sube a delicado solo." |
| 1:30–2:15 | Caso 2: «guardá las reservas en la base de datos» → Aprobaciones con el diff (migración, endpoint) | "Esto sí lo aprueba la agencia, con el diff a la vista. La IA lo clasificó y el código lo confirmó mirando el diff real." |
| 2:15–3:00 | Caso 3: Mercado Pago → Presupuestos → mandar → [Aceptar] → link de la seña | "Lo nuevo es una venta para la agencia: alcance, plazo, precio y seña." |
| 3:00–3:45 | Caso 4: cartel 50% → reetiquetar como delicado → cartel 40% va a la agencia | "La agencia corrige y Walt aprende de su agencia, y solo de la suya." |
| 3:45–4:00 | Reglas: política en texto, plantillas por stack y el simulador | "Cada agencia define qué es simple, delicado o nuevo en cada proyecto." |

## Plan B

| Si falla… | Hacé esto |
|---|---|
| Telegram (no llega el mensaje) | `pnpm demo:r1` en una terminal visible: los cuatro casos con el pipeline real y la base en memoria. Decirlo |
| El agente tarda o falla | `pnpm dry-run "agregá un aviso de envío gratis arriba del footer" --memoria --undo`; si no hay vista previa, la agencia recibe el PR igual |
| La reetiqueta no cambia la decisión | Sin la 0004 no hay `request_labels`: `pnpm demo:r1 reetiqueta` |
| El worker se cayó | `scripts/run-worker.sh` lo reinicia solo; mirar `logs/worker.log` y `curl localhost:8080/readyz` |
| El modelo no responde | El pedido queda **derivado** ("No pude hacerlo solo…"): mostrarlo como lo que es, no simularlo |
| El sitio no cambia | Recargar; revisar `data-content-source` en el HTML (tiene que decir `live`) |

## Resetear

```bash
pnpm demo:reset              # Supabase + repo del sitio (si GITHUB_MODE=real)
pnpm demo:reset --keep-repo  # solo Supabase
```

Si quedó un PR abierto de la demo en walt-demo, cerralo (o [Rechazar] desde el panel).

## Demo de la hackatón

Lo que sigue es el guion de la hackatón (17 de octubre), con la taxonomía de entonces (permitido, riesgoso, fuera de alcance). Con el R1, el cartel de Black Friday (caso 4) ya no pasa por la agencia: es simple.

Guion de la demo de 3 minutos, los 8 casos que tienen que salir siempre, el plan B y cómo resetear. La demo corre **siempre con el modelo real**: si algo no anda, se dice.

### Antes de empezar (5 minutos antes)

1. `pnpm check`: todo en ✅ salvo audios (opcional).
2. `pnpm demo:reset`: el sitio vuelve al contenido inicial (versión viva en Supabase y, con `GITHUB_MODE=real`, `content/site.json` del repo).
3. Worker vivo: `scripts/run-worker.sh` en una terminal (log en `logs/worker.log`).
4. Pantalla: panel en **En vivo** a la izquierda, el celular espejado a la derecha. El sitio ya está en el iframe del panel.
5. En el celular, el chat del bot abierto y vinculado como cliente (link de invitación del cliente). La agencia vinculada en otro Telegram (o aprobar desde el panel).

### Los 8 casos

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
| 9 | (audio) "subí el pan flauta a 95" | Permitido, igual que el caso 1 | El bot responde "🎙️ subí el pan flauta a 95" y sigue con la captura. Necesita `OPENAI_API_KEY`; sin la clave dice que falta configurar la transcripción |
| 10 | cambiá el título a naranja | Permitido: color del título (contenido, sin agente) | El título cambia en segundos, sin deploy |

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

### Orden de la demo (3 minutos)

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

Probar el audio sin Telegram: `pnpm voice-test "subí el pan flauta a 95" --approve` (genera la voz con `say` y la pasa por el mismo handler del worker).

### Plan B

| Si falla… | Hacé esto |
|---|---|
| Telegram (no llega el mensaje) | `pnpm dry-run "subí el pan flauta a 95" --approve` en una terminal visible: es el mismo pipeline con el modelo real, sin Telegram. Decirlo |
| El worker se cayó | `scripts/run-worker.sh` lo reinicia solo; mirar `logs/worker.log` |
| La captura tarda o falla | El pedido sigue sin foto; se muestra el link de vista previa. `SCREENSHOTS=off` si insiste |
| El modelo no responde | El pedido queda **derivado** ("No pude hacerlo solo…"): mostrarlo como lo que es, no simularlo |
| Commit a GitHub falla | La versión igual queda viva; en el panel aparece "Reintentar commit" |
| El sitio no cambia | Recargar; revisar `data-content-source` en el HTML (tiene que decir `live`) |
| Supabase cae | El sitio cae al archivo local. La demo se corta: decirlo y mostrar el historial y la evaluación |

### Resetear

```bash
pnpm demo:reset              # Supabase + repo del sitio (si GITHUB_MODE=real)
pnpm demo:reset --keep-repo  # solo Supabase
```

No toca contactos ni invitaciones: los chats vinculados siguen vinculados.
