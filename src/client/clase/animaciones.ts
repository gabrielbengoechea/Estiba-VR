// Animaciones sincronizadas: el estado de la sala dice qué animación corre y en qué instante del servidor empezó;
// cada dispositivo calcula dónde va el contenedor a partir de su reloj sincronizado, sin acumular nada entre cuadros.
// Por eso un alumno que entra a los 12 s ve el contenedor exactamente donde lo ven los demás.
import * as THREE from 'three';
import type { Escena, EstadoSala, Modulo, Vec3 } from '../../shared/tipos';
import type { EscenaViva } from '../escena/construirEscena';
import { PALETA } from '../../shared/colores';
import { posicionModulo } from '../../shared/grilla';
import { desplazamientoY } from '../escena/catalogo';

export type Enganche = 'spreader-sts' | 'tractor' | 'spreader-rtg';

/**
 * Un tramo del camino del punto animado (el centro del contenedor). `giro` (opcional) es el ángulo de guiñada
 * (rad, sobre el eje Y) que tiene al terminar el tramo; se interpola con el mismo suavizado y, si falta, se mantiene.
 * `enganche` dice qué pieza lo acompaña mientras dura el tramo.
 */
export type Tramo = { desde: Vec3; hasta: Vec3; duracion: number; enganche?: Enganche; giro?: number };

export type IdAnimacion = 'atraque' | 'descarga-ciclo' | 'recorrido' | 'salida';

export interface Posicion { pos: Vec3; tramo: number; terminada: boolean; giro: number }

const suave = (x: number) => x * x * (3 - 2 * x);

/** Segundos transcurridos desde `inicio` (ms del servidor) hasta `ahoraServidor` (ms). */
export function segundosDesde(inicio: number, ahoraServidor: number): number {
  return (ahoraServidor - inicio) / 1000;
}

/** Guiñada con que termina el tramo anterior a `i` (0 si ninguno la indica). */
function giroAntes(tramos: Tramo[], i: number): number {
  for (let j = i - 1; j >= 0; j--) {
    const g = tramos[j].giro;
    if (g !== undefined) return g;
  }
  return 0;
}

/** Valor dentro del tramo `i` con avance `u` en [0, 1], ya suavizado. */
function muestra(tramos: Tramo[], i: number, u: number, fuera: Posicion): void {
  const tr = tramos[i];
  const s = suave(u < 0 ? 0 : u > 1 ? 1 : u);
  for (let k = 0; k < 3; k++) fuera.pos[k] = tr.desde[k] + (tr.hasta[k] - tr.desde[k]) * s;
  const g0 = giroAntes(tramos, i);
  fuera.giro = g0 + ((tr.giro ?? g0) - g0) * s;
  fuera.tramo = i;
}

/**
 * Posición a los `t` segundos desde el inicio. Dentro de cada tramo la interpolación es lineal suavizada (smoothstep);
 * antes del inicio queda en el primer punto y después del final en el último, con `terminada: true`.
 * Si se pasa `fuera` se reutiliza (sin crear objetos en cada cuadro).
 */
export function posicionEn(tramos: Tramo[], t: number, fuera?: Posicion): Posicion {
  const r = fuera ?? { pos: [0, 0, 0], tramo: 0, terminada: false, giro: 0 };
  r.terminada = false;
  if (tramos.length === 0) {
    r.pos[0] = r.pos[1] = r.pos[2] = 0;
    r.tramo = 0;
    r.giro = 0;
    r.terminada = true;
    return r;
  }
  let inicio = 0;
  for (let i = 0; i < tramos.length; i++) {
    const d = tramos[i].duracion;
    if (d <= 0) continue;
    if (t < inicio + d) {
      muestra(tramos, i, (t - inicio) / d, r);
      return r;
    }
    inicio += d;
  }
  // Después del final (o todos los tramos de duración 0): último punto.
  muestra(tramos, tramos.length - 1, 1, r);
  r.terminada = true;
  return r;
}

export interface Acople { k: number; pos: Vec3; giro: number }

const tmp: Posicion = { pos: [0, 0, 0], tramo: 0, terminada: false, giro: 0 };

