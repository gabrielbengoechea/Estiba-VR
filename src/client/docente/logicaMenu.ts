// Lógica pura del menú de muñeca y de la maqueta AR (sin WebXR), para probarla sin visor.
import * as THREE from 'three';
import type { Vec3 } from '../../shared/tipos';
import type { Comando } from '../../shared/sala';
import type { AccionGatillo } from './logicaXR';

export const BOTONES = [
  'Traer a todos acá', 'Miren acá', 'Reproducir animación', 'Recentrar a todos', 'Maqueta en la mesa',
] as const;
export const IND_TRAER = 0;
export const IND_MIREN_ACA = 1;
export const IND_ANIMAR = 2;
export const IND_RECENTRAR = 3;
export const IND_MAQUETA = 4;

/** Altura de los ojos de los alumnos al traerlos (m sobre el piso). */
export const ALTURA_OJOS = 1.7;
/** A qué distancia delante del docente queda el punto de mira de «traer». */
const DISTANCIA_MIRA = 10;
export const ESCALA_MAQUETA = 1 / 400;
export const DISTANCIA_MAQUETA = 1;
export const ALTURA_MAQUETA = 0.8;
/** Centro de la terminal (el mismo punto al que apunta el sol del ambiente). */
export const CENTRO_TERMINAL: Vec3 = [210, 0, -60];

export type AccionMenu =
  | { tipo: 'comando'; c: Comando }
  | { tipo: 'armarMirenAca' }
  | { tipo: 'alternarAR' }
  | null;

/** Adelante proyectado sobre el plano horizontal y normalizado; sin dirección útil (mirando recto arriba/abajo) → -z. */
function adelanteHorizontal(f: Vec3): [number, number] {
  const n = Math.hypot(f[0], f[2]);
  return n < 1e-6 ? [0, -1] : [f[0] / n, f[2] / n];
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
function adelanteDeQuat(q: [number, number, number, number]): Vec3 {
  _v.set(0, 0, -1).applyQuaternion(_q.set(q[0], q[1], q[2], q[3]));
  return [_v.x, _v.y, _v.z];
}

export function comandoTraer(
  cabezaPos: Vec3, cabezaQuat: [number, number, number, number],
): { t: 'traer'; pos: Vec3; mira: Vec3 } {
  const [fx, fz] = adelanteHorizontal(adelanteDeQuat(cabezaQuat));
  return {
    t: 'traer',
    pos: [cabezaPos[0], ALTURA_OJOS, cabezaPos[2]],
    mira: [cabezaPos[0] + fx * DISTANCIA_MIRA, ALTURA_OJOS, cabezaPos[2] + fz * DISTANCIA_MIRA],
  };
}

export interface ContextoMenu {
  cabeza: { pos: Vec3; quat: [number, number, number, number] };
  /** Animación del paso actual, si tiene. */
  animacion: string | undefined;
  enAR: boolean;
  /** El visor soporta immersive-ar; si no, el botón de la maqueta no hace nada. */
  arSoportado: boolean;
}

export function accionDeBoton(indice: number, ctx: ContextoMenu): AccionMenu {
  switch (indice) {
    case IND_TRAER:
      // En AR la cabeza está en el mundo real (frente a la mesa), no en la terminal.
      return ctx.enAR ? null : { tipo: 'comando', c: comandoTraer(ctx.cabeza.pos, ctx.cabeza.quat) };
    case IND_MIREN_ACA: return { tipo: 'armarMirenAca' };
    case IND_ANIMAR: return ctx.animacion ? { tipo: 'comando', c: { t: 'animar', id: ctx.animacion } } : null;
    case IND_RECENTRAR: return { tipo: 'comando', c: { t: 'recentrar' } };
    case IND_MAQUETA: return ctx.enAR || ctx.arSoportado ? { tipo: 'alternarAR' } : null;
    default: return null;
  }
}

export type Ruta =
  | { tipo: 'boton'; indice: number }
  | { tipo: 'resaltar' }
  | { tipo: 'marcar' }
  | { tipo: 'nada' };

/**
 * Decide qué hace una acción del gatillo: un botón del menú la consume (solo el toque corto lo activa);
 * con «Miren acá» armado, el siguiente gatillo marca el punto; si no, el comportamiento normal.
 */
export function enrutarGatillo(accion: AccionGatillo, boton: number | null, armado: boolean): Ruta {
  if (!accion) return { tipo: 'nada' };
  if (boton !== null) return accion === 'resaltar' ? { tipo: 'boton', indice: boton } : { tipo: 'nada' };
  if (armado || accion === 'mirenAca') return { tipo: 'marcar' };
  return { tipo: 'resaltar' };
}

/** Escala y posición de la raíz de la terminal para la maqueta: su centro 1 m al frente (horizontal) y a 0,8 m. */
export function colocacionMaqueta(cabezaPos: Vec3, adelante: Vec3): { escala: number; posicion: Vec3 } {
  const [fx, fz] = adelanteHorizontal(adelante);
  const e = ESCALA_MAQUETA;
  const objetivo: Vec3 = [cabezaPos[0] + fx * DISTANCIA_MAQUETA, ALTURA_MAQUETA, cabezaPos[2] + fz * DISTANCIA_MAQUETA];
  return {
    escala: e,
    posicion: [
      objetivo[0] - CENTRO_TERMINAL[0] * e,
      objetivo[1] - CENTRO_TERMINAL[1] * e,
      objetivo[2] - CENTRO_TERMINAL[2] * e,
    ],
  };
}

/** Punto del mundo real (sobre/cerca de la maqueta) → coordenadas de la terminal; invierte `colocacionMaqueta`. */
export function puntoATerminal(p: Vec3, posicionRaiz: Vec3, escala: number): Vec3 {
  return [(p[0] - posicionRaiz[0]) / escala, (p[1] - posicionRaiz[1]) / escala, (p[2] - posicionRaiz[2]) / escala];
}
