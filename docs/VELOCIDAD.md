# Velocidad

Mediciones con el dry-run real (`pnpm dry-run`, 17/10/2026): Supabase por HTTPS, modelo real (Sonnet 5.5 para interpretar), GitHub real (salvasecco/walt-demo), capturas con Playwright y Vercel real. Cada paso: duración del paso · segundo en que terminó, contado desde que arranca el dry-run (el mensaje del cliente entra en +0,7 a +1,2 s). Los botones los aprieta el dry-run apenas el paso anterior termina.

Cómo repetirlo:

```bash
pnpm demo:reset --keep-repo
pnpm dry-run "subí el pan flauta a 95" --undo                                   # (a)
pnpm dry-run "cambiá el título a naranja" --undo                                # (b) después; antes: --agency --undo
pnpm dry-run "agregá un aviso de envío gratis arriba del footer" --agency --undo  # (c)
```

Al final el dry-run imprime "Pasos (duración · terminó en)".

## (a) Contenido: "subí el pan flauta a 95", aprobar y volver atrás

| Paso | Antes | Después |
|---|---|---|
| recibido ("Recibido, ya lo veo") | 0,7 s · +2,0 | 0,2 s · +1,6 |
| interpretado | 2,6 s · +7,2 | 2,1 s · +5,2 |
| decidido (gate + reglas) | 0,2 s · +8,7 | 0,0 s · +5,4 |
| borrador | 0,4 s · +9,9 | 0,2 s · +5,8 |
| captura | 2,0 s · +12,3 | 0,9 s · +6,7 |
| vista previa enviada ("¿Así?") | +12,9 | **+6,7** |
| aprobado → "Listo, ya está publicado" | 3,6 s (+13,3 → +16,9) | 2,0 s (+7,9 → +9,9) |
| publicado | 1,7 s · +16,7 | 0,6 s · +9,7 |
| commit del JSON | 1,5 s · +19,0 (bloquea la cola) | 1,3 s · +11,4 (de fondo) |
| volver atrás → "Listo, volvió" | 2,2 s | 1,9 s |
| revertido | 1,0 s · +21,4 | 0,8 s · +13,5 |
| en la web | al instante (realtime) | al instante (realtime) |
| build de Vercel por cada commit de contenido | 9,8–11,5 s (inútil) | ninguno (salteado en ~1 s) |
| **total del dry-run** | **24,1 s** | **16,0 s** |

## (b) "cambiá el título a naranja"

Antes salía por el **carril de código** (no había color de título en el contrato): la agencia aprobaba, el agente (Opus) editaba `Site.tsx`, PR, vista previa, merge y deploy. Después sale por **contenido**: `set_color title #EA580C`, permitido.

| Paso | Antes (código, `--agency --undo`) | Después (contenido, `--undo`) |
|---|---|---|
| recibido | 0,7 s · +2,1 | 0,3 s · +1,6 |
| interpretado | 4,8 s · +9,5 | 1,9 s · +5,0 |
| decidido | +10,5 (riesgoso/código) | +5,3 (permitido) |
| borrador | — | 0,3 s · +5,7 |
| captura | — | 0,9 s · +6,6 |
| aviso a la agencia / vista previa al cliente | +11,9 | **+6,6** |
| aprobado (agencia / cliente) | +13,3 | +8,6 |
| agente (clon + modelo) | 21,0 s (1,0 + 20,0; Opus, 6 turnos) | — |
| PR | 3,4 s | — |
| vista previa del PR | 22,9 s · +61,9 | — |
| publicado | 2,9 s · +67,2 (merge) | 0,7 s · +9,7 |
| en la web | 16,7 s · **+84,5** (deploy) | **+9,7** (realtime, sin build) |
| revertido | 2,9 s · +89,5 | 0,9 s · +13,9 |
| en la web tras revertir | 22,3 s · +112,4 | al instante |
| **total del dry-run** | **113,5 s** | **16,1 s** |

## (c) Código: "agregá un aviso de envío gratis arriba del footer", aprobado por la agencia