function copiar(de: Posicion, a: Acople): void {
  a.pos[0] = de.pos[0]; a.pos[1] = de.pos[1]; a.pos[2] = de.pos[2];
  a.giro = de.giro;
}

/**
 * Cuánto acompaña (k de 0 a 1) la pieza de tipo `tipo` al contenedor y dónde está este en ese momento.
 * Mientras dura el enganche k = 1 y `pos` sigue al contenedor. Durante el tramo anterior la pieza llega
 * (k sube con suavizado, `pos` es el punto de partida del enganche) y durante el siguiente se va (k baja, `pos` es el punto final).
 * Si el enganche llega hasta el último tramo, la pieza se queda con el contenedor.
 */
export function enganchePartes(tramos: Tramo[], tipo: Enganche, t: number, fuera: Acople): Acople {
  fuera.k = 0;
  const n = tramos.length;
  let inicio = 0;
  for (let i = 0; i < n; i++) {
    const d = tramos[i].duracion;
    if (tramos[i].enganche !== tipo || d <= 0) { inicio += Math.max(0, d); continue; }
    // Tanda de tramos consecutivos con el mismo enganche: [i0, i1].
    const i0 = i;
    let fin = inicio;
    let i1 = i;
    while (i1 < n && tramos[i1].enganche === tipo) { fin += Math.max(0, tramos[i1].duracion); i1++; }
    i1--;
    const antes = i0 > 0 ? tramos[i0 - 1].duracion : 0;
    const despues = i1 < n - 1 ? tramos[i1 + 1].duracion : 0;
    if (t >= inicio && (t < fin || i1 === n - 1)) {
      fuera.k = 1;
      copiar(posicionEn(tramos, t, tmp), fuera);
      return fuera;
    }
    if (t < inicio) {
      if (i0 === 0) { fuera.k = 1; copiar(posicionEn(tramos, inicio, tmp), fuera); return fuera; }
      if (antes > 0 && t >= inicio - antes) {
        fuera.k = suave((t - (inicio - antes)) / antes);
        copiar(posicionEn(tramos, inicio, tmp), fuera);
        return fuera;
      }
    } else if (despues > 0 && t < fin + despues) {
      fuera.k = 1 - suave((t - fin) / despues);
      muestra(tramos, i1, 1, tmp);
      copiar(tmp, fuera);
      return fuera;
    }
    inicio = fin;
    i = i1;
  }
  return fuera;
}

// ---------------------------------------------------------------------------------------------------------------------
// Caminos. Todo en metros del mundo, a partir de la posición de los módulos de la escena (nunca fijo).
// Convenciones de los modelos (tools/blender/gen_modelos.py, ya en los ejes de three.js):
//   grúa STS: origen en el centro de la grúa sobre el cantil; el spreader cuelga del lado del agua en z local ≈ +23 y
//     a y ≈ 20,1 (centro del contenedor colgado); las patas están en z = 0 y z = -30,5 (hacia tierra).
//   tractor: la cabina está en el origen (mira hacia -x) y el contenedor va detrás, sobre el chasis de 40' del kit, con centro en x = 9,68, y = 2,45.
//   tren: el frente está en el origen y se extiende hacia +x; el contenedor del primer vagón tiene su centro en x = 25,7, y = 2,4.
//   buque: popa en el origen, proa hacia +x (200 m), cubierta a y = 10.
//   bloque de patio: esquina de la bahía 0 / fila 0 en el origen; las bahías crecen en +x y las filas hacia -z.
//   grúa RTG: centrada en el origen (x, z) y apoyada en y = 0.
// ---------------------------------------------------------------------------------------------------------------------
export const STS_SPREADER_REPOSO: Vec3 = [0, 20.1, 23];
export const TRACTOR_CONTENEDOR: Vec3 = [9.68, 2.45, 0];
export const TREN_CONTENEDOR: Vec3 = [25.7, 2.4, 0];
/** Largo del tren (locomotora + 4 vagones) a lo largo de x, desde el frente. */
export const TREN_LARGO = 77.2;
/** Recorrido del tren al salir, hacia -x (su frente); la vía de terminal-a.json (x 140 a 400) lo cubre entero. */
const TREN_RECORRIDO = 110;
/** El buque llega desde el oeste (de proa) y desde el lado del agua. */
const BUQUE_ENTRADA: Vec3 = [-240, 0, 25];
/** Centro del contenedor apoyado en el tractor. */
const ALTO_TRACTOR = TRACTOR_CONTENEDOR[1];
/** Centro de un contenedor apoyado en el suelo. */
const ALTO_SUELO = 1.3;
const ALTO_ARRIBA_STS = 34;
const ALTO_ARRIBA_RTG = 14;
/**
 * Destino del apilado en el bloque `patio-a` de `terminal-a.json` (semilla 7): fila 2 (centro a 6,82 m del borde del bloque),
 * donde las bahías 5 a 7 tienen dos contenedores apilados; el nuevo queda en el tercer nivel (centro a 6,5 m).
 * Si el editor cambia el bloque, el contenedor puede quedar flotando o atravesar una pila: es solo visual.
 */
