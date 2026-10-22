import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { TipoModulo } from '../../shared/tipos';
import { bloquePatio, muelle, via, puerta, deposito, M_POR_DEFECTO, MUELLE_FONDO, VIA_ANCHO } from './parametricos';

export interface ParamEditable { clave: string; etiqueta: string; min: number; max: number; paso: number }

export interface EntradaCatalogo {
  nombre: string;
  /** Huella en celdas [columnas, filas]. `m` son los metros por celda de la escena. */
  huella(params?: Record<string, number>, m?: number): [number, number];
  crear(params?: Record<string, number>, m?: number): Promise<THREE.Object3D>;
  paramsEditables: ParamEditable[];
}

/**
 * Desplazamiento vertical (m) con que se coloca cada tipo de módulo. El modelo del tren se genera con sus ruedas
 * a y = 0 y queda hundido en la vía (cuyo riel sube ~0,4 m), así que se lo sube.
 */
export const DESPLAZAMIENTO_Y: Partial<Record<TipoModulo, number>> = { tren: 0.4 };
export const desplazamientoY = (tipo: TipoModulo): number => DESPLAZAMIENTO_Y[tipo] ?? 0;

const promesas = new Map<string, Promise<THREE.Object3D>>();

/** Carga el .glb una sola vez y devuelve un clon por pedido. */
function cargarModelo(tipo: string): () => Promise<THREE.Object3D> {
  return async () => {
    let p = promesas.get(tipo);
    if (!p) {
      p = new GLTFLoader().loadAsync(`/modelos/${tipo}.glb`).then((gltf) => gltf.scene);
      promesas.set(tipo, p);
      p.catch(() => promesas.delete(tipo)); // un fallo de red no queda cacheado
    }
    return (await p).clone(true);
  };
}

const celdas = (metros: number, m: number) => Math.max(1, Math.ceil(metros / m));

function blender(nombre: string, tipo: TipoModulo, ancho: number, fondo: number): EntradaCatalogo {
  const cargar = cargarModelo(tipo);
  return {
    nombre,
    huella: (_p, m = M_POR_DEFECTO) => [celdas(ancho, m), celdas(fondo, m)],
    crear: () => cargar(),
    paramsEditables: [],
  };
}

export const catalogo: Record<TipoModulo, EntradaCatalogo> = {
  muelle: {
    nombre: 'Muelle',
    huella: (p, m = M_POR_DEFECTO) => [p?.largo ?? 40, celdas(MUELLE_FONDO, m)],
    crear: async (p, m) => muelle(p, m),
    paramsEditables: [{ clave: 'largo', etiqueta: 'Largo (celdas)', min: 5, max: 80, paso: 1 }],
  },
  'grua-sts': blender('Grúa STS', 'grua-sts', 30, 20),
  buque: blender('Buque', 'buque', 200, 32),
  tractor: blender('Tractor de terminal', 'tractor', 7, 2.5),
  'bloque-patio': {
    nombre: 'Bloque de patio',
    huella: (p, m = M_POR_DEFECTO) => [celdas((p?.bahias ?? 20) * 6.56, m), celdas((p?.filas ?? 6) * 2.8, m)],
    crear: async (p) => bloquePatio(p),
    paramsEditables: [
      { clave: 'filas', etiqueta: 'Filas', min: 1, max: 12, paso: 1 },
      { clave: 'bahias', etiqueta: 'Bahías', min: 1, max: 30, paso: 1 },
      { clave: 'altura', etiqueta: 'Altura (contenedores)', min: 1, max: 6, paso: 1 },
      { clave: 'ocupacion', etiqueta: 'Ocupación', min: 0, max: 1, paso: 0.05 },
      { clave: 'semilla', etiqueta: 'Semilla', min: 1, max: 999, paso: 1 },
    ],
  },
  'grua-rtg': blender('Grúa RTG', 'grua-rtg', 14, 25),
  puerta: {
    nombre: 'Puerta de acceso',
    huella: (p, m = M_POR_DEFECTO) => [celdas((p?.carriles ?? 4) * 3.5 + 1.2, m), celdas(20, m)],
    crear: async (p) => puerta(p),
    paramsEditables: [{ clave: 'carriles', etiqueta: 'Carriles', min: 1, max: 10, paso: 1 }],
  },
  via: {
    nombre: 'Vía férrea',
    huella: (p, m = M_POR_DEFECTO) => [p?.largo ?? 20, celdas(VIA_ANCHO, m)],
    crear: async (p, m) => via(p, m),
    paramsEditables: [{ clave: 'largo', etiqueta: 'Largo (celdas)', min: 2, max: 60, paso: 1 }],
  },
  tren: blender('Tren', 'tren', 100, 3.5),
  deposito: {
    nombre: 'Depósito',
    huella: (p) => [p?.largo ?? 10, p?.ancho ?? 6],
    crear: async (p, m) => deposito(p, m),
    paramsEditables: [
      { clave: 'ancho', etiqueta: 'Ancho (celdas)', min: 2, max: 20, paso: 1 },
      { clave: 'largo', etiqueta: 'Largo (celdas)', min: 2, max: 30, paso: 1 },
    ],
  },
};
