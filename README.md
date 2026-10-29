# Estiba

Logística portuaria inmersiva para clases. El docente (Meta Quest 3 o laptop) guía una clase en 3D y los alumnos la siguen con el celular en un visor Cardboard. Todo corre en el navegador, sin instalar nada.


## Recorrido en VR (Meta Quest 2 y 3)

Este fork suma un recorrido a pie en realidad virtual. Publicado en **https://gabrielbengoechea.github.io/Estiba-VR/**.

1. En el Quest, abrir la dirección en el navegador del visor y tocar **Entrar en VR** (arriba a la derecha).
2. Antes de empezar aparece un **tutorial ilustrado** con los controles (como en Mission:ISS). Se avanza con el gatillo.
3. Controles: **stick izquierdo** caminar (click: correr) · **stick derecho** girar 30° y, hacia adelante, arco de **teletransporte** · **gatillo** ficha de lo que se apunta · **Y** volver al punto de partida · **B** ver el tutorial de nuevo.
4. Las mallas son colisionables: paredes, estanterías, contenedores y máquinas no se atraviesan (cápsula contra la geometría real con three-mesh-bvh). Si alguien cae al agua o a un vacío, vuelve a tierra firme.
5. Es la **exploración libre** (`?rol=explorar`, y la portada cuando no se indica sala): no necesita servidor ni docente. La clase guiada con salas sigue igual y necesita el servidor (ver más abajo).

Sin visor: botón **A pie** para recorrer en primera persona con W A S D y el mouse, con las mismas colisiones.

Rendimiento en el Quest 2: 72 Hz, renderizado foveado y, dentro del visor, sin posprocesado ni sombras dinámicas.

Para pruebas: `?debug=1` deja el recorrido y la escena en `window.__vr`.

El código del recorrido está en `src/client/vr/` (tutorial, mundo de colisión, jugador, locomoción) y tiene sus pruebas en `fisica.test.ts`.

## Desarrollo local

Requiere Node 22.

```
npm ci
npm run dev:server     # servidor de salas en el puerto 8787 (PIN de desarrollo: 0000)
npm run dev:web        # app en https://localhost:5173 (HTTPS: giroscopio y WebXR lo exigen)
npm test               # tests
npx tsc --noEmit       # tipos
npm run build          # genera dist/
npm start              # sirve dist/ y /ws (producción)
```

`npm run dev:web:http` levanta la app sin HTTPS, solo para probar en la misma máquina.
`npm run modelos` regenera los modelos con Blender (ver `tools/blender/`).

### Direcciones

Reemplazá `XXXX` por el código de sala (4 dígitos) y `PIN` por el PIN.

| Rol | Dirección |
|---|---|
| Alumno | `/?sala=XXXX&rol=alumno` (agregá `&fps=1` para ver los cuadros por segundo, `&simular=1` para probar con el mouse en la compu, `&sombras=0` para apagar las sombras y bajar la resolución en celulares lentos) |
| Docente | `/?sala=XXXX&rol=docente&pin=PIN` |
| Proyector | `/?sala=XXXX&rol=proyector&publico=<url pública>` (muestra el QR y el código) |
| Editor | `/editor.html?sala=XXXX&pin=PIN` (también sirve `/?sala=XXXX&rol=editor&pin=PIN`, que redirige) |

### Probar desde celulares sin publicar (túnel)

```
cloudflared tunnel --url https://localhost:5173 --no-tls-verify
```

Usá la URL `https://...trycloudflare.com` que imprime, y pasala en `publico=` al proyector.

## Clase sin internet

Una laptop y un router alcanzan: la laptop sirve la app por HTTPS en la red local (los celulares necesitan HTTPS para el giroscopio). No usa internet ni Render.

1. Conectar la laptop y los celulares al mismo router (sin internet está bien).
2. En la laptop: `npm run aula` (compila y arranca). Si `ESTIBA_PIN` no está definido, pide el PIN por consola; no se muestra ni se guarda.
3. La consola imprime las direcciones `https://<ip>:8443/?sala=1234&rol=proyector`. Abrir esa en la laptop (o `https://localhost:8443/...`): el QR usa solo la IP de la red.
4. Cada celular acepta el certificado una vez (es autofirmado, se genera en `data/`). iPhone: «Mostrar detalles» → «visitar este sitio web».

Android: «Avanzado» → «Continuar». Si la IP de la laptop cambia (otra red o router), los celulares deben aceptar el certificado de nuevo. Windows puede pedir permiso de firewall para el puerto 8443: «Permitir» en redes privadas.