const ALTO_PILA = 6.5;
const FILA_DESTINO = 6.82;

function modulo(e: Escena, id: string): Modulo | undefined {
  for (const m of e.modulos) if (m.id === id) return m;
  return undefined;
}

/** Posición en el mundo del origen del módulo (o el origen si no existe). */
function origen(e: Escena, id: string): Vec3 {
  const m = modulo(e, id);
  if (!m) return [0, 0, 0];
  const p = posicionModulo(m, e.metrosPorCelda);
  return [p.x, 0, p.z];
}

/** Punto local del módulo `id` (con su rotación) llevado al mundo. */
function local(e: Escena, id: string, p: Vec3): Vec3 {
  const o = origen(e, id);
  const mod = modulo(e, id);
  const a = mod ? posicionModulo(mod, e.metrosPorCelda).rad : 0;
  const c = Math.round(Math.cos(a) * 1e9) / 1e9;
  const s = Math.round(Math.sin(a) * 1e9) / 1e9;
  return [o[0] + c * p[0] + s * p[2], o[1] + p[1], o[2] - s * p[0] + c * p[2]];
}

const sumar = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** El punto animado es el origen del buque, que llega de proa al amarre (28 s). */
function atraque(e: Escena): Tramo[] {
  const b = origen(e, 'buque-1');
  return [{ desde: sumar(b, BUQUE_ENTRADA), hasta: b, duracion: 28 }];
}

/** Ciclo completo de descarga: buque → STS → tractor → patio → RTG (40 s). */
function descargaCiclo(e: Escena): Tramo[] {
  const sobreBuque = local(e, 'sts-2', [0, 19.7, 23]);
  const arriba = local(e, 'sts-2', [0, ALTO_ARRIBA_STS, 23]);
  const sobreTierra = local(e, 'sts-2', [0, ALTO_ARRIBA_STS, -12]);
  const enTractor = local(e, 'sts-2', [0, ALTO_TRACTOR, -12]);
  const rtg = origen(e, 'rtg-1');
  const patio = origen(e, 'patio-a');
  const salidaSts: Vec3 = [rtg[0], ALTO_TRACTOR, enTractor[2]];
  const carril: Vec3 = [rtg[0], ALTO_TRACTOR, patio[2] + 1];
  const carrilArriba: Vec3 = [carril[0], ALTO_ARRIBA_RTG, carril[2]];
  const pilaArriba: Vec3 = [carril[0], ALTO_ARRIBA_RTG, patio[2] - FILA_DESTINO];
  const pila: Vec3 = [pilaArriba[0], ALTO_PILA, pilaArriba[2]];
  const sur = -Math.PI / 2; // guiñada con el contenedor a lo largo de z
  return [
    { desde: sobreBuque, hasta: arriba, duracion: 4, enganche: 'spreader-sts' },
    { desde: arriba, hasta: sobreTierra, duracion: 8, enganche: 'spreader-sts' },
    { desde: sobreTierra, hasta: enTractor, duracion: 6, enganche: 'spreader-sts' },
    { desde: enTractor, hasta: salidaSts, duracion: 5, enganche: 'tractor', giro: 0 },
    { desde: salidaSts, hasta: carril, duracion: 6, enganche: 'tractor', giro: sur },
    { desde: carril, hasta: carrilArriba, duracion: 5, enganche: 'spreader-rtg', giro: 0 },
    { desde: carrilArriba, hasta: pilaArriba, duracion: 3, enganche: 'spreader-rtg' },
    { desde: pilaArriba, hasta: pila, duracion: 3, enganche: 'spreader-rtg' },
  ];
}

