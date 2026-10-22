# Estiba

Logística portuaria inmersiva para clases. El docente (Meta Quest 3 o laptop) guía una clase en 3D y los alumnos la siguen con el celular en un visor Cardboard. Todo corre en el navegador, sin instalar nada.

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
| Alumno | `/?sala=XXXX&rol=alumno` (agregá `&fps=1` para ver los cuadros por segundo, `&simular=1` para probar con el mouse en la compu) |
| Docente | `/?sala=XXXX&rol=docente&pin=PIN` |
| Proyector | `/?sala=XXXX&rol=proyector&publico=<url pública>` (muestra el QR y el código) |
| Editor | `/editor.html?sala=XXXX&pin=PIN` |

### Probar desde celulares sin publicar (túnel)

```
cloudflared tunnel --url https://localhost:5173 --no-tls-verify
```

Usá la URL `https://...trycloudflare.com` que imprime, y pasala en `publico=` al proyector.

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

## Documentación

- `docs/guia-docente.md`: una página para quien da la clase.
- `docs/preparacion-demo.md`: lista de preparación y guion de 13 minutos para el 5 de noviembre.
- `docs/estiba-prototipo.html`: especificación del prototipo.