Puerto por defecto 8443 (`PORT` lo cambia). El servidor informa sus URL en `GET /api/red`.

## Publicación en Render

Claude no puede crear cuentas: lo hace el equipo.

1. Crear el repositorio en GitHub y subir el código (`git remote add origin ...` y `git push`).
2. Crear una cuenta en [render.com](https://render.com) y elegir **New > Blueprint**; conectar el repositorio. Render lee `render.yaml`.
3. Cuando lo pida, cargar `ESTIBA_PIN` (el PIN real de la clase). Es un secreto: no va en el repositorio. En producción el servidor no arranca sin él.
4. Esperar el primer despliegue y abrir la URL `https://estiba.onrender.com` (o la que asigne Render).
5. Verificar: un celular y el Quest entran por HTTPS a `/?sala=XXXX&rol=alumno` y `/?sala=XXXX&rol=docente&pin=PIN` y siguen la clase.

Qué configura `render.yaml`: servicio web Node 22, build `npm ci --include=dev && npm run build` (Render instala con `NODE_ENV=production`, que omite las devDependencies; `vite` hace falta para el build), start `npm start`, `NODE_ENV=production`, `ESTIBA_DETRAS_DE_PROXY=1`, `ESTIBA_PROXIES=1` y un disco persistente en `/var/data` (variable `ESTIBA_DATOS`) donde se guardan las salas.

- **IP detrás del proxy**: en Render todos llegan con la IP del proxy, y el límite de intentos de PIN va por IP. Con `ESTIBA_DETRAS_DE_PROXY=1` el servidor usa la entrada de `X-Forwarded-For` que está N-ésima **desde la derecha** (`ESTIBA_PROXIES`, por defecto 1), porque cada proxy agrega al final la IP que ve y lo de la izquierda lo puede falsificar cualquiera. Sin la variable, la cabecera se ignora.
  - Cómo verificar N en Render: desplegar con un `console.log(req.headers['x-forwarded-for'])` temporal en `server/servidor.ts`, hacer `curl -H "X-Forwarded-For: 1.2.3.4" https://<servicio>.onrender.com/` y mirar el log: la IP real de quien llama tiene que ser la entrada N-ésima desde la derecha (con un solo proxy, la última, N=1). Si hay más proxies (por ejemplo un CDN delante), subí `ESTIBA_PROXIES`. Después sacá el log.
- **Planes**: este blueprint usa un plan pago (`starter`) porque el disco persistente lo exige; ese plan no se duerme. En el plan gratis hay que borrar el bloque `disk` y `ESTIBA_DATOS` de `render.yaml` (las salas guardadas se pierden al reiniciar) y el servidor se duerme tras unos 15 minutos sin uso: abrí la URL ~1 minuto antes de la clase.

## Página en Vercel (servidor en Render)

Vercel solo sirve la página: no puede mantener el WebSocket abierto ni guardar salas, así que el servidor sigue en Render (sección anterior). La página de Vercel se conecta a él. Claude no puede crear cuentas: lo hace el equipo.

1. Tener el servidor andando en Render y anotar su URL, por ejemplo `https://estiba-xxxx.onrender.com`.
2. En [vercel.com](https://vercel.com), **Add New > Project** e importar el repositorio de GitHub. Vercel lee `vercel.json` (build `npm run build`, salida `dist`; `/editor` sirve `editor.html`).
3. En **Settings > Environment Variables** del proyecto de Vercel, agregar `VITE_ESTIBA_SERVIDOR` = la URL de Render (sin barra final). Se usa al compilar: después de cambiarla hay que volver a desplegar (**Deployments > Redeploy**).
4. En Render, en **Environment** del servicio, agregar `ESTIBA_ORIGENES` = la URL que asignó Vercel, por ejemplo `https://estiba-vr.vercel.app` (varias, separadas por comas). Permite que la página de Vercel mande sus errores a `/api/errores`.
5. Verificar: abrir `https://<proyecto>.vercel.app/?sala=1234&rol=alumno` en un celular y la del docente en otro dispositivo; el alumno tiene que seguir la clase. Si el indicador de conexión queda en aviso, revisar `VITE_ESTIBA_SERVIDOR` y que el servidor de Render esté despierto (en el plan gratis se duerme: abrí su URL un minuto antes).

Cada `git push` a `main` vuelve a desplegar la página en Vercel; el servidor de Render se despliega por su lado.

## Documentación

- `docs/guia-docente.md`: una página para quien da la clase.
- `docs/preparacion-demo.md`: lista de preparación y guion de 13 minutos para el 5 de noviembre.
- `docs/estiba-prototipo.html`: especificación del prototipo.