/** Movimiento dentro de la terminal: la RTG saca un contenedor del patio A y el tractor 2 lo lleva al patio B (32 s). */
function recorrido(e: Escena): Tramo[] {
  const rtg = origen(e, 'rtg-1');
  const patioA = origen(e, 'patio-a');
  const patioB = origen(e, 'patio-b');
  const pila: Vec3 = [rtg[0], ALTO_PILA, patioA[2] - FILA_DESTINO];
  const pilaArriba: Vec3 = [pila[0], ALTO_ARRIBA_RTG, pila[2]];
  const carrilArriba: Vec3 = [pila[0], ALTO_ARRIBA_RTG, patioA[2] + 1];
  const carril: Vec3 = [pila[0], ALTO_TRACTOR, carrilArriba[2]];
  const esquina: Vec3 = [carril[0] + 95, ALTO_TRACTOR, carril[2]];
  const lado: Vec3 = [esquina[0], ALTO_TRACTOR, patioB[2] + 6];
  const destino: Vec3 = [carril[0], ALTO_TRACTOR, lado[2]];
  return [
    { desde: pila, hasta: pilaArriba, duracion: 3, enganche: 'spreader-rtg', giro: 0 },
    { desde: pilaArriba, hasta: carrilArriba, duracion: 3, enganche: 'spreader-rtg' },
    { desde: carrilArriba, hasta: carril, duracion: 4, enganche: 'spreader-rtg', giro: -Math.PI / 2 },
    { desde: carril, hasta: esquina, duracion: 7, enganche: 'tractor', giro: -Math.PI },
    { desde: esquina, hasta: lado, duracion: 5, enganche: 'tractor', giro: -Math.PI / 2 },
    { desde: lado, hasta: destino, duracion: 7, enganche: 'tractor', giro: 0 },
    // El tractor se va y el contenedor queda apoyado en el suelo del patio B (centro a media altura).
    { desde: destino, hasta: [destino[0], ALTO_SUELO, destino[2]], duracion: 3 },
  ];
}

/** Salida por tren: el contenedor viaja en el primer vagón y el tren parte hacia -x, que es su frente (25 s; no se sale de la vía: ver la prueba). */
function salida(e: Escena): Tramo[] {
  const inicio = local(e, 'tren-1', [TREN_CONTENEDOR[0], TREN_CONTENEDOR[1] + desplazamientoY('tren'), TREN_CONTENEDOR[2]]);
  const fin = sumar(inicio, [-TREN_RECORRIDO, 0, 0]);
  return [
    { desde: inicio, hasta: inicio, duracion: 3 },
    { desde: inicio, hasta: fin, duracion: 22 },
  ];
}

export const animaciones: Record<IdAnimacion, (escena: Escena) => Tramo[]> = {
  atraque,
  'descarga-ciclo': descargaCiclo,
  recorrido,
  salida,
};

// ---------------------------------------------------------------------------------------------------------------------
// Aplicación a la escena 3D
// ---------------------------------------------------------------------------------------------------------------------
interface Definicion {
  /** Se dibuja el contenedor animado. */
  contenedor: boolean;
  /** Módulo que se mueve con el punto animado (buque: el punto es su origen; tren: lleva el contenedor). */
  arrastra?: { id: string; desfase: Vec3 };
  tractor?: string;
  sts?: string;
  /** Módulos sin los cuales no se dibuja el contenedor. */
  requiere: string[];
}

