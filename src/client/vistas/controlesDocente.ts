import type { Comando } from '../../shared/sala';
import type { Vec3 } from '../../shared/tipos';

/** Altura de los ojos de un alumno parado, en metros. */
export const ALTURA_OJOS = 1.7;

/** Flechas del teclado -> paso siguiente o anterior. Cualquier otra tecla no hace nada. */
export function teclaAComando(tecla: string): Comando | null {
  if (tecla === 'ArrowRight' || tecla === 'ArrowDown' || tecla === 'PageDown') return { t: 'siguiente' };
  if (tecla === 'ArrowLeft' || tecla === 'ArrowUp' || tecla === 'PageUp') return { t: 'anterior' };
  return null;
}

/** «Traer»: los alumnos pasan a donde está la cámara, pero a la altura de unos ojos, mirando en su misma dirección. */
export function comandoTraer(camaraPos: Vec3, camaraDir: Vec3): Comando {
  const pos: Vec3 = [camaraPos[0], ALTURA_OJOS, camaraPos[2]];
  return { t: 'traer', pos, mira: [pos[0] + camaraDir[0] * 10, pos[1] + camaraDir[1] * 10, pos[2] + camaraDir[2] * 10] };
}

/** Giro alrededor de Y (radianes) que hace que el frente (-z) apunte de `pos` hacia `mira`, ignorando la altura. */
export function guinadaHacia(pos: Vec3, mira: Vec3): number {
  const dx = mira[0] - pos[0];
  const dz = mira[2] - pos[2];
  if (dx === 0 && dz === 0) return 0;
  return Math.atan2(-dx, -dz);
}

/** Fracción del camino que se recorre en `dt` segundos con un suavizado exponencial de `velocidad` (1/s). */
export function factorSuavizado(dt: number, velocidad: number): number {
  return 1 - Math.exp(-Math.max(0, dt) * velocidad);
}

/** Dirección que se muestra en el QR: la página del alumno de esa sala. */
export function urlAlumno(origen: string, sala: string): string {
  return `${origen}/?sala=${encodeURIComponent(sala)}&rol=alumno`;
}
