# Estiba — Prototipo 1: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una app web donde un docente (Meta Quest 3 o laptop) da una clase guiada dentro de una terminal de contenedores en 3D, los alumnos la siguen con el celular en un Cardboard, y el docente puede armar y modificar la escena y los pasos desde un editor en la laptop, con los cambios en vivo para todos.

**Architecture:** Un solo código TypeScript con tres formas de verse (WebXR en el Quest, vista doble propia con giroscopio en celulares, vista normal en laptop/proyector) más un editor. Un servidor Node con WebSocket guarda el estado de cada sala y lo reenvía; el docente manda. El estado de la sala se calcula con un reductor puro compartido entre cliente y servidor. Las escenas son módulos sobre una grilla (JSON); las piezas complejas vienen de scripts de Blender (`.glb`) y las paramétricas se generan en el navegador.

**Tech Stack:** TypeScript 5.6, Vite 5.4, three.js 0.169.0, troika-three-text 0.52.0, Node 22 + ws 8.18, tsx 4.19, Vitest 2.1, qrcode 1.5.4, Blender 5.2 (scripts en `tools/blender/`).

**Spec:** `docs/estiba-prototipo.html` (publicado en https://claude.ai/artifact/1YQmEg4ygCzQDJhRdXGgno, versión 4). La prueba de estilo aprobada está en `spike/` (`spike/gen_models.py`, `spike/index.html`).

## Global Constraints

- Toda la interfaz y los textos visibles en español rioplatense neutro.
- three.js fijo en `0.169.0`; ninguna dependencia sin versión exacta en `package.json`.
- HTTPS obligatorio en todo lo que corra en dispositivos (giroscopio y WebXR lo exigen).
- Celulares (iPhone y Android): siempre la vista doble propia con giroscopio; nunca WebXR en celulares. WebXR solo en el Quest.
- Presupuesto de rendimiento en celulares: menos de 100.000 triángulos a la vista, descarga total menor a 15 MB, objetivo 60 cuadros/s, nunca menos de 30.
- Nunca girar la cámara del alumno por él. Todo cambio de posición del alumno ocurre con fundido a negro de 0,3 s; nada de desplazamientos continuos.
- Elegir con la mirada: el objeto se muestra tras 1,5 s con la retícula encima.
- Texto dentro del visor: altura equivalente a 40 px o más; títulos cortos.
- Recentrado automático cuando el celular queda quieto unos 2 s tras entrar; botón «Recentrar» siempre disponible.
- Hasta 30 celulares por sala. Pose del docente 20 veces por segundo. Código de sala de 4 dígitos; docente y editor se autentican con PIN.
- Unidades en metros y medidas reales: contenedor de 40' 12,19 × 2,44 × 2,59; de 20' 6,06 × 2,44 × 2,59.
- Estilo «maqueta técnica» low-poly con la paleta de `spike/gen_models.py`. Ningún modelo, textura ni texto copiado de productos comerciales.
- Cada commit termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Un alumno que entra tarde o se reconecta a mitad de una animación ve el mismo paso, la misma ubicación y el contenedor en el mismo punto que el resto (tests en Task 4 y Task 13).
- El docente con dos dispositivos a la vez (Quest + editor en la laptop) manda comandos casi simultáneos: el servidor los aplica en orden, la `version` siempre sube y nadie queda con un estado viejo (tests en Task 3 y Task 4).
- Un mensaje malformado, o un alumno que intenta mandar un comando de docente, se ignora sin tirar el servidor ni a los demás clientes (tests en Task 4).
- El editor borra un módulo que está resaltado o que un paso referencia: el resaltado se limpia y los pasos dejan de referenciarlo, sin errores en ningún cliente (test en Task 3).
- El alumno niega el permiso de movimiento o tiene el celular en vertical: ve un mensaje claro en español que le dice qué hacer, nunca una pantalla negra (test en Task 2).

---

## Estructura de archivos

```
package.json  tsconfig.json  vite.config.ts  index.html  editor.html  .gitignore  README.md
src/shared/   tipos.ts  grilla.ts  sala.ts  protocolo.ts  colores.ts        (cliente y servidor)
src/client/   main.ts  red.ts  reloj.ts
  vistas/     orientacion.ts  estereo.ts  entrada.ts  escritorio.ts  xr.ts  ar.ts
  escena/     catalogo.ts  parametricos.ts  construirEscena.ts  ambiente.ts
  clase/      reproductor.ts  transiciones.ts  mirada.ts  fichas.ts  explotada.ts  animaciones.ts
  docente/    puntero.ts  menuMuneca.ts
  editor/     editor.ts  herramientas.ts  panelParametros.ts  pasos.ts
server/       index.ts  salas.ts
public/       modelos/*.glb  escenas/terminal-a.json  clases/terminal-contenedores.json  fichas/*.json
tools/blender/gen_modelos.py
data/         (estado guardado de las salas; en .gitignore)
```

Los tests de Vitest viven junto al archivo que prueban (`*.test.ts`). Lo visual se verifica con capturas desde el navegador integrado (`npm run dev` + preview) y con la lista de chequeo en dispositivos de cada punto de control.

---

### Task 1: Proyecto base, tipos compartidos y grilla

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/shared/tipos.ts`, `src/shared/grilla.ts`, `src/shared/colores.ts`, `src/client/main.ts`
- Test: `src/shared/grilla.test.ts`

**Interfaces:**
- Produces (`src/shared/tipos.ts`):
  ```ts
  export type Vec3 = [number, number, number];
  export type Quat = [number, number, number, number];
  export type Rol = 'docente' | 'alumno' | 'proyector' | 'editor';
  export type TipoModulo = 'muelle' | 'grua-sts' | 'buque' | 'tractor' | 'bloque-patio' | 'grua-rtg' | 'puerta' | 'via' | 'tren' | 'deposito';
  export interface Modulo { id: string; tipo: TipoModulo; celda: [number, number]; rot: 0 | 90 | 180 | 270; params?: Record<string, number>; nombre?: string }
  export interface Vista { pos: Vec3; mira: Vec3 }
  export interface Escena { metrosPorCelda: number; modulos: Modulo[]; vistas: Record<string, Vista> }
  export interface Paso { id: string; titulo: string; vista: string; resaltar: string[]; animacion?: string; ficha?: string }
  export interface Clase { id: string; titulo: string; escena: string; pasos: Paso[] }
  export interface Ficha { id: string; titulo: string; texto: string; datos: { etiqueta: string; valor: string }[]; explotada?: 'grua-sts'; ejemplo?: boolean }
  export interface Ubicacion { pos: Vec3; mira: Vec3; seq: number }
  export interface EstadoSala {
    version: number; escena: Escena; clase: Clase; paso: number;
    ubicacion: Ubicacion; resaltado: string | null; fichaAbierta: string | null;
    mirenAca: Vec3 | null; animacion: { id: string; inicio: number } | null; recentrar: number;
  }
  ```
- Produces (`src/shared/grilla.ts`): `celdaAMundo(celda: [number, number], m: number): Vec3` → `[col*m, 0, fila*m]`; `mundoACelda(p: Vec3, m: number): [number, number]` (redondeo a la celda más cercana).
- Produces (`src/shared/colores.ts`): `PALETA` con los hex de `spike/gen_models.py` (`contenedores: string[]` de 8 colores en el mismo orden, `pesosContenedores: number[]` = `[3,3,2,2,2,1,2,2]`, `gruaAzul`, `blanco`, `oscuro`, `amarillo`, `vidrio`).

- [ ] **Step 1:** `git init`, `npm init -y`; instalar dependencias con versión exacta (`three@0.169.0 @types/three@0.169.0 troika-three-text@0.52.0 ws@8.18.0 qrcode@1.5.4` y de desarrollo `typescript@5.6.3 vite@5.4.10 vitest@2.1.4 tsx@4.19.2 @types/ws@8.5.13 @types/qrcode@1.5.5 @types/node@22.9.0 @vitejs/plugin-basic-ssl@1.1.0`). Scripts: `dev:web` (`vite`) y `dev:server` (`tsx watch server/index.ts`), que se corren en dos terminales; `build` (`vite build`), `start` (`tsx server/index.ts`), `test` (`vitest run`), `modelos` (Blender, Task 6). `vite.config.ts`: dos entradas (`index.html`, `editor.html`), HTTPS con `basicSsl()`, `server.host: true`, proxy de `/ws` a `ws://localhost:8787` con `ws: true`. `.gitignore`: `node_modules`, `dist`, `data`.
- [ ] **Step 2: Write the failing test** `grilla.test.ts`: `celdaAMundo([3, 2], 10)` es `[30, 0, 20]`; `mundoACelda([31, 0, 18], 10)` es `[3, 2]`; ida y vuelta de `[0,0]` y `[12,7]` devuelve la misma celda.
- [ ] **Step 3:** Run `npx vitest run src/shared/grilla.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 4:** Implementar `tipos.ts`, `grilla.ts`, `colores.ts`; `main.ts` lee `?sala=` y `?rol=` y por ahora muestra el rol en pantalla.
- [ ] **Step 5:** Run `npx vitest run` → PASS. Run `npm run dev:web` y abrir `https://localhost:5173/?sala=1234&rol=alumno` → se ve «alumno».
- [ ] **Step 6:** Commit `feat: proyecto base, tipos compartidos y grilla`.

### Task 2: Orientación, vista doble y pantalla de entrada del alumno

**Files:**
- Create: `src/client/vistas/orientacion.ts`, `src/client/vistas/estereo.ts`, `src/client/vistas/entrada.ts`
- Test: `src/client/vistas/orientacion.test.ts`, `src/client/vistas/entrada.test.ts`

**Interfaces:**
- Consumes: `Quat`, `Vec3` (Task 1).
- Produces:
  - `orientacionAQuat(alpha: number, beta: number, gamma: number, orientPantalla: number): Quat` — grados; misma convención que `DeviceOrientationControls` de three (Euler `YXZ` con `(beta, alpha, -gamma)`, luego −90° en X, luego `-orientPantalla` en Z).
  - `guiñada(q: Quat): number` — rotación alrededor de Y en radianes.
  - `estaQuieto(muestras: { t: number; q: Quat }[], ventanaMs: number, umbralGrados: number): boolean` — verdadero si en los últimos `ventanaMs` el ángulo entre cualquier muestra y la última no supera el umbral. Se usa con `ventanaMs = 2000`, `umbralGrados = 3`.
  - `estadoEntrada(permiso: 'concedido' | 'denegado' | 'pendiente', vertical: boolean): { listo: boolean; mensaje: string | null }`.
  - `class VistaEstereo { constructor(renderer: THREE.WebGLRenderer); render(escena: THREE.Scene, cabeza: THREE.Camera): void; separacionOjos: number }` — `THREE.StereoCamera`, separación por defecto `0.064`, FOV 80°, una mitad de pantalla por ojo (como `spike/index.html`).
  - `class OrientacionAlumno { pedirPermiso(): Promise<'concedido' | 'denegado'>; quat(): Quat; recentrar(): void }` — aplica el desfase de guiñada guardado por `recentrar()` y hace el recentrado automático con `estaQuieto` una sola vez tras entrar. Tocar la pantalla (o el botón del Cardboard, que toca la pantalla) llama a `recentrar()`: es el botón «Recentrar» del alumno.
  - `mostrarEntrada(contenedor: HTMLElement, alEntrar: () => void): void` — botón grande «Entrar a la clase»; en iOS llama a `DeviceOrientationEvent.requestPermission()` dentro del clic; intenta pantalla completa y Wake Lock, tolerando que fallen.

- [ ] **Step 1: Write the failing tests** `orientacion.test.ts`: `orientacionAQuat(0, 90, 0, 0)` ≈ `[0, 0, 0, 1]` (celular vertical mirando al horizonte); `orientacionAQuat(90, 90, 0, 0)` ≈ `[0, Math.SQRT1_2, 0, Math.SQRT1_2]`; `guiñada` de este último ≈ `Math.PI / 2`; `estaQuieto` con muestras idénticas durante 2100 ms → `true`; con un salto de 10° a los 1500 ms → `false`; con solo 1000 ms de muestras → `false`. `entrada.test.ts`: `estadoEntrada('denegado', false).mensaje` es `'Sin permiso de movimiento no podemos seguir tu cabeza. Tocá «Entrar» de nuevo y elegí «Permitir».'`; `estadoEntrada('concedido', true).mensaje` es `'Girá el celular y ponelo en el visor.'`; `estadoEntrada('concedido', false)` es `{ listo: true, mensaje: null }`.
- [ ] **Step 2:** Run `npx vitest run src/client/vistas` → FAIL.
- [ ] **Step 3:** Implementar `orientacion.ts`, `entrada.ts` y `estereo.ts`. Escena provisoria: cargar los `.glb` de `spike/assets/` copiados a `public/modelos/` para tener algo que mirar; retícula en el centro de cada ojo.
- [ ] **Step 4:** Run `npx vitest run src/client/vistas` → PASS.
- [ ] **Step 5:** Verificar en el navegador integrado con `?rol=alumno`: se ve la entrada; tras «Entrar», la vista doble (en escritorio sin giroscopio, la cámara queda fija). Captura.
- [ ] **Step 6:** Commit `feat: vista doble con giroscopio y entrada del alumno`.

### Task 3: Reductor de la sala

**Files:**
- Create: `src/shared/sala.ts`
- Test: `src/shared/sala.test.ts`

**Interfaces:**
- Consumes: tipos de Task 1.
- Produces:
  ```ts
  export type OpEscena =
    | { op: 'agregar'; modulo: Modulo } | { op: 'mover'; id: string; celda: [number, number] }
    | { op: 'girar'; id: string } | { op: 'borrar'; id: string }
    | { op: 'params'; id: string; params: Record<string, number> };
  export type OpClase =
    | { op: 'agregarPaso'; paso: Paso; despuesDe: number } | { op: 'editarPaso'; indice: number; cambios: Partial<Paso> }
    | { op: 'borrarPaso'; indice: number } | { op: 'guardarVista'; id: string; vista: Vista };
  export type Comando =
    | { t: 'siguiente' } | { t: 'anterior' } | { t: 'irA'; paso: number }
    | { t: 'resaltar'; id: string | null } | { t: 'ficha'; id: string | null }
    | { t: 'mirenAca'; pos: Vec3 | null } | { t: 'traer'; pos: Vec3; mira: Vec3 }
    | { t: 'animar'; id: string } | { t: 'recentrar' }
    | { t: 'escena'; op: OpEscena } | { t: 'clase'; op: OpClase };
  export function estadoInicial(escena: Escena, clase: Clase): EstadoSala;
  export function aplicarComando(e: EstadoSala, c: Comando, ahora: number): EstadoSala;
  ```
  Reglas: función pura; todo comando que cambia algo devuelve un objeto nuevo con `version + 1`; un comando sin efecto devuelve el mismo objeto. Al cambiar de paso: `ubicacion` = la vista del paso con `seq + 1`, `resaltado` = primer id de `resaltar` o `null`, `fichaAbierta` = `ficha` del paso o `null`, `mirenAca` = `null`, `animacion` = `{ id, inicio: ahora }` si el paso tiene animación, si no `null`. `traer` fija `ubicacion` con `seq + 1`. `recentrar` incrementa `recentrar`. `girar` suma 90° módulo 360. `borrar` quita el módulo, limpia `resaltado` si era ese, y lo saca de `resaltar` de todos los pasos. `irA`/`siguiente`/`anterior` fuera de rango no hacen nada.

- [ ] **Step 1: Write the failing tests** (`sala.test.ts`, con una escena de 3 módulos y una clase de 3 pasos de prueba):
  - `siguiente` desde el paso 0 deja `paso` en 1, `ubicacion` igual a la vista del paso 1, `ubicacion.seq` +1 y `version` +1.
  - `anterior` en el paso 0 devuelve el mismo objeto (`toBe`).
  - un paso con `animacion: 'descarga-ciclo'` deja `animacion` en `{ id: 'descarga-ciclo', inicio: ahora }`.
  - `traer` cambia `ubicacion.pos` y sube `seq`, sin cambiar `paso`.
  - `escena/girar` sobre `rot: 270` deja `rot: 0`.
  - `escena/borrar` de un módulo resaltado y presente en `resaltar` del paso 2 deja `resaltado: null` y quita el id del paso 2.
  - `escena/agregar` con un id repetido devuelve el mismo objeto.
  - `clase/agregarPaso` con `despuesDe: 0` lo inserta en la posición 1; `clase/borrarPaso` del paso actual cuando es el último deja `paso` en el nuevo último índice.
  - 50 comandos alternados aplicados en orden dejan `version` estrictamente creciente.
- [ ] **Step 2:** Run `npx vitest run src/shared/sala.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `sala.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: reductor puro del estado de la sala`.

### Task 4: Protocolo y servidor de salas

**Files:**
- Create: `src/shared/protocolo.ts`, `server/salas.ts`, `server/index.ts`
- Test: `src/shared/protocolo.test.ts`, `server/salas.test.ts`

**Interfaces:**
- Consumes: `Comando`, `aplicarComando`, `estadoInicial` (Task 3).
- Produces (`protocolo.ts`):
  ```ts
  export type MsgCliente =
    | { t: 'unirse'; sala: string; rol: Rol; pin?: string }
    | { t: 'comando'; c: Comando }
    | { t: 'pose'; cabeza: { pos: Vec3; quat: Quat }; rayo: { origen: Vec3; dir: Vec3 } | null }
    | { t: 'ping'; tc: number };
  export type MsgServidor =
    | { t: 'estado'; e: EstadoSala; ts: number }
    | { t: 'pose'; cabeza: { pos: Vec3; quat: Quat }; rayo: { origen: Vec3; dir: Vec3 } | null }
    | { t: 'pong'; tc: number; ts: number }
    | { t: 'error'; motivo: string };
  export function leerMsgCliente(texto: string): MsgCliente | null; // null si no es JSON o no cumple la forma
  ```
- Produces (`server/salas.ts`): `class Salas { constructor(opts: { pin: string; dirDatos: string; contenidoPorDefecto: () => { escena: Escena; clase: Clase } }); conectar(ws: WebSocket): void }`. Reglas: el primer mensaje debe ser `unirse` con código de 4 dígitos; `docente` y `editor` requieren `pin` correcto (si no: `error` `'PIN incorrecto'` y cierre); al unirse se envía el `estado` completo; `comando` y `pose` solo se aceptan de `docente`/`editor`; cada comando se aplica con `aplicarComando(e, c, Date.now())` y, si cambió la versión, se reenvía `estado` a todos; `pose` se reenvía a todos menos al emisor; `ping` → `pong`; máximo 40 conexiones por sala; cada cambio de `escena` o `clase` se guarda en `data/<sala>.json` y al crear una sala se carga de ahí si existe.
- Produces (`server/index.ts`): servidor HTTP en `PORT` (por defecto `8787`) que sirve `dist/` y acepta WebSocket en `/ws`. PIN desde la variable de entorno `ESTIBA_PIN` (por defecto `'0000'` solo en desarrollo, con aviso en consola).

- [ ] **Step 1: Write the failing tests** `protocolo.test.ts`: `leerMsgCliente('no es json')` → `null`; `leerMsgCliente('{"t":"comando","c":{"t":"volar"}}')` → `null`; un `unirse` válido se devuelve tal cual; un `pose` con `pos` de 2 números → `null`.
  `salas.test.ts` (servidor real en puerto aleatorio, clientes `ws`): un alumno que se une recibe un `estado` con `version` 0; un alumno que manda `{t:'comando',c:{t:'siguiente'}}` no cambia nada; un docente con PIN malo recibe `error` `'PIN incorrecto'`; el docente manda `siguiente` y dos alumnos reciben `estado` con `paso: 1`; un alumno que se une después del `siguiente` recibe directamente `paso: 1`; un mensaje basura de un alumno no corta la conexión de los demás; docente y editor mandan 20 comandos intercalados y el último `estado` que reciben todos tiene la misma `version`, igual a la cantidad de comandos con efecto; tras un `escena/agregar`, existe `data/<sala>.json` y un `Salas` nuevo sobre el mismo directorio arranca con ese módulo.
- [ ] **Step 2:** Run `npx vitest run src/shared/protocolo.test.ts server` → FAIL.
- [ ] **Step 3:** Implementar `protocolo.ts`, `salas.ts`, `index.ts`. Contenido por defecto: leer `public/escenas/terminal-a.json` y `public/clases/terminal-contenedores.json` (en este task, versiones mínimas de 2 módulos y 2 pasos; Task 8 las completa).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: servidor de salas con WebSocket`.

### Task 5: Conexión del cliente y reloj compartido

**Files:**
- Create: `src/client/red.ts`, `src/client/reloj.ts`
- Test: `src/client/reloj.test.ts`

**Interfaces:**
- Consumes: `MsgCliente`, `MsgServidor` (Task 4).
- Produces:
  - `estimarDesfase(muestras: { tc: number; ts: number; tr: number }[]): number` — desfase servidor − cliente en ms, tomando la muestra de menor ida y vuelta (`tr - tc`) y suponiendo latencia simétrica.
  - `class Reloj { ahoraServidor(): number }` — hace 5 pings al conectar y uno cada 10 s.
  - `class ConexionSala { constructor(sala: string, rol: Rol, pin?: string); alEstado(fn: (e: EstadoSala) => void): void; alPose(fn: (p: MsgServidor & { t: 'pose' }) => void): void; enviar(c: Comando): void; enviarPose(p: Omit<MsgCliente & { t: 'pose' }, 't'>): void; reloj: Reloj; conectado: boolean }` — URL `wss://<host>/ws`; reconexión con espera 0,5 s, 1 s, 2 s, tope 5 s; al reconectar vuelve a mandar `unirse`. `enviarPose` limita a 20 por segundo.

- [ ] **Step 1: Write the failing test** `reloj.test.ts`: con muestras `{tc:0, ts:1050, tr:100}` y `{tc:200, ts:1230, tr:260}` el desfase es `1000` (gana la de 60 ms: `1230 - (200+260)/2`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Verificar a mano: `npm run dev:server` + `npm run dev:web`; dos pestañas (`rol=docente&pin=0000` y `rol=alumno`), mandar `siguiente` desde la consola del docente y ver el `paso` nuevo en la del alumno.
- [ ] **Step 6:** Commit `feat: conexión del cliente con reconexión y reloj del servidor`.

### Punto de control — día 1: prueba de riesgos en dispositivos

Lo hace el equipo con el código hasta Task 5; Claude prepara el túnel y la lista.

- [ ] Exponer el dev server con HTTPS público: el equipo instala `cloudflared` (`winget install --id Cloudflare.cloudflared -e`), y se corre `cloudflared tunnel --url https://localhost:5173 --no-tls-verify`.
- [ ] En un iPhone y dos Android: entrar, dar permiso, vista doble fluida, 10 minutos de uso midiendo cuánto se corre el frente; anotar cuadros por segundo (mostrar un contador con `?fps=1`).
- [ ] En el Quest 3: abrir el link en el navegador y confirmar que ofrece entrar en VR (WebXR disponible).
- [ ] Desde la red del aula o el lugar de la demo: confirmar que el WebSocket conecta. Si no, probar con hotspot 4G.
- [ ] Decisión registrada en `docs/decisiones.md`: seguir, o ajustar (bajar resolución, quitar sombras) antes de Task 6.

### Task 6: Modelos de Blender

**Files:**
- Create: `tools/blender/gen_modelos.py` (a partir de `spike/gen_models.py`)
- Create (generados, se versionan): `public/modelos/grua-sts.glb`, `grua-rtg.glb`, `buque.glb`, `tractor.glb`, `tren.glb`

**Interfaces:**
- Produces: cada `.glb` con origen en el punto de apoyo y ejes de la prueba de estilo. `grua-sts.glb` con **objetos separados y nombrados** `estructura`, `pluma`, `carro`, `spreader`, `cabina`, `contenedor` (Task 12 los usa para la vista explotada). `grua-rtg.glb` separada del bloque de patio. `tren.glb`: locomotora + 4 vagones plataforma con contenedores de 40'. Script `npm run modelos` = `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P tools/blender/gen_modelos.py -- public/modelos` (ruta configurable con la variable `BLENDER`).

- [ ] **Step 1:** Portar el script; separar las piezas de la STS en objetos; quitar el bloque de patio (pasa a paramétrico); agregar `tren`.
- [ ] **Step 2:** Run `npm run modelos` → imprime una línea `MODELO <archivo>: <n> triángulos` por modelo; la suma es menor a 15.000.
- [ ] **Step 3:** Commit `feat: modelos generados con Blender`.

### Task 7: Piezas paramétricas, catálogo y construcción de la escena

**Files:**
- Create: `src/client/escena/parametricos.ts`, `src/client/escena/catalogo.ts`, `src/client/escena/construirEscena.ts`
- Test: `src/client/escena/construirEscena.test.ts`, `src/client/escena/parametricos.test.ts`

**Interfaces:**
- Consumes: `Modulo`, `Escena`, `celdaAMundo`, `PALETA`.
- Produces:
  - Paramétricos (devuelven `THREE.Group`, contenedores con `THREE.InstancedMesh`, uno por color): `bloquePatio({ filas = 6, bahias = 20, altura = 4, ocupacion = 0.7, semilla = 7 })` con las medidas de la prueba de estilo (paso de fila 2,8 m, de bahía 6,56 m, líneas pintadas); `muelle({ largo = 40 })` en celdas; `via({ largo = 20 })`; `puerta({ carriles = 4 })`; `deposito({ ancho = 6, largo = 10 })`.
  - `contarContenedores(params): number` — cuántos contenedores genera `bloquePatio` (para test y presupuesto).
  - `catalogo: Record<TipoModulo, { nombre: string; huella(params?): [number, number]; crear(params?: Record<string, number>): Promise<THREE.Object3D>; paramsEditables: { clave: string; etiqueta: string; min: number; max: number; paso: number }[] }>` — nombres en español («Grúa STS», «Bloque de patio», …); los de Blender cargan `public/modelos/<tipo>.glb` una vez y clonan.
  - `diferenciaEscena(antes: Escena | null, despues: Escena): { crear: Modulo[]; actualizar: Modulo[]; borrar: string[] }` — `actualizar` cuando cambian `celda`, `rot` o `params`.
  - `class EscenaViva { raiz: THREE.Group; aplicar(e: Escena): Promise<void>; objeto(id: string): THREE.Object3D | undefined }` — aplica solo la diferencia; cambiar `params` recrea ese módulo; cada objeto lleva `userData.moduloId`.

- [ ] **Step 1: Write the failing tests** `construirEscena.test.ts`: de `null` a una escena de 2 módulos → `crear` con 2; mover uno → solo ese en `actualizar`; quitar uno → su id en `borrar`; misma escena → todo vacío. `parametricos.test.ts`: `contarContenedores({ filas: 6, bahias: 20, altura: 4, ocupacion: 1, semilla: 1 })` es `480`; con `ocupacion: 0` es `0`; mismo `semilla` → mismo resultado.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: catálogo de piezas y escena incremental`.

### Task 8: Ambiente, contenido de la clase y vista de escritorio

**Files:**
- Create: `src/client/escena/ambiente.ts`, `src/client/vistas/escritorio.ts`, `public/escenas/terminal-a.json`, `public/clases/terminal-contenedores.json`, `public/fichas/{buque-portacontenedores,grua-sts,bloque-patio,recorrido-contenedor,puerta-y-tren}.json`
- Modify: `src/client/main.ts`

**Interfaces:**
- Consumes: `EscenaViva` (Task 7), `ConexionSala` (Task 5), `VistaEstereo` y entrada (Task 2).
- Produces:
  - `crearAmbiente(escena: THREE.Scene): void` — agua, cielo, niebla, luces y sombras como `spike/index.html`; muelle de hormigón con borde amarillo.
  - `class VistaEscritorio` — dos modos: `proyector` (la cámara sigue la pose del docente suavizada) y `docente` (OrbitControls; flechas → `siguiente`/`anterior`; clic sobre un módulo → `resaltar`; `M` + clic → `mirenAca` en el punto; `T` → `traer` a la posición de la cámara a 1,7 m del piso; manda la pose de su cámara con `enviarPose`, así el proyector lo sigue igual que al Quest). El proyector muestra arriba a la derecha un QR (`qrcode`) y el código de sala, con el link de alumno.
  - Contenido: escena con ids fijos `muelle-1`, `sts-1`, `sts-2`, `sts-3`, `buque-1`, `tractor-1`, `tractor-2`, `patio-a`, `patio-b`, `rtg-1`, `puerta-1`, `via-1`, `tren-1`, y vistas `general`, `proa`, `pata-sts-2`, `sobre-patio`, `cenital`, `puerta`. Clase con los 5 pasos del spec en orden: `llegada` (vista `proa`, resalta `buque-1`, ficha `buque-portacontenedores`, animación `atraque`), `descarga` (`pata-sts-2`, `sts-2`, `grua-sts`, `descarga-ciclo`), `almacenamiento` (`sobre-patio`, `patio-a`, `bloque-patio`), `movimientos` (`cenital`, `rtg-1`, `recorrido-contenedor`, `recorrido`), `salida` (`puerta`, `puerta-1`, `puerta-y-tren`, `salida`). Ficha `grua-sts`: datos «Alcance: 22 filas» y «Productividad: 25–35 movimientos/h». Todas las fichas con `"ejemplo": true` en su JSON hasta que el docente valide los datos.
  - `main.ts` arma cada rol: `alumno` → entrada + `VistaEstereo`; `proyector`/`docente` en laptop → `VistaEscritorio`; `docente` en el Quest → Task 10.

- [ ] **Step 1:** Implementar ambiente, escritorio y contenido.
- [ ] **Step 2:** Verificar en el navegador integrado: `?rol=proyector` muestra la terminal completa con QR; `?rol=docente&pin=0000` permite pasar de paso con las flechas y la pestaña del proyector acompaña. Capturas de las 6 vistas.
- [ ] **Step 3:** Medir triángulos a la vista (`renderer.info.render.triangles`) desde la vista `general`: menos de 100.000.
- [ ] **Step 4:** Commit `feat: terminal completa, contenido de la clase y vista de escritorio`.

### Task 9: Reproductor de clase del alumno

**Files:**
- Create: `src/client/clase/reproductor.ts`, `src/client/clase/transiciones.ts`, `src/client/clase/mirada.ts`
- Test: `src/client/clase/mirada.test.ts`, `src/client/clase/transiciones.test.ts`

**Interfaces:**
- Consumes: `EstadoSala`, `EscenaViva`, `OrientacionAlumno`.
- Produces:
  - `opacidadFundido(t: number, duracion = 0.3): number` — negro total a la mitad (`t = 0.15` → 1), 0 al principio y al final.
  - `actualizarPermanencia(estado: { objetivo: string | null; tiempo: number }, objetivo: string | null, dt: number): { objetivo: string | null; tiempo: number; mostrar: string | null }` — `mostrar` se vuelve el id cuando `tiempo >= 1.5`; cambiar de objetivo reinicia.
  - `class Reproductor { aplicar(e: EstadoSala): void; cuadro(dt: number): void }` — cuando cambia `ubicacion.seq`: fundido de 0,3 s y, en el negro, mueve la base de la cámara a `ubicacion.pos` (la orientación sigue siendo la del giroscopio, más una guiñada inicial que mira hacia `ubicacion.mira` solo en ese instante); `resaltado` → contorno amarillo (`PALETA.amarillo`) y leve pulso de emisión; `mirenAca` → aro pulsante en el punto y flecha en el borde de la vista si el punto está fuera de un cono de 30°; `recentrar` mayor que el último visto → `OrientacionAlumno.recentrar()`; retícula + permanencia → etiqueta con `catalogo[tipo].nombre` o `modulo.nombre`. `VistaEscritorio` (proyector y docente) usa el mismo `Reproductor` para resaltado, aro y fichas, sin fundidos ni movimientos de cámara.

- [ ] **Step 1: Write the failing tests:** `opacidadFundido(0)` = 0, `(0.15)` = 1, `(0.3)` = 0, `(0.5)` = 0. Permanencia: mismo objetivo 1,4 s → `mostrar: null`; 1,6 s → `mostrar: 'sts-2'`; cambio de objetivo a los 1,0 s → `tiempo` reinicia y `mostrar: null`; objetivo `null` → `mostrar: null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Verificar con docente (escritorio) y alumno (`?rol=alumno&simular=1` simula el giroscopio con el mouse): al pasar de paso el alumno funde y aparece en la vista nueva; `M` + clic muestra el aro; `T` lo trae al lugar del docente. Capturas.
- [ ] **Step 6:** Commit `feat: reproductor de clase del alumno`.

### Task 10: Docente en el Quest 3

**Files:**
- Create: `src/client/vistas/xr.ts`, `src/client/docente/puntero.ts`
- Modify: `src/client/main.ts`, `src/client/clase/reproductor.ts` (dibujar el rayo y la cabeza del docente para los demás)

**Interfaces:**
- Consumes: `ConexionSala`, `EscenaViva`.
- Produces:
  - `iniciarXR(renderer, escena, conexion): void` — botón «Entrar en VR» (sesión `immersive-vr`, `local-floor`); manda pose de cabeza y rayo a 20/s con `enviarPose`.
  - `class Puntero { intersectar(origen: Vec3, dir: Vec3): { moduloId: string; punto: Vec3 } | null }` — gatillo derecho sobre un módulo → `resaltar`; mantener gatillo 1 s sobre un punto → `mirenAca`.
  - Botones del control derecho: A (`gamepad.buttons[4]`) → `siguiente`, B (`buttons[5]`) → `anterior`.
  - En los demás clientes: cabeza del docente como esfera azul con visor, y su rayo como línea azul que termina en un punto.

- [ ] **Step 1:** Implementar. **Step 2:** Verificar en el Quest (equipo): entrar en VR, pasar de paso con A/B, resaltar con el gatillo; el proyector y un celular ven el rayo moverse con fluidez.
- [ ] **Step 3:** Commit `feat: docente en el Quest con puntero y botones`.

### Task 11: Editor, parte 1 — armar la escena

**Files:**
- Create: `editor.html`, `src/client/editor/editor.ts`, `src/client/editor/herramientas.ts`, `src/client/editor/panelParametros.ts`
- Test: `src/client/editor/herramientas.test.ts`

**Interfaces:**
- Consumes: `OpEscena`, `catalogo`, `EscenaViva`, `ConexionSala` (rol `editor`, con PIN), `mundoACelda`.
- Produces:
  - `nuevoId(tipo: TipoModulo, existentes: string[]): string` — `'<tipo>-<n>'` con el menor `n ≥ 1` libre.
  - `opColocar(tipo: TipoModulo, celda: [number, number], escena: Escena): OpEscena` (con `params` por defecto del catálogo).
  - Pantalla: a la izquierda el catálogo (nombre en español y un ícono simple por tipo); al centro una vista desde arriba ortográfica con la grilla, y a la derecha una vista 3D chica. Clic en el catálogo y clic en la grilla → colocar; arrastrar → mover (al soltar); `R` → girar; `Supr` → borrar; el panel de parámetros usa `paramsEditables` con controles deslizantes y manda `params` al soltar. Cada acción es un `Comando` `escena` enviado al servidor; la escena local se actualiza solo con el `estado` que vuelve (una sola fuente de verdad).

- [ ] **Step 1: Write the failing tests:** `nuevoId('grua-sts', ['grua-sts-1','grua-sts-3'])` → `'grua-sts-2'`; `nuevoId('via', [])` → `'via-1'`; `opColocar('bloque-patio', [4,5], escena)` → `{ op: 'agregar', modulo: { id: 'bloque-patio-1', tipo: 'bloque-patio', celda: [4,5], rot: 0, params: { filas: 6, bahias: 20, altura: 4, ocupacion: 0.7, semilla: 7 } } }`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Verificar: con el editor y un alumno abiertos, agregar una grúa STS y alargar un bloque de patio; el cambio aparece en el alumno en menos de un segundo. Recargar el servidor y comprobar que la escena editada sigue ahí. Capturas.
- [ ] **Step 6:** Commit `feat: editor de escenas en vivo`.

### Task 12: Editor, parte 2 — armar la clase; fichas y vista explotada

**Files:**
- Create: `src/client/editor/pasos.ts`, `src/client/clase/fichas.ts`, `src/client/clase/explotada.ts`
- Test: `src/client/editor/pasos.test.ts`, `src/client/clase/explotada.test.ts`

**Interfaces:**
- Consumes: `OpClase`, `Ficha`, objetos nombrados de `grua-sts.glb` (Task 6).
- Produces:
  - `opAgregarPasoDesdeVista(clase: Clase, despuesDe: number, camara: Vista, titulo: string): OpClase[]` — devuelve `[guardarVista, agregarPaso]` con id de vista `'vista-<n>'` y de paso `'paso-<n>'` libres.
  - En el editor: lista de pasos (arrastrar no hace falta: botones subir/bajar quedan fuera), «Agregar paso desde esta vista», selector de módulos a resaltar (clic en la vista 3D), selector de ficha y de animación de entre las existentes.
  - `crearPanelFicha(f: Ficha): THREE.Group` — panel 3D con `troika-three-text`: título 0,9 m y texto 0,45 m de alto a 25 m de distancia de referencia (equivale a más de 40 px en el Cardboard), hasta 3 datos; se ubica junto al módulo resaltado, siempre mirando a quien lo ve.
  - `desplazamientosExplotada(f: number): Record<'estructura' | 'pluma' | 'carro' | 'spreader' | 'cabina' | 'contenedor', Vec3>` — `f` de 0 (armada) a 1 (explotada): pluma +8 m en Y, carro +14 m en Y, spreader +6 m en Y y −6 m en Z, cabina −6 m en X, contenedor −10 m en Y, estructura sin cambio; interpolación lineal. Cada pieza con su etiqueta cuando `f = 1`.

- [ ] **Step 1: Write the failing tests:** `opAgregarPasoDesdeVista` sobre una clase con `paso-1` y `paso-2` y `despuesDe: 0` → `[{op:'guardarVista', id:'vista-1', …}, {op:'agregarPaso', despuesDe: 0, paso:{ id:'paso-3', vista:'vista-1', resaltar: [] , …}}]`. `desplazamientosExplotada(0)` → todos `[0,0,0]`; `(1).carro` → `[0,14,0]`; `(0.5).pluma` → `[0,4,0]`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Armar con el propio editor la clase de 5 pasos de la demo sobre la escena de Task 8 y comprobar en el alumno que cada paso abre su ficha legible. Capturas de la ficha de la STS armada y explotada.
- [ ] **Step 6:** Commit `feat: pasos desde el editor, fichas y vista explotada`.

### Punto de control — fin del día 5

- [ ] Si Tasks 11 y 12 no están terminadas al final del jueves 29 de octubre: recortar el editor a colocar, mover y borrar; los pasos se editan a mano en `public/clases/terminal-contenedores.json`. Registrar la decisión en `docs/decisiones.md`.

### Task 13: Animaciones sincronizadas

**Files:**
- Create: `src/client/clase/animaciones.ts`
- Test: `src/client/clase/animaciones.test.ts`

**Interfaces:**
- Consumes: `EstadoSala.animacion`, `Reloj.ahoraServidor()`, posiciones de módulos por id.
- Produces:
  - `type Tramo = { desde: Vec3; hasta: Vec3; duracion: number; enganche?: 'spreader-sts' | 'tractor' | 'spreader-rtg' }`.
  - `posicionEn(tramos: Tramo[], t: number): { pos: Vec3; tramo: number; terminada: boolean }` — `t` en segundos desde el inicio; interpolación lineal suavizada (smoothstep) dentro de cada tramo; después del final queda en el último punto con `terminada: true`.
  - `animaciones: Record<'atraque' | 'descarga-ciclo' | 'recorrido' | 'salida', (escena: Escena) => Tramo[]>` — construidas a partir de las posiciones de `buque-1`, `sts-2`, `tractor-1`, `patio-a`, `rtg-1`, `puerta-1`, `tren-1`. `descarga-ciclo`: buque → spreader de la STS arriba → baja al tractor → tractor al patio → RTG lo apila (unos 40 s en total).

- [ ] **Step 1: Write the failing tests:** con dos tramos de 10 s, `posicionEn(tramos, 0).pos` = inicio del primero; `(5)` = punto medio del primero; `(10)` = inicio del segundo; `(25)` = fin del segundo con `terminada: true`; `t` negativo → inicio. Un alumno que se conecta a los 12 s (`ahoraServidor() - inicio = 12`) obtiene el mismo resultado que uno conectado desde el principio.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar y conectar al reproductor y al escritorio. **Step 4:** Run → PASS.
- [ ] **Step 5:** Verificar con dos pestañas abiertas en momentos distintos: el contenedor está en el mismo lugar en ambas. Captura.
- [ ] **Step 6:** Commit `feat: animaciones sincronizadas por reloj del servidor`.

### Task 14: Menú de muñeca y maqueta en la mesa (AR)

**Files:**
- Create: `src/client/docente/menuMuneca.ts`, `src/client/vistas/ar.ts`
- Modify: `src/client/vistas/xr.ts`

**Interfaces:**
- Consumes: `iniciarXR`, `Puntero`, `ConexionSala`.
- Produces:
  - Menú en el control izquierdo con 5 botones, en este orden: «Traer a todos acá» (`traer` a la posición de la cabeza del docente a 1,7 m del piso), «Miren acá» (activa el modo: el siguiente gatillo marca el punto), «Reproducir animación» (`animar` con la del paso actual), «Recentrar a todos» (`recentrar`), «Maqueta en la mesa».
  - `iniciarAR(renderer, escenaViva): void` — sesión `immersive-ar` con passthrough; la escena a escala 1:400, apoyada 1 m frente al docente a 0,8 m de altura; el proyector muestra lo mismo. El botón vuelve a VR.

- [ ] **Step 1:** Implementar. **Step 2:** Verificar en el Quest (equipo): cada botón hace lo suyo en los celulares; la maqueta aparece sobre una mesa real y el proyector la muestra.
- [ ] **Step 3:** Commit `feat: menú de muñeca y maqueta en AR`.

### Task 15: Publicación, guía del docente y preparación de la demo

**Files:**
- Create: `README.md`, `docs/guia-docente.md`, `docs/preparacion-demo.md`, `render.yaml`

**Interfaces:**
- Produces: `render.yaml` (servicio web Node 22, build `npm ci && npm run build`, start `npm start`, variable `ESTIBA_PIN` como secreta, disco persistente montado en `data/`). `README.md` con desarrollo local, túnel y publicación. `guia-docente.md`: una página, en español, con cómo abrir la sala, los controles del Quest y del teclado, y qué hacer si algo falla. `preparacion-demo.md`: la lista de preparación y el guion de 13 minutos del spec, con tiempos.

- [ ] **Step 1:** El equipo crea la cuenta de Render y conecta el repositorio de GitHub (Claude no crea cuentas); Claude escribe `render.yaml` y los documentos.
- [ ] **Step 2:** Verificar el sitio publicado: un celular y el Quest entran por HTTPS y siguen la clase.
- [ ] **Step 3:** Commit `docs: publicación, guía del docente y preparación de la demo`.

### Punto de control — día 8: ensayo general

- [ ] Guion completo con 5 a 10 personas como jurado, en una sala parecida a la de la demo.
- [ ] Medir: cuadros por segundo en cada celular (≥ 30), tiempo entre «pónganse el visor» y todos adentro (< 1 min), si alguien se mareó, tiempos de cada parte del guion.
- [ ] Anotar problemas en `docs/ensayo.md` y priorizarlos para el día 9; si sobra tiempo, sombras horneadas en Blender. Grabar el video de respaldo el día 9.