const DEFINICIONES: Record<IdAnimacion, Definicion> = {
  atraque: { contenedor: false, requiere: [], arrastra: { id: 'buque-1', desfase: [0, 0, 0] } },
  'descarga-ciclo': { contenedor: true, requiere: ['sts-2', 'rtg-1', 'patio-a'], tractor: 'tractor-1', sts: 'sts-2' },
  recorrido: { contenedor: true, requiere: ['rtg-1', 'patio-a', 'patio-b'], tractor: 'tractor-2' },
  salida: { contenedor: true, requiere: ['tren-1'], arrastra: { id: 'tren-1', desfase: TREN_CONTENEDOR } },
};

/**
 * Lugar de reposo del contenedor al final de cada animación (la sala no borra `animacion` hasta que cambia el paso):
 * apilado en el patio (descarga-ciclo), apoyado en el suelo (recorrido), sobre el vagón que sigue su camino (salida).
 * `null`: no hay contenedor (atraque). Altura del centro, en m.
 */
export const ALTURA_FINAL: Record<IdAnimacion, number | null> = {
  atraque: null,
  'descarga-ciclo': ALTO_PILA,
  recorrido: ALTO_SUELO,
  salida: TREN_CONTENEDOR[1] + desplazamientoY('tren'),
};

const COLOR_CONTENEDOR = PALETA.contenedores[5]; // naranja: se distingue de los de la escena
const LARGO = 12.19;
const ANCHO = 2.44;
const ALTO = 2.59;

interface PartesSts {
  grua: THREE.Object3D;
  carro?: THREE.Object3D;
  cabina?: THREE.Object3D;
  spreader?: THREE.Object3D;
  colgado?: THREE.Object3D;
}

/**
 * ¿Se esconde el contenedor colgado del modelo de la grúa? Solo si la animación conduce de verdad la grúa este cuadro
 * y se dibuja el contenedor animado; en cualquier otro caso (otra animación, grúa ausente o explotada, módulo clave
 * faltante) tiene que verse, para no dejar la grúa sin contenedor y sin reemplazo.
 */
export function ocultarColgado(grúaConducida: boolean, cajaVisible: boolean): boolean {
  return grúaConducida && cajaVisible;
}

/**
 * ¿Se esconde la caja animada? Con la grúa en vista explotada no se conduce, así que en los tramos en que el contenedor
 * cuelga de su spreader la caja volaría sola: se esconde.
 */
export function ocultarCajaPorExplotada(explotando: boolean, enganche: Enganche | undefined): boolean {
  return explotando && enganche === 'spreader-sts';
}

/** Posición de reposo de una pieza de la grúa: se guarda una vez (`VistaExplotada` también la usa como base). */
function reposo(o: THREE.Object3D): Vec3 {
  return (o.userData.reposo ??= o.position.toArray()) as Vec3;
}

/**
 * Dibuja el contenedor animado y mueve las piezas que lo acompañan. Se llama en cada cuadro desde el gancho `alCuadro`
 * del Reproductor, después de las fichas. `ahoraServidor` es el reloj sincronizado; `explotando` dice si la grúa está
 * en vista explotada: en ese caso no se tocan sus piezas, porque ahí manda `VistaExplotada`.
 */
export class Animador {
  private readonly caja: THREE.Mesh;
  private tramos: Tramo[] = [];
  private escenaVista: Escena | null = null;
  private idVisto: string | null = null;
  private marca = 0;
  private readonly tocados = new Map<string, number>();
  private partes: PartesSts | null = null;
  private stsOculto = false;
  private completa = true;
  private readonly p: Posicion = { pos: [0, 0, 0], tramo: 0, terminada: false, giro: 0 };
  private readonly a: Acople = { k: 0, pos: [0, 0, 0], giro: 0 };

  constructor(
    escena: THREE.Scene,
    private viva: EscenaViva,
    private ahoraServidor: () => number,
    private explotando: () => boolean = () => false,
  ) {
    this.caja = new THREE.Mesh(
      new THREE.BoxGeometry(LARGO, ALTO, ANCHO),
      new THREE.MeshStandardMaterial({ color: COLOR_CONTENEDOR, roughness: 0.7 }),
    );
    this.caja.name = 'contenedor-animado';
    this.caja.scale.setScalar(1.02); // apenas más grande que el contenedor del tractor / tren para que no parpadee
    this.caja.castShadow = true;
    this.caja.visible = false;
    this.caja.raycast = () => undefined;
    viva.raiz.add(this.caja); // en la raíz de la terminal: sus coordenadas son de terminal y, en AR, la maqueta lo escala con todo
  }