| Paso | Antes | Después |
|---|---|---|
| recibido | 1,7 s · +4,3 | 0,3 s · +1,7 |
| interpretado | 2,2 s · +9,8 | 2,0 s · +5,1 |
| decidido | +11,1 | +5,3 |
| aviso a la agencia | +13,3 | +5,8 |
| aprobado por la agencia | +15,0 | +7,6 |
| agente (clon + modelo) | 19,8 s (1,4 + 18,3; Opus, 6 turnos, USD 0,082) | **8,3 s** (1,0 + 7,3; Sonnet, 4 turnos, USD 0,033) |
| PR | 4,3 s | 2,7 s |
| vista previa del PR | 12,7 s · +53,5 | 12,5 s · +31,6 |
| publicado (merge) | 2,7 s · +59,3 | 2,7 s · +37,1 |
| en la web | 16,9 s · +77,1 | 12,2 s · +49,5 |
| revertido | 3,6 s · +82,5 | 3,2 s · +54,3 |
| en la web tras revertir | 17,4 s · +100,9 | 15,7 s · +70,2 |
| **total del dry-run** | **101,7 s** | **70,9 s** |

## Builds de Vercel (`vercel ls` / `vercel inspect`, de buildingAt a ready)

| Proyecto | Antes | Después |
|---|---|---|
| walt-demo, commit de código | 9,3–14,5 s (TypeScript 2,1 s dentro del build) | 6,9–9,2 s ("Skipping validation of types") |
| walt-demo, commit solo de contenido | 9,8–11,5 s | salteado (`ignoreCommand`, CANCELED en ~1,1 s) |
| walt-panel | 19,4–30,0 s (TypeScript 3,7 s) | 15,7 s (preview por CLI; "Build Completed" 5 s contra 9 s) |
| walt-panel, push que no toca el panel ni core | buildeaba igual | salteado (`apps/panel/vercel.json`) |

## Qué cambió

1. **Contrato de contenido más amplio** (`packages/core` y walt-demo): `theme.title`, `theme.button`, `theme.buttonText` y `theme.text` como colores editables; títulos y subtítulos de productos, horarios y contacto (`headings`), título de "quiénes somos" y dirección. "Cambiá el título a naranja" y "poné los botones en verde" ya no pasan por el agente. Gate de contraste por pares: texto/fondo 4,5:1, título/fondo 3:1 (texto grande), texto del botón/botón 4,5:1. Prompt de interpretación v4.
2. **walt-demo `vercel.json`**: `ignoreCommand` saltea el build si el commit solo toca `content/` o `walt.config.json`. Verificado: los 6 commits de contenido de las mediciones quedaron CANCELED en ~1 s; el commit de código y los merges del agente buildearon.
3. **Builds sin chequeo de tipos** (`typescript.ignoreBuildErrors`) en el sitio y el panel. Next 16.4 ya no lintea en `next build`; la caché de Turbopack para builds viene activada y Vercel restaura la caché del build anterior. Tipos y lint siguen en `pnpm typecheck` y en `ci/github-actions.yml` (se agregó `pnpm --filter @walt/panel lint`). El panel además saltea el build si el push no toca `apps/panel`, `packages/core` ni el lockfile.
4. **Agente**: `claude-sonnet-5-5` por defecto (también en `~/.walt/.env`), 15 turnos como tope (usaba 5–6), y reintento con `claude-opus-5-5` solo si Sonnet falla (error, sin cambios o diff rechazado por la revisión), desde un clon limpio y dentro del mismo tiempo total.
5. **Capturas**: el navegador de Playwright se abre al arrancar el worker y queda abierto (un contexto y una página por captura), se relanza si se cae y se cierra en `close()`. `load` + fuentes en vez de `networkidle` (que siempre espera 500 ms más). 2,0 → 0,9 s.
6. **Otras ganancias baratas del worker**: las lecturas antes de interpretar (contacto, proyecto, contrato del sitio, versión viva, reglas, historial, cupo) van en paralelo; eventos y mensajes salientes se guardan en una cadena ordenada que no bloquea el pedido (cada escritura a Supabase es ~0,2 s); el commit del JSON va de fondo y en orden (la versión ya está viva); el contrato del sitio se cachea y se refresca de fondo; la publicación lee en paralelo; el sondeo del deploy baja de 5 a 2 s y el de la vista previa de 10 a 3 s.

## Qué falta o no se pudo medir igual

- La vista previa del PR depende del build de Vercel de la rama (~7–12 s + cola); no se tocó.
- "En la web" del carril de código depende del build de producción y de la cola de Vercel; con 2 s de sondeo se ve apenas termina.
- El panel en Vercel no buildea ramas: la medición "después" es un preview por CLI desde la rama `velocidad`.
