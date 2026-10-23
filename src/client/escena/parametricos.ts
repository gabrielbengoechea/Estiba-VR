import * as THREE from 'three';
import { PALETA } from '../../shared/colores';

/** Metros por celda que se asume si el llamador no pasa otro valor. */
export const M_POR_DEFECTO = 10;

/** Fondo del muelle y ancho del balasto, en metros: la huella del catálogo sale de estos valores. */
export const MUELLE_FONDO = 20;
export const VIA_ANCHO = 3.8;

const PASO_FILA = 2.8;
const PASO_BAHIA = 6.56;
const LARGO_20 = 6.06;
const ANCHO_CONT = 2.44;
const ALTO_CONT = 2.59;

export interface ParamsPatio {
  filas?: number;
  bahias?: number;
  altura?: number;
  ocupacion?: number;
  semilla?: number;
}

const PATIO_DEF = { filas: 6, bahias: 20, altura: 4, ocupacion: 0.7, semilla: 7 };

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colorPonderado(r: () => number): number {
  const pesos = PALETA.pesosContenedores;
  let x = r() * pesos.reduce((s, p) => s + p, 0);
  for (let i = 0; i < pesos.length; i++) {
    x -= pesos[i];
    if (x < 0) return i;
  }
  return pesos.length - 1;
}

interface Pos { fila: number; bahia: number; nivel: number; color: number }

/** Única fuente de verdad: la geometría y el conteo salen de aquí. */
function disponerContenedores(params: ParamsPatio): Pos[] {
  const { filas, bahias, altura, ocupacion, semilla } = { ...PATIO_DEF, ...params };
  const r = mulberry32(Math.round(semilla));
  const out: Pos[] = [];
  for (let f = 0; f < filas; f++) {
    for (let b = 0; b < bahias; b++) {
      for (let k = 0; k < altura; k++) {
        if (!(r() < ocupacion)) break; // la pila termina en el primer hueco
        out.push({ fila: f, bahia: b, nivel: k, color: colorPonderado(r) });
      }
    }
  }
  return out;
}

export function contarContenedores(params: ParamsPatio): number {
  return disponerContenedores(params).length;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(hex: string, rugosidad = 0.8): THREE.MeshStandardMaterial {
  const k = hex + rugosidad;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rugosidad, metalness: 0.05, flatShading: true });
    matCache.set(k, m);
  }
  return m;
}

/** Material de línea pintada: se dibuja por encima del pavimento sin pelear por la profundidad. */
function matPintura(hex: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: hex, roughness: 0.8, metalness: 0.05, flatShading: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
}

const cajaUnidad = new THREE.BoxGeometry(1, 1, 1);
type Caja = [number, number, number, number, number, number];

/** Caja con esquina mínima (x0,y0,z0) y tamaño (dx,dy,dz), en metros. */
function caja(g: THREE.Group, hex: string, x0: number, y0: number, z0: number, dx: number, dy: number, dz: number): THREE.Mesh {
  const m = new THREE.Mesh(cajaUnidad, mat(hex));
  m.scale.set(dx, dy, dz);
  m.position.set(x0 + dx / 2, y0 + dy / 2, z0 + dz / 2);
  g.add(m);
  return m;
}

/** Cajas del mismo color como un solo InstancedMesh. */
function instancias(hex: string, cajas: Caja[], marca?: string, material: THREE.Material = mat(hex)): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(cajaUnidad, material, cajas.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  cajas.forEach(([x0, y0, z0, dx, dy, dz], i) => {
    m4.compose(new THREE.Vector3(x0 + dx / 2, y0 + dy / 2, z0 + dz / 2), q, new THREE.Vector3(dx, dy, dz));
    im.setMatrixAt(i, m4);
  });
  im.instanceMatrix.needsUpdate = true;
  if (marca) im.userData[marca] = true;
  return im;
}

/**
 * Bloque de patio. Origen en la esquina de la bahía 0 / fila 0; las bahías crecen en +x
 * y las filas hacia tierra (-z). Las pilas se apoyan sobre el suelo, sin tope especial en la fila 0.
 */
export function bloquePatio(params: ParamsPatio = {}): THREE.Group {
  const { filas, bahias } = { ...PATIO_DEF, ...params };
  const g = new THREE.Group();
  g.name = 'bloque-patio';

  const blanco: Caja[] = [];
  for (let r = 0; r <= filas; r++) {
    const y = r * PASO_FILA - (PASO_FILA - ANCHO_CONT) / 2;
    blanco.push([-1, 0, -(y + 0.07), bahias * PASO_BAHIA + 1, 0.03, 0.14]);
  }
  for (let b = 0; b <= bahias; b++) {
    const x = b * PASO_BAHIA - (PASO_BAHIA - LARGO_20) / 2;
    blanco.push([x - 0.07, 0, -(filas * PASO_FILA - 0.18), 0.14, 0.03, filas * PASO_FILA]);
  }
  g.add(instancias('#F2F2EE', blanco, undefined, matPintura('#F2F2EE')));
  const largoLinea = bahias * PASO_BAHIA + 1;
  g.add(instancias('#E2B21A', [
    [-1, 0, 6.0, largoLinea, 0.03, 0.2],
    [-1, 0, 0.9, largoLinea, 0.03, 0.2],
  ], undefined, matPintura('#E2B21A')));

  const porColor: Caja[][] = PALETA.contenedores.map(() => []);
  for (const p of disponerContenedores(params)) {
    porColor[p.color].push([p.bahia * PASO_BAHIA, p.nivel * ALTO_CONT, -(p.fila * PASO_FILA + ANCHO_CONT), LARGO_20, ALTO_CONT - 0.03, ANCHO_CONT]);
  }
  porColor.forEach((lista, i) => {
    if (lista.length) g.add(instancias(PALETA.contenedores[i], lista, 'contenedores'));
  });
  return g;
}