  cuadro(_dt: number, e: EstadoSala | null): void {
    const anim = e?.animacion;
    const def = anim ? DEFINICIONES[anim.id as IdAnimacion] : undefined;
    if (!e || !anim || !def) {
      this.soltar(e);
      return;
    }
    const id = anim.id as IdAnimacion;
    if (e.escena !== this.escenaVista || id !== this.idVisto) {
      this.escenaVista = e.escena;
      this.idVisto = id;
      this.tramos = animaciones[id](e.escena);
      this.completa = def.requiere.every((m) => !!modulo(e.escena, m));
    }
    const t = segundosDesde(anim.inicio, this.ahoraServidor());
    const p = posicionEn(this.tramos, t, this.p);
    this.marca++;

    this.caja.visible = def.contenedor && this.completa && !ocultarCajaPorExplotada(this.explotando(), this.tramos[p.tramo]?.enganche);
    if (this.caja.visible) {
      this.caja.position.set(p.pos[0], p.pos[1], p.pos[2]);
      this.caja.rotation.y = p.giro;
    }
    if (def.arrastra) this.arrastrar(e, def.arrastra.id, def.arrastra.desfase, p);
    if (def.tractor) this.moverTractor(e, def.tractor, t);
    const conducida = !!def.sts && this.moverSts(e, def.sts, t);
    if (ocultarColgado(conducida, this.caja.visible)) this.ocultarColgado();
    else if (this.stsOculto) this.mostrarColgado(); // otra animación sin grúa, grúa ausente o explotada, o sin contenedor animado
    this.soltarSobrantes(e);
  }

  /** Buque o tren: la raíz del módulo se mueve con el punto animado. */
  private arrastrar(e: EstadoSala, id: string, desfase: Vec3, p: Posicion): void {
    const obj = this.viva.objeto(id);
    if (!obj) return;
    const c = Math.cos(p.giro);
    const s = Math.sin(p.giro);
    obj.position.set(p.pos[0] - (c * desfase[0] + s * desfase[2]), desplazamientoY(modulo(e.escena, id)?.tipo ?? 'muelle'), p.pos[2] - (-s * desfase[0] + c * desfase[2]));
    const mod = modulo(e.escena, id);
    obj.rotation.y = p.giro + (mod ? posicionModulo(mod, e.escena.metrosPorCelda).rad : 0);
    this.tocados.set(id, this.marca);
  }

  /** Tractor: llega bajo la grúa, lleva el contenedor y vuelve a su lugar (el contenedor va en x = 9,68 detrás de la cabina). */
  private moverTractor(e: EstadoSala, id: string, t: number): void {
    const obj = this.viva.objeto(id);
    const mod = modulo(e.escena, id);
    if (!obj || !mod) return;
    const a = enganchePartes(this.tramos, 'tractor', t, this.a);
    if (a.k <= 0) return; // en su lugar (lo resuelve soltarSobrantes)
    const c = Math.cos(a.giro);
    const s = Math.sin(a.giro);
    const rx = a.pos[0] - c * TRACTOR_CONTENEDOR[0];
    const rz = a.pos[2] + s * TRACTOR_CONTENEDOR[0];
    const { x: bx, z: bz, rad: base } = posicionModulo(mod, e.escena.metrosPorCelda);
    obj.position.set(bx + (rx - bx) * a.k, 0, bz + (rz - bz) * a.k);
    obj.rotation.y = base + (a.giro - base) * a.k;
    this.tocados.set(id, this.marca);
  }

