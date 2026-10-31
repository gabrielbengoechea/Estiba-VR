// Módulos de la terminal armados con el kit portuario, en el mismo marco y con los mismos nombres de pieza que los
// modelos anteriores (tools/blender/gen_modelos.py), así las animaciones de la clase y la vista explotada siguen andando:
//   grúa STS: patas del lado del agua a 6 m del cantil (z = 0, el agua en +z), pluma hacia +z; piezas `estructura`,
//             `pluma`, `carro`, `spreader` y `contenedor` colgadas de la raíz (traslaciones puras en el marco de la grúa).
//   grúa RTG: centrada en el origen (x, z), trocha a lo largo de z.
//   buque: popa en el origen, proa hacia +x (200 m), flotando en el nivel del agua.
//   tractor: la cabina mira hacia -x con el frente en x = 0; el contenedor va detrás (TRACTOR_CONTENEDOR).
//   bloque de patio: mismas posiciones que el paramétrico, con contenedores de 20' del kit y sus libreas.
import * as THREE from 'three';
import { NIVEL_AGUA } from './ambiente';
import {
  ALTO_CONT, ANCHO_CONT, PASO_BAHIA, PASO_FILA, LARGO_20, bloquePatio, disponerContenedores, type ParamsPatio,
} from './parametricos';
import {
  ISO, LIBREAS, armarLods, cajasColision, cargarPaquete, clonar, contenedorSuelto, mallaContenedores, nodo,
} from './kit';

/** Centro del contenedor colgado del spreader de la STS en reposo (marco de la grúa). */
export const STS_COLGADO: [number, number, number] = [0, 20.1, 23];
/** Luz entre la cara superior del contenedor y la del spreader (cabezal, telescópicos y twistlocks). */
const SPREADER_SOBRE_CONTENEDOR = 1.57;