/** Muelle: losa de hormigón de `largo` celdas a lo largo de x; el agua queda en +z, la tierra en -z. */
export function muelle(params: { largo?: number } = {}, m = M_POR_DEFECTO): THREE.Group {
  const largo = (params.largo ?? 40) * m;
  const fondo = MUELLE_FONDO;
  const g = new THREE.Group();
  g.name = 'muelle';
  caja(g, '#6B7178', 0, -1.5, -fondo, largo, 1.5, fondo - 0.4); // la losa termina donde empieza la defensa: sin plano compartido
  caja(g, PALETA.amarillo, 0, 0, -0.6, largo, 0.04, 0.3); // línea de borde
  caja(g, PALETA.oscuro, 0, -1.5, -0.4, largo, 1.5, 0.4); // defensa de cantil
  const bolardos: Caja[] = [];
  for (let x = 5; x < largo; x += 25) bolardos.push([x - 0.3, 0, -1.6, 0.6, 0.5, 0.6]);
  if (bolardos.length) g.add(instancias(PALETA.oscuro, bolardos));
  return g;
}

/** Vía férrea de `largo` celdas a lo largo de x: balasto, durmientes y dos rieles (trocha 1,435 m). */
export function via(params: { largo?: number } = {}, m = M_POR_DEFECTO): THREE.Group {
  const largo = (params.largo ?? 20) * m;
  const g = new THREE.Group();
  g.name = 'via';
  caja(g, '#8A949D', 0, 0, -VIA_ANCHO / 2, largo, 0.25, VIA_ANCHO);
  const durmientes: Caja[] = [];
  for (let x = 0.3; x + 0.25 <= largo; x += 0.6) durmientes.push([x, 0.25, -1.3, 0.25, 0.12, 2.6]);
  if (durmientes.length) g.add(instancias(PALETA.oscuro, durmientes));
  for (const z of [-0.7175, 0.7175]) caja(g, '#B7BDC3', 0, 0.37, z - 0.04, largo, 0.15, 0.08);
  return g;
}

/** Puerta de acceso: `carriles` de 3,5 m a lo largo de x, con islas, cabinas y barreras. */
export function puerta(params: { carriles?: number } = {}): THREE.Group {
  const carriles = Math.max(1, Math.round(params.carriles ?? 4));
  const ancho = 3.5;
  const g = new THREE.Group();
  g.name = 'puerta';
  caja(g, '#59606A', 0, 0, -20, carriles * ancho + 1.2, 0.1, 20);
  for (let c = 0; c <= carriles; c++) {
    const x = 0.6 + c * ancho;
    caja(g, PALETA.blanco, x - 0.6, 0.1, -12, 1.2, 0.3, 4); // isla
    caja(g, PALETA.blanco, x - 0.5, 0.4, -11, 1.0, 2.4, 2); // cabina
    caja(g, PALETA.vidrio, x - 0.45, 1.4, -11.05, 0.9, 0.9, 0.1); // ventana
  }
  for (let c = 0; c < carriles; c++) {
    const x = 0.6 + c * ancho;
    caja(g, PALETA.amarillo, x + 0.6, 1.2, -9.5, ancho - 1.2, 0.12, 0.12); // barrera
  }
  caja(g, PALETA.gruaAzul, 0, 5, -12, carriles * ancho + 1.2, 0.5, 4); // marquesina
  return g;
}

/** Depósito: nave de `ancho` x `largo` celdas con techo oscuro y portones. Origen en la esquina cercana; crece en +x y -z. */
export function deposito(params: { ancho?: number; largo?: number } = {}, m = M_POR_DEFECTO): THREE.Group {
  const a = (params.ancho ?? 6) * m;
  const l = (params.largo ?? 10) * m;
  const alto = 8;
  const g = new THREE.Group();
  g.name = 'deposito';
  caja(g, PALETA.blanco, 0, 0, -a, l, alto, a);
  caja(g, PALETA.oscuro, -0.4, alto, -a - 0.4, l + 0.8, 0.5, a + 0.8);
  const portones: Caja[] = [];
  for (let x = 6; x + 5 < l; x += 12) portones.push([x, 0, 0.02, 5, 5, 0.1]);
  if (portones.length) g.add(instancias(PALETA.gruaAzul, portones));
  return g;
}
