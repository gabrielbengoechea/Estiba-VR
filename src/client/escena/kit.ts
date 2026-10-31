// Kit portuario de Blender (tools/blender/kit_portuario en Logística 3D): grúas STS y RTG, buques, contenedores ISO,
// camiones y tractores de patio, con materiales PBR en un atlas por familia (WebP, 1024² para el Quest).
//
//   modelos/kit/Kit_Industrial.glb    STS_Crane, RTG_Crane, Truck_Tractor, Trailer_Skeletal40, Yard_Tractor, Yard_Chassis40
//   modelos/kit/Kit_Buques.glb        Ship_Feeder, Ship_Panamax, Ship_PostPanamax
//   modelos/kit/Kit_Contenedores.glb  Container_20, Container_40, Container_40HC (con Socket_* en cada esquinero)
//
// Convenciones del kit:
// - Las mallas visibles terminan en _LOD0/_LOD1/_LOD2: acá se agrupan en un THREE.LOD (el renderer elige el nivel).
// - UCX_*: colisiones convexas. No se dibujan (material invisible) pero siguen visibles para el BVH de la caminata;
//   las mallas de render se marcan `sinColision`, así el mundo de colisión usa solo las UCX (pocos triángulos).
// - Marco glTF: y arriba. Los nodos móviles (carro, spreader, twistlocks, ruedas) tienen el pivote en su origen.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type Paquete = 'industrial' | 'buques' | 'contenedores';
const ARCHIVO: Record<Paquete, string> = {
  industrial: 'Kit_Industrial.glb',
  buques: 'Kit_Buques.glb',
  contenedores: 'Kit_Contenedores.glb',
};

/** Material de las colisiones: no se dibuja pero el objeto sigue visible para el BVH. */
export const COLISION = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, visible: false });

const promesas = new Map<Paquete, Promise<THREE.Object3D>>();

function base(): string {
  try {
    return import.meta.env.BASE_URL ?? '/';
  } catch {
    return '/';
  }
}

/** Ajustes de una sola vez por paquete: colisiones, sombras y recortes alfa de dos caras. */
function preparar(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.name.startsWith('UCX_')) {
      m.material = COLISION;
      m.castShadow = false;
      m.receiveShadow = false;
      return;
    }
    m.userData.sinColision = true;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat && (mat.alphaTest > 0 || mat.transparent)) {
      mat.transparent = false;
      mat.alphaTest = 0.5;
      mat.side = THREE.DoubleSide;
    }
  });
}

/** Carga un paquete una sola vez (un fallo de red no queda cacheado). */
export function cargarPaquete(p: Paquete): Promise<THREE.Object3D> {
  let pr = promesas.get(p);
  if (!pr) {
    pr = new GLTFLoader().loadAsync(`${base()}modelos/kit/${ARCHIVO[p]}`).then((g) => {
      preparar(g.scene);
      return g.scene;
    });
    promesas.set(p, pr);
    pr.catch(() => promesas.delete(p));
  }
  return pr;
}

/** Para las pruebas: usa una escena ya armada como paquete. */
export function fijarPaquete(p: Paquete, scene: THREE.Object3D): void {
  preparar(scene);
  promesas.set(p, Promise.resolve(scene));
}

/** Copia de un activo del paquete en el origen (comparte geometrías y materiales). */
export function clonar(scene: THREE.Object3D, nombre: string): THREE.Object3D {
  const src = scene.getObjectByName(nombre);
  if (!src) throw new Error(`El kit no tiene ${nombre}`);
  const c = src.clone(true);
  c.position.set(0, 0, 0);
  c.quaternion.identity();
  c.scale.set(1, 1, 1);
  c.updateMatrixWorld(true);
  return c;
}

/**
 * Busca un nodo por nombre exacto o con el sufijo .001 que agrega Blender a los repetidos (el GLTFLoader le saca el
 * punto: «Hitch.001» llega como «Hitch001»).
 */
export function nodo(raiz: THREE.Object3D, nombre: string): THREE.Object3D | undefined {
  let exacto: THREE.Object3D | undefined;
  let sufijo: THREE.Object3D | undefined;
  raiz.traverse((o) => {
    if (o.name === nombre) exacto ??= o;
    else if (o.name.startsWith(nombre) && /^\.?\d{3}$/.test(o.name.slice(nombre.length))) sufijo ??= o;
  });
  return exacto ?? sufijo;
}

/**
 * Agrupa las mallas hermanas *_LOD0/1/2 en un THREE.LOD con las distancias del activo. El LOD queda en el mismo
 * padre con transformación identidad, así cada malla conserva su lugar. Devuelve cuántos LOD armó.
 */
