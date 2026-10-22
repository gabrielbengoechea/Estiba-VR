import type { Vec3 } from '../../shared/tipos';

export const PERMANENCIA_S = 1.5;
/** Semiángulo del cono de «Miren acá»: dentro se ve el aro, fuera aparece la flecha. */
export const CONO_GRADOS = 30;

export interface Permanencia { objetivo: string | null; tiempo: number }

/** Suma `dt` mientras se mira el mismo objetivo; `mostrar` es el id una vez cumplido 1,5 s. Cambiar de objetivo reinicia. */
export function actualizarPermanencia(
  estado: Permanencia,
  objetivo: string | null,
  dt: number,
): Permanencia & { mostrar: string | null } {
  if (objetivo === null) return { objetivo: null, tiempo: 0, mostrar: null };
  const tiempo = objetivo === estado.objetivo ? estado.tiempo + dt : dt;
  return { objetivo, tiempo, mostrar: tiempo >= PERMANENCIA_S ? objetivo : null };
}

const norma = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

/** ¿La dirección `haciaPunto` está a menos de `grados` de la dirección `frente`? */
export function dentroDelCono(frente: Vec3, haciaPunto: Vec3, grados = CONO_GRADOS): boolean {
  const n = norma(frente) * norma(haciaPunto);
  if (n === 0) return true;
  const cos = (frente[0] * haciaPunto[0] + frente[1] * haciaPunto[1] + frente[2] * haciaPunto[2]) / n;
  return cos >= Math.cos((grados * Math.PI) / 180);
}

/** Ángulo (grados, horario desde «arriba») de la flecha de borde para un punto en coordenadas de cámara (x der, y arriba). */
export function anguloFlecha(local: Vec3): number {
  if (local[0] === 0 && local[1] === 0) return 90;
  return (Math.atan2(local[0], local[1]) * 180) / Math.PI;
}