  /**
   * Grúa STS: el carro (y la cabina que cuelga de él) corren por la pluma y el spreader sigue al contenedor.
   * Si la grúa está en vista explotada no se toca nada: `VistaExplotada` es la dueña de sus piezas en ese momento.
   */
  private moverSts(e: EstadoSala, id: string, t: number): boolean {
    const obj = this.viva.objeto(id);
    const mod = modulo(e.escena, id);
    if (!obj || !mod) return false;
    if (this.partes?.grua !== obj) this.partes = this.buscarPartes(obj);
    const pt = this.partes!;
    if (this.explotando()) return false;
    const a = enganchePartes(this.tramos, 'spreader-sts', t, this.a);
    if (a.k <= 0) {
      this.restaurarSts(pt);
      return true;
    }
    // Posición del contenedor en el espacio local de la grúa (rotación inversa de la grúa).
    const { x: gx, z: gz, rad: ang } = posicionModulo(mod, e.escena.metrosPorCelda);
    const dx = a.pos[0] - gx;
    const dz = a.pos[2] - gz;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const lx = c * dx - s * dz;
    const lz = s * dx + c * dz;
    const k = a.k;
    const dzCarro = (lz - STS_SPREADER_REPOSO[2]) * k;
    if (pt.carro) {
      const r = reposo(pt.carro);
      pt.carro.position.set(r[0], r[1], r[2] + dzCarro);
    }
    if (pt.cabina) {
      const r = reposo(pt.cabina);
      pt.cabina.position.set(r[0], r[1], r[2] + dzCarro);
    }
    if (pt.spreader) {
      const r = reposo(pt.spreader);
      pt.spreader.position.set(
        r[0] + (lx - STS_SPREADER_REPOSO[0]) * k,
        r[1] + (a.pos[1] - STS_SPREADER_REPOSO[1]) * k,
        r[2] + dzCarro,
      );
    }
    this.tocados.set(id, this.marca);
    return true;
  }

  /** El contenedor colgado del modelo se esconde mientras el animado hace de contenedor del spreader. */
  private ocultarColgado(): void {
    const c = this.partes?.colgado;
    if (c && c.visible) { c.visible = false; this.stsOculto = true; }
  }

  private mostrarColgado(): void {
    if (this.partes?.colgado) this.partes.colgado.visible = true;
    if (this.partes && !this.explotando()) this.restaurarSts(this.partes);
    this.stsOculto = false;
  }

  private buscarPartes(grua: THREE.Object3D): PartesSts {
    return {
      grua,
      carro: grua.getObjectByName('carro') ?? undefined,
      cabina: grua.getObjectByName('cabina') ?? undefined,
      spreader: grua.getObjectByName('spreader') ?? undefined,
      colgado: grua.getObjectByName('contenedor') ?? undefined,
    };
  }

  private restaurarSts(pt: PartesSts): void {
    for (const o of [pt.carro, pt.cabina, pt.spreader]) {
      if (!o) continue;
      const r = reposo(o);
      o.position.set(r[0], r[1], r[2]);
    }
  }

  /** Lo que se movió en cuadros anteriores y ya no se mueve vuelve a su lugar. */
  private soltarSobrantes(e: EstadoSala): void {
    for (const [id, marca] of this.tocados) {
      if (marca === this.marca) continue;
      this.tocados.delete(id);
      this.volverModulo(e, id);
    }
  }

  private volverModulo(e: EstadoSala | null, id: string): void {
    const obj = this.viva.objeto(id);
    if (!e || !obj) return;
    const mod = modulo(e.escena, id);
    if (mod) {
      const { x, z, rad } = posicionModulo(mod, e.escena.metrosPorCelda);
      obj.position.set(x, desplazamientoY(mod.tipo), z);
      obj.rotation.set(0, rad, 0);
    }
    if (this.partes?.grua === obj && !this.explotando()) this.restaurarSts(this.partes);
  }

  /** Sin animación: el contenedor se oculta y todo vuelve a su lugar. */
  private soltar(e: EstadoSala | null): void {
    this.caja.visible = false;
    this.idVisto = null;
    this.escenaVista = null;
    if (this.tocados.size === 0 && !this.stsOculto) return;
    for (const id of this.tocados.keys()) this.volverModulo(e, id);
    this.tocados.clear();
    if (this.partes) {
      if (!this.explotando()) this.restaurarSts(this.partes);
      if (this.partes.colgado) this.partes.colgado.visible = true;
    }
    this.stsOculto = false;
  }

  dispose(): void {
    this.caja.removeFromParent();
    this.caja.geometry.dispose();
    (this.caja.material as THREE.Material).dispose();
  }
}