export function armarLods(raiz: THREE.Object3D, distancias: number[] = [0, 180, 700]): number {
  const grupos = new Map<THREE.Object3D, Map<string, THREE.Object3D[]>>();
  raiz.traverse((o) => {
    const m = /^(.*)_LOD(\d)(\.?\d{3})?$/.exec(o.name);
    // las mallas con varios materiales llegan como un grupo con una malla por material: se agrupa el grupo
    if (!m || !o.parent || /_LOD\d/.test(o.parent.name)) return;
    const porBase = grupos.get(o.parent) ?? new Map<string, THREE.Object3D[]>();
    grupos.set(o.parent, porBase);
    const lista = porBase.get(m[1]) ?? [];
    lista[Number(m[2])] = o;
    porBase.set(m[1], lista);
  });
  let n = 0;
  for (const [padre, porBase] of grupos) {
    for (const [nombre, niveles] of porBase) {
      const lod = new THREE.LOD();
      lod.name = `${nombre}_LODs`;
      niveles.forEach((o, i) => {
        if (!o) return;
        padre.remove(o);
        o.visible = true;
        lod.addLevel(o, distancias[i] ?? distancias[distancias.length - 1] * (i + 1));
      });
      padre.add(lod);
      n++;
    }
  }
  return n;
}

/** Geometría de una malla expresada en el marco de la raíz del activo (para InstancedMesh). */
export function geometriaEn(scene: THREE.Object3D, raiz: string, malla: string): THREE.BufferGeometry {
  const r = scene.getObjectByName(raiz)!;
  const m = r.getObjectByName(malla) as THREE.Mesh;
  if (!m) throw new Error(`El kit no tiene ${raiz}/${malla}`);
  r.updateMatrixWorld(true);
  const rel = new THREE.Matrix4().copy(r.matrixWorld).invert().multiply(m.matrixWorld);
  const g = m.geometry.clone();
  g.applyMatrix4(rel);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// Contenedores con librea por instancia (8 navieras inventadas, una fila de 200 px del atlas cada una)
// ---------------------------------------------------------------------------------------------------------------------
export const LIBREA_DV = 200 / 2048;
export const LIBREAS = 8;
export type TipoKit = '20' | '40' | '40HC';

const materialesLibrea = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();

/** Copia del material del contenedor que corre las UV a la fila de la librea (atributo de instancia `aLibrea`). */
export function materialLibrea(src: THREE.Material): THREE.MeshStandardMaterial {
  const hit = materialesLibrea.get(src);
  if (hit) return hit;
  const m = (src as THREE.MeshStandardMaterial).clone();
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLibrea;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        float dvL = aLibrea * ${LIBREA_DV.toFixed(6)};
        #ifdef USE_MAP
          vMapUv.y += dvL;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv.y += dvL;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv.y += dvL;
        #endif
        #ifdef USE_METALNESSMAP
          vMetalnessMapUv.y += dvL;
        #endif
        #ifdef USE_AOMAP
          vAoMapUv.y += dvL;
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'contenedor-librea';
  materialesLibrea.set(src, m);
  return m;
}

/** Malla instanciada de contenedores del kit: cada instancia lleva su librea (origen: centro de la base). */
export function mallaContenedores(scene: THREE.Object3D, tipo: TipoKit, capacidad: number, lod: 0 | 1 = 0): THREE.InstancedMesh {
  const geo = geometriaEn(scene, `Container_${tipo}`, `Container_${tipo}_LOD${lod}`);
  geo.setAttribute('aLibrea', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacidad)), 1));
  const src = (scene.getObjectByName(`Container_${tipo}_LOD${lod}`) as THREE.Mesh).material as THREE.Material;
  const mesh = new THREE.InstancedMesh(geo, materialLibrea(src), Math.max(1, capacidad));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.sinColision = true;
  return mesh;
}

/** Contenedor suelto (no instanciado) con la librea pedida: LOD0 + LOD1 y su colisión UCX. Origen en el centro de la base. */
export function contenedorSuelto(scene: THREE.Object3D, tipo: TipoKit, librea: number): THREE.Object3D {
  const c = clonar(scene, `Container_${tipo}`);
  const dv = (((librea % LIBREAS) + LIBREAS) % LIBREAS) * LIBREA_DV;
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name.startsWith('UCX_') || !dv) return;
    const g = m.geometry.clone();
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + dv);
    m.geometry = g;
  });
  armarLods(c, [0, 120]);
  return c;
}

/** Medidas exteriores ISO 668 (m): largo, ancho, alto. */
export const ISO: Record<TipoKit, readonly [number, number, number]> = {
  '20': [6.058, 2.438, 2.591],
  '40': [12.192, 2.438, 2.591],
  '40HC': [12.192, 2.438, 2.896],
};

/** Mallas de colisión en forma de caja (una por instancia) que no se dibujan. */
export function cajasColision(cajas: { centro: THREE.Vector3; medidas: THREE.Vector3; giro?: number }[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), COLISION, Math.max(1, cajas.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eje = new THREE.Vector3(0, 1, 0);
  cajas.forEach((c, i) => {
    q.setFromAxisAngle(eje, c.giro ?? 0);
    im.setMatrixAt(i, m.compose(c.centro, q, c.medidas));
  });
  im.count = cajas.length;
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = false;
  im.name = 'UCX_cajas';
  return im;
}
