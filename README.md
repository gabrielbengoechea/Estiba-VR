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

Qué configura `render.yaml`: servicio web Node 22, build `npm ci && npm run build`, start `npm start`, `NODE_ENV=production`, `ESTIBA_DETRAS_DE_PROXY=1` y un disco persistente en `/var/data` (variable `ESTIBA_DATOS`) donde se guardan las salas.

- **`ESTIBA_DETRAS_DE_PROXY=1`**: detrás de Render todos llegan con la IP del proxy; con esta variable el límite de intentos de PIN usa la primera IP de `X-Forwarded-For`. Si no está detrás de un proxy, no la pongas (la cabecera se puede falsificar).
- **Planes**: el plan gratis se duerme tras unos 15 minutos sin uso y tarda cerca de 1 minuto en despertar; además no admite disco, así que las salas guardadas se pierden al reiniciar. El disco requiere un plan pago. Para la demo, abrí la URL unos minutos antes de empezar.

## Documentación

- `docs/guia-docente.md`: una página para quien da la clase.
- `docs/preparacion-demo.md`: lista de preparación y guion de 13 minutos para el 5 de noviembre.
- `docs/estiba-prototipo.html`: especificación del prototipo.
