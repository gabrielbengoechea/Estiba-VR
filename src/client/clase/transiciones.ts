export const DURACION_FUNDIDO = 0.3;

/** Opacidad del negro durante un fundido: 0 al principio y al final, 1 (negro total) a la mitad. */
export function opacidadFundido(t: number, duracion = DURACION_FUNDIDO): number {
  if (t <= 0 || t >= duracion) return 0;
  return 1 - Math.abs((2 * t) / duracion - 1);
}

export interface PasoFundido { t: number; moverAhora: boolean; opacidad: number }

/**
 * Avanza el fundido un cuadro. En el cuadro que cruza la mitad el tiempo se frena justo en ella:
 * ese cuadro se dibuja en negro total y es el único donde se mueve la cámara; el resto del fundido sigue desde el próximo.
 */
export function pasoFundido(t: number, dt: number, duracion = DURACION_FUNDIDO): PasoFundido {
  if (t >= duracion) return { t, moverAhora: false, opacidad: 0 };
  const mitad = duracion / 2;
  if (t < mitad && t + dt >= mitad) return { t: mitad, moverAhora: true, opacidad: 1 };
  const siguiente = t + dt;
  return { t: siguiente, moverAhora: false, opacidad: opacidadFundido(siguiente, duracion) };
}
