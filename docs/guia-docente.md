# Estiba: guía del docente

**Antes de empezar:** abrí el sitio unos minutos antes (si usás el plan gratis, el servidor puede estar dormido) y tené a mano el **código de sala** (4 dígitos) y el **PIN**.

## Abrir la sala
1. En la laptop abrí `/?sala=XXXX&rol=proyector&publico=<url pública>`: el proyector muestra el **QR** y el código.
2. Los alumnos escanean el QR con el celular, lo ponen en el visor y miran a su alrededor. Si el celular pide permiso de movimiento, **permitir**. En iPhone: «Compartir > Agregar a inicio» para pantalla completa.
3. Docente en el Quest: navegador del visor, `/?sala=XXXX&rol=docente&pin=PIN`, luego **«Entrar en VR»**.
4. Docente en la laptop: la misma dirección, sin visor.
5. **Usá un solo dispositivo de docente a la vez** (Quest o laptop): si los dos mandan comandos juntos, la clase salta de un lado a otro.

## Clase sin internet
1. Router propio encendido; laptop y celulares conectados a él (no hace falta internet).
2. En la laptop: `npm run aula` y escribir el PIN cuando lo pida.
3. Abrir en la laptop la dirección `https://<ip>:8443/?sala=1234&rol=proyector` que imprime la consola. El QR ya apunta a la IP del router.
4. **Cada celular acepta el certificado una sola vez** al abrir el QR. iPhone: «Mostrar detalles» → «visitar este sitio web». Android: «Avanzado» → «Continuar». Después sigue como siempre.
5. Si cambia la IP de la laptop, los celulares tienen que aceptar el certificado otra vez. Si Windows pregunta por el firewall (puerto 8443), «Permitir» en redes privadas.

## Controles del Quest
| Acción | Cómo |
|---|---|
| Resaltar una pieza | Gatillo derecho |
| **Miren acá** (todos giran hacia lo que señalás) | Mantener el gatillo derecho 1 s. Para apagarlo, tocá «Miren acá» en el menú de la muñeca |
| Paso siguiente / anterior | Botón **A** / **B** |
| Menú de la muñeca (mirá la muñeca izquierda) | Traer a todos acá · Miren acá · Reproducir animación · Recentrar a todos · Maqueta en la mesa |
| Maqueta en la mesa (AR) | Botón **«Maqueta en la mesa (AR)»** de la página |

## Controles de la laptop
| Acción | Tecla |
|---|---|
| Paso siguiente / anterior | Flechas |
| Resaltar | Click sobre la pieza |
| Miren acá | **M** + click (otra vez **M** + click en el mismo lugar, o **Esc**, lo apaga) |
| Traer a todos acá | **T** |
| Recentrar a todos | **R** |
| Reproducir la animación del paso | **Espacio** (si el paso no tiene, no pasa nada) |
| Ficha de la pieza | **F** |

## Si algo falla
- **No carga o tarda:** el servidor se estaba despertando; esperá 1 minuto y recargá.
- **«Demasiados intentos, esperá un minuto»:** PIN mal escrito varias veces; esperá y reintentá.
- **Un alumno ve mal o mira para otro lado:** que toque la pantalla (o el botón del Cardboard) para recentrar (o «Recentrar a todos» desde tu menú).
- **Alguien se marea:** que se saque el visor y mire el proyector. No sigas moviendo su vista.
- **Un alumno se desconectó:** que recargue la página; vuelve al mismo paso.
- **El Quest no entra en VR/AR:** usá los botones de la página (no el menú de muñeca).
- **El Quest falla del todo:** pasá a la laptop (modo mouse y teclado), la clase sigue igual.
- **Se cae todo:** proyectá el video de respaldo.
