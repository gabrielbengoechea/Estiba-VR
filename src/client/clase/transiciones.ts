export const DURACION_FUNDIDO = 0.3;

/** Opacidad del negro durante un fundido: 0 al principio y al final, 1 (negro total) a la mitad. */
export function opacidadFundido(t: number, duracion = DURACION_FUNDIDO): number {
  if (t <= 0 || t >= duracion) return 0;
  return 1 - Math.abs((2 * t) / duracion - 1);
}