function pieza(raiz: THREE.Object3D, nombre: string): THREE.Group {
  const g = new THREE.Group();
  g.name = nombre;
  raiz.add(g);
  return g;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grúa pórtico de muelle (STS) del kit con las piezas sueltas que mueve el Animador. */
export async function gruaStsKit(): Promise<THREE.Group> {
  const [ind, cont] = await Promise.all([cargarPaquete('industrial'), cargarPaquete('contenedores')]);
  const raiz = new THREE.Group();
  raiz.name = 'grua-sts';
  const kit = clonar(ind, 'STS_Crane');
  const ex = kit.userData as { spreader?: { polea_z?: number }; lod_distancias_m?: number[] };
  armarLods(kit, ex.lod_distancias_m ?? [0, 180, 700]);
  kit.rotation.y = Math.PI; // en el kit la tierra está en +z; acá el agua
  raiz.add(kit);
  raiz.updateMatrixWorld(true);

  const trolley = nodo(kit, 'Trolley')!;
  const spreader = nodo(kit, 'Spreader')!;
  const boom = nodo(kit, 'Boom_Hinge')!;
  let ropes: THREE.Object3D | undefined;
  kit.traverse((o) => { if (!ropes && /Hoist_Ropes/.test(o.name)) ropes = o; });

  const carro = pieza(raiz, 'carro');
  carro.attach(trolley);
  const spr = pieza(raiz, 'spreader');
  spr.attach(spreader);
  pieza(raiz, 'pluma').attach(boom);
  pieza(raiz, 'estructura').attach(kit);

  // Reposo de la clase: carro sobre el buque y el contenedor colgado con su centro en STS_COLGADO.
  const [cx, cy, cz] = STS_COLGADO;
  const dz = cz - trolley.position.z;
  trolley.position.z += dz;
  spreader.position.set(cx, cy + ISO['40'][2] / 2 + SPREADER_SOBRE_CONTENEDOR, cz);
  for (const n of ['Twistlock_A1', 'Twistlock_A2', 'Twistlock_B1', 'Twistlock_B2']) {
    const t = nodo(spreader, n);
    if (t) t.rotation.y = Math.PI / 2; // trabados
  }
  const colgado = contenedorSuelto(cont, '40', 1);
  colgado.name = 'contenedor';
  colgado.position.set(cx, cy - ISO['40'][2] / 2, cz);
  raiz.add(colgado);

  // Los cables van del carro al spreader: su escala Y es el largo (se ajusta antes de cada cuadro).
  const topeReposo = spreader.position.y;
  const polea = ex.spreader?.polea_z ?? 51.2;
  const actualizar = raiz.updateMatrixWorld.bind(raiz);
  raiz.updateMatrixWorld = (force?: boolean) => {
    if (ropes) ropes.scale.y = Math.max(0.1, polea - (topeReposo + spr.position.y));
    actualizar(force);
  };
  return raiz;
}

/** Grúa RTG del kit: trocha de 23,47 m a lo largo de z, centrada en el origen. */
export async function gruaRtgKit(): Promise<THREE.Group> {
  const ind = await cargarPaquete('industrial');
  const raiz = new THREE.Group();
  raiz.name = 'grua-rtg';
  const kit = clonar(ind, 'RTG_Crane');
  armarLods(kit, (kit.userData.lod_distancias_m as number[]) ?? [0, 150, 600]);
  raiz.add(kit);
  return raiz;
}

const NOMBRE_BUQUE = 'RÍO DE SOLÍS';

function texturaNombre(nombre: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#f4f4f0';
  g.font = '700 92px "IBM Plex Sans", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(nombre, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Buque feeder del kit llevado a 200 × 32 m, con carga sobre las tapas de bodega (libreas al azar, siempre las mismas). */
export async function buqueKit(): Promise<THREE.Group> {
  const [buques, cont] = await Promise.all([cargarPaquete('buques'), cargarPaquete('contenedores')]);
  const raiz = new THREE.Group();
  raiz.name = 'buque';
  const kit = clonar(buques, 'Ship_Feeder');
  const d = kit.userData as { bahias_x: number[]; filas: number; paso_fila_m: number; carga_z: number; lod_distancias_m?: number[] };
  const bb = new THREE.Box3().setFromObject(kit.getObjectByName('Ship_Feeder_LOD0')!);
  const sx = 200 / (bb.max.x - bb.min.x);
  const sz = 32 / (bb.max.z - bb.min.z);
  kit.scale.set(sx, 1, sz);
  kit.position.set(-bb.min.x * sx, NIVEL_AGUA, 0);
  const nombre = texturaNombre(NOMBRE_BUQUE);
  kit.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.name.startsWith('Ship_Name') && nombre) {
      m.material = new THREE.MeshStandardMaterial({ map: nombre, transparent: true, alphaTest: 0.4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    }
  });
  armarLods(kit, d.lod_distancias_m ?? [0, 450, 1800]);
  raiz.add(kit);

  // Carga: bahías del modelo (escaladas) × filas × niveles al azar; un 40' por celda.
  const r = mulberry32(2024);
  const alto = ISO['40'][2];
  const items: { x: number; y: number; z: number; librea: number }[] = [];
  const columnas: { centro: THREE.Vector3; medidas: THREE.Vector3 }[] = [];
  const centro = (d.filas - 1) / 2;
  for (const bx of d.bahias_x) {
    for (let f = 0; f < d.filas; f++) {
      const e = Math.abs(f - centro) / (centro + 1);
      const niveles = Math.max(1, Math.min(5, Math.round(4.6 - 2.4 * e * e + (r() - 0.6) * 2)));
      const x = kit.position.x + bx * sx;
      const z = (f - centro) * d.paso_fila_m;
      const y0 = NIVEL_AGUA + d.carga_z;
      for (let k = 0; k < niveles; k++) items.push({ x, y: y0 + k * alto, z, librea: Math.floor(r() * LIBREAS) });
      columnas.push({ centro: new THREE.Vector3(x, y0 + (niveles * alto) / 2, z), medidas: new THREE.Vector3(ISO['40'][0], niveles * alto, ISO['40'][1]) });
    }
  }
  const carga = mallaContenedores(cont, '40', items.length, 0);
  carga.name = 'carga';
  const lib = carga.geometry.getAttribute('aLibrea') as THREE.InstancedBufferAttribute;
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.updateMatrix();
    carga.setMatrixAt(i, o.matrix);
    lib.setX(i, it.librea);
  });
  carga.count = items.length;
  carga.computeBoundingSphere();
  raiz.add(carga, cajasColision(columnas));
  return raiz;
}

