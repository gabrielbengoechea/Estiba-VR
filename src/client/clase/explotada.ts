// Vista explotada de la grúa STS: cada pieza nombrada del .glb se separa del resto y lleva su etiqueta.
// Todas las piezas comparten el origen de la grúa, así que los desplazamientos son traslaciones puras
// en el espacio local de la grúa (Y arriba, como three.js).
import * as THREE from 'three';
import { Text } from 'troika-three-text';
import fuenteSemi from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url';
import type { Vec3 } from '../../shared/tipos';

export type PiezaSts = 'estructura' | 'pluma' | 'carro' | 'spreader' | 'cabina' | 'contenedor';

export const PIEZAS_STS: PiezaSts[] = ['estructura', 'pluma', 'carro', 'spreader', 'cabina', 'contenedor'];

/** Desplazamiento de cada pieza con la grúa totalmente explotada, en metros. */
const DESPLAZAMIENTO_FINAL: Record<PiezaSts, Vec3> = {
  estructura: [0, 0, 0],
  pluma: [0, 8, 0],
  carro: [0, 14, 0],
  spreader: [0, 6, -6],
  cabina: [-6, 0, 0],
  contenedor: [0, -10, 0],
};

const ETIQUETAS: Record<PiezaSts, string> = {
  estructura: 'Estructura',
  pluma: 'Pluma',
  carro: 'Carro',
  spreader: 'Spreader',
  cabina: 'Cabina',
  contenedor: 'Contenedor',
};

/** Segundos que tarda en armarse o explotarse. */
export const DURACION_EXPLOTADA_S = 1.5;
/** Altura de las letras de las etiquetas a la distancia de referencia (25 m), en metros. */
const ALTO_ETIQUETA = 0.6;
export const DISTANCIA_REF = 25;
/** Cada etiqueta se corre de costado (m, en el eje X de la grúa) para que no se tapen entre sí. */
const SEPARACION_ETIQUETA = 9;

/** `f` de 0 (armada) a 1 (explotada); interpolación lineal. */
export function desplazamientosExplotada(f: number): Record<PiezaSts, Vec3> {
  const k = Math.min(1, Math.max(0, f));
  const salida = {} as Record<PiezaSts, Vec3>;
  for (const p of PIEZAS_STS) {
    const [x, y, z] = DESPLAZAMIENTO_FINAL[p];
    salida[p] = [x * k + 0, y * k + 0, z * k + 0]; // + 0 evita -0
  }
  return salida;
}

/** Siguiente valor de `f` tras `dt` segundos, hacia 1 si la ficha está abierta y hacia 0 si no. */
export function factorExplotada(f: number, dt: number, abierta: boolean): number {
  const paso = Math.max(0, dt) / DURACION_EXPLOTADA_S;
  return abierta ? Math.min(1, f + paso) : Math.max(0, f - paso);
}

/** Escala que mantiene constante el tamaño aparente de algo definido a `DISTANCIA_REF` metros. */
export function escalaAparente(distancia: number): number {
  return Math.max(0.2, distancia / DISTANCIA_REF);
}

/** Anima las piezas de una grúa STS y muestra sus etiquetas cuando está del todo explotada. */
export class VistaExplotada {
  private f = 0;
  private abierta = false;
  private grua: THREE.Object3D | null = null;
  private piezas = new Map<PiezaSts, { obj: THREE.Object3D; base: THREE.Vector3; centro: THREE.Vector3; etiqueta: Text }>();
  private readonly etiquetas = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly cajaTmp = new THREE.Box3();

  /** `escala` agranda las etiquetas igual que el panel de la ficha (1 = 0,45 m a 25 m). */
  constructor(private escena: THREE.Scene, private escala = 1) {
    this.etiquetas.visible = false;
    escena.add(this.etiquetas);
  }

  /** `grua` es el objeto de la grúa resaltada (o undefined si no hay); `abierta` si la ficha pide la vista explotada. */
  actualizar(grua: THREE.Object3D | undefined, abierta: boolean, dt: number, camara: THREE.Camera): void {
    if (grua !== this.grua) this.cambiarGrua(grua);
    this.abierta = abierta && !!grua;
    const nueva = factorExplotada(this.f, dt, this.abierta);
    if (!this.grua) { this.f = 0; this.etiquetas.visible = false; return; }
    if (nueva !== this.f || this.etiquetas.visible) this.colocar(nueva, camara);
    this.f = nueva;
  }

  private cambiarGrua(nueva: THREE.Object3D | undefined): void {
    this.soltar();
    this.grua = nueva ?? null;
    this.f = 0;
    if (!nueva) return;
    nueva.updateWorldMatrix(true, true);
    for (const nombre of PIEZAS_STS) {
      const obj = nueva.getObjectByName(nombre);
      if (!obj) continue;
      this.cajaTmp.setFromObject(obj);
      const centro = this.cajaTmp.isEmpty() ? new THREE.Vector3() : nueva.worldToLocal(this.cajaTmp.getCenter(new THREE.Vector3()));
      const etiqueta = new Text();
      etiqueta.font = fuenteSemi;
      etiqueta.text = ETIQUETAS[nombre];
      etiqueta.fontSize = ALTO_ETIQUETA;
      etiqueta.anchorX = 'center';
      etiqueta.anchorY = 'middle';
      etiqueta.color = 0xffffff;
      etiqueta.outlineWidth = ALTO_ETIQUETA * 0.1;
      etiqueta.outlineColor = 0x000000;
      etiqueta.material.depthTest = false;
      etiqueta.renderOrder = 20;
      etiqueta.raycast = () => undefined;
      etiqueta.sync();
      this.etiquetas.add(etiqueta);
      this.piezas.set(nombre, { obj, base: obj.position.clone(), centro, etiqueta });
    }
  }

  private colocar(f: number, camara: THREE.Camera): void {
    const grua = this.grua!;
    const d = desplazamientosExplotada(f);
    grua.updateWorldMatrix(true, false);
    const mostrar = f >= 1;
    for (const [nombre, p] of this.piezas) {
      p.obj.position.set(p.base.x + d[nombre][0], p.base.y + d[nombre][1], p.base.z + d[nombre][2]);
      p.etiqueta.visible = mostrar;
      if (!mostrar) continue;
      // La etiqueta cuelga del lado de la pieza y mira a quien la ve, con tamaño aparente constante.
      const lado = nombre === 'cabina' ? -SEPARACION_ETIQUETA : SEPARACION_ETIQUETA;
      this.tmp.set(p.centro.x + d[nombre][0] + lado, p.centro.y + d[nombre][1], p.centro.z + d[nombre][2]);
      grua.localToWorld(this.tmp);
      p.etiqueta.position.copy(this.tmp);
      const dist = camara.position.distanceTo(this.tmp);
      p.etiqueta.scale.setScalar(escalaAparente(dist) * this.escala);
      p.etiqueta.quaternion.copy(camara.quaternion);
    }
    this.etiquetas.visible = mostrar;
  }

  private soltar(): void {
    // Deja las piezas en su lugar si la grúa sigue en la escena.
    for (const p of this.piezas.values()) {
      p.obj.position.copy(p.base);
      this.etiquetas.remove(p.etiqueta);
      p.etiqueta.dispose();
    }
    this.piezas.clear();
    this.etiquetas.visible = false;
  }

  dispose(): void {
    this.soltar();
    this.escena.remove(this.etiquetas);
  }
}
