import type { Modulo, Vec3 } from './tipos';

/** Celda [columna, fila] -> posición en el mundo [x, 0, z], en metros. */
export function celdaAMundo(celda: [number, number], m: number): Vec3 {
  return [celda[0] * m, 0, celda[1] * m];
}

/** Posición en el mundo -> celda [columna, fila] más cercana. */
export function mundoACelda(p: Vec3, m: number): [number, number] {
  // "+ 0" normaliza -0 a 0
  return [Math.round(p[0] / m) + 0, Math.round(p[2] / m) + 0];
}

/** Posición [x, z] en metros y giro en radianes de un módulo: `pos`/`giro` si existen, si no `celda × m` y `rot`. */
export function posicionModulo(m: Modulo, metrosPorCelda: number): { x: number; z: number; rad: number } {
  const x = m.pos ? m.pos[0] : m.celda[0] * metrosPorCelda;
  const z = m.pos ? m.pos[1] : m.celda[1] * metrosPorCelda;
  return { x, z, rad: ((m.giro ?? m.rot) * Math.PI) / 180 };
}
