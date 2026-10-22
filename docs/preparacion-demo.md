# Preparación de la demo (5 de noviembre de 2026)

Demo para docentes y jurado. El público hace de alumnos con celulares que llevamos preparados; el docente da una versión corta de la clase.

## Guion: 13 minutos

| Min | Parte | Qué pasa |
|---|---|---|
| 0:00 - 1:00 | Contexto (proyector) | Qué problema resuelve Estiba y sus tres modos. |
| 1:00 - 2:00 | Al visor | Se reparten los celulares con su Cardboard; ya están dentro de la sala. Meta: menos de 1 min hasta que todos estén adentro. |
| 2:00 - 8:00 | La clase (6 min) | Docente con el Quest recorre los 5 pasos: «Traer a todos acá», «Miren acá», ficha de la grúa STS con vista explotada, animación del contenedor. |
| 8:00 - 10:00 | Armar en vivo (2 min) | Desde la laptop (editor) agrega una grúa y alarga un bloque de patio; el cambio aparece en todos los visores. |
| 10:00 - 11:00 | Maqueta en la mesa (1 min) | El docente pasa a AR y la terminal aparece en miniatura sobre una mesa; el proyector lo muestra. |
| 11:00 - 13:00 | Hacia dónde va (2 min) | Alumnos que construyen, otras instalaciones, AR en celulares, con imágenes de concepto. |

## Quién hace qué
- **Claude:** código, escena, fichas y redacción de la guía del docente.
- **El equipo:** probar en el Quest y en los celulares y contar qué ve; conseguir los Cardboard; validar los datos de las fichas; **crear las cuentas de GitHub y de Render** (Claude no puede) y cargar `ESTIBA_PIN` en Render; ensayar y presentar.

## Lista de preparación

Días antes
- [ ] Repositorio en GitHub y servicio en Render creados (ver `README.md`); `ESTIBA_PIN` cargado como secreto.
- [ ] Verificar por HTTPS: un celular y el Quest siguen la clase del sitio publicado.
- [ ] Datos de las fichas validados por el docente (hoy son valores de ejemplo).
- [ ] Ensayo general (día 8) con 5 a 10 personas; anotar problemas en `docs/ensayo.md`.
- [ ] Video de respaldo de la demo grabado (día 9). Versión congelada.

El día
- [ ] 4 a 6 celulares cargados, con Estiba en la pantalla de inicio, permiso de movimiento dado y la escena ya descargada (abrir una vez con buena red).
- [ ] 4 a 6 visores Cardboard limpios.
- [ ] Quest 3 cargado, link guardado, controles emparejados.
- [ ] **Hotspot 4G propio**, aunque el lugar tenga WiFi; celulares y Quest conectados a él.
- [ ] Despertar el servidor ~1 minuto antes (abrir la URL); si el plan es gratis, no se guarda nada entre reinicios.
- [ ] Laptop con el modo docente con mouse (plan B) y el editor abierto en `/editor.html?sala=XXXX&pin=PIN`.
- [ ] Proyector con `rol=proyector` mostrando QR y código; sin aviso de «link local».
- [ ] Video de respaldo abierto en la laptop.
- [ ] Mesa despejada para la maqueta AR.

## Límites conocidos (decirlos con honestidad)
- Las funciones del Quest (VR, AR, menú de muñeca, controles) **no se probaron en un visor real**. El cambio VR/AR desde el menú de muñeca puede requerir el botón de la página.
- La vista con giroscopio **no se midió en celulares reales** (cuadros por segundo, deriva).
- En iPhone hace falta «Agregar a inicio» para pantalla completa.
- El contenedor **no pasa por la puerta (gate)**: no hay modelo de camión.
- Los **datos de las fichas** (capacidades, productividades, medidas) son ejemplos a validar.
- Plan gratis de Render: el servidor se duerme y no hay disco persistente.

## Después del ensayo
Medir: cuadros por segundo en cada celular (30 o más), tiempo entre «pónganse el visor» y todos adentro (menos de 1 min), si alguien se mareó, y el tiempo real de cada parte. Priorizar los problemas para el día 9.