/** Tractor de patio + chasis de terminal + contenedor de 40', con la cabina mirando hacia -x y el frente en x = 0. */
export async function tractorKit(conCarga = true, librea = 3): Promise<THREE.Group> {
  const [ind, cont] = await Promise.all([cargarPaquete('industrial'), cargarPaquete('contenedores')]);
  const raiz = new THREE.Group();
  raiz.name = 'tractor';
  const interno = new THREE.Group();
  const tractor = clonar(ind, 'Yard_Tractor');
  const chasis = clonar(ind, 'Yard_Chassis40');
  armarLods(tractor, [0, 90]);
  armarLods(chasis, [0, 90]);
  const hitch = nodo(tractor, 'Hitch')!.position;
  chasis.position.set(hitch.x, 0, 0);
  interno.add(tractor, chasis);
  const frente = 4.43; // paragolpes del Yard_Tractor_LOD0
  interno.rotation.y = Math.PI;
  interno.position.x = frente;
  raiz.add(interno);
  if (conCarga) {
    const montaje = nodo(chasis, 'Mount_40')!.position;
    const c = contenedorSuelto(cont, '40', librea);
    c.name = 'contenedor';
    c.position.set(montaje.x + chasis.position.x, montaje.y, 0);
    interno.add(c);
  }
  return raiz;
}

/** Bloque de patio con contenedores de 20' del kit (instanciados, LOD0) en los mismos lugares que el paramétrico. */
export async function bloquePatioKit(params: ParamsPatio = {}): Promise<THREE.Group> {
  const cont = await cargarPaquete('contenedores');
  const g = bloquePatio(params);
  for (const o of [...g.children]) if ((o as THREE.InstancedMesh).userData.contenedores) g.remove(o);
  const pos = disponerContenedores(params);
  const malla = mallaContenedores(cont, '20', pos.length, 0);
  malla.userData.contenedores = true;
  const lib = malla.geometry.getAttribute('aLibrea') as THREE.InstancedBufferAttribute;
  const o = new THREE.Object3D();
  const pilas = new Map<string, { b: number; f: number; n: number }>();
  pos.forEach((p, i) => {
    o.position.set(p.bahia * PASO_BAHIA + LARGO_20 / 2, p.nivel * ALTO_CONT, -(p.fila * PASO_FILA + ANCHO_CONT / 2));
    o.updateMatrix();
    malla.setMatrixAt(i, o.matrix);
    lib.setX(i, (p.color * 3 + p.bahia) % LIBREAS);
    const k = `${p.bahia}:${p.fila}`;
    const pila = pilas.get(k) ?? { b: p.bahia, f: p.fila, n: 0 };
    pila.n = Math.max(pila.n, p.nivel + 1);
    pilas.set(k, pila);
  });
  malla.count = pos.length;
  malla.computeBoundingSphere();
  g.add(malla);
  g.add(cajasColision([...pilas.values()].map((p) => ({
    centro: new THREE.Vector3(p.b * PASO_BAHIA + LARGO_20 / 2, (p.n * ALTO_CONT) / 2, -(p.f * PASO_FILA + ANCHO_CONT / 2)),
    medidas: new THREE.Vector3(LARGO_20, p.n * ALTO_CONT, ANCHO_CONT),
  }))));
  return g;
}
