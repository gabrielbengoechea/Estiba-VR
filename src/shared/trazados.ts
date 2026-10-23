import type { Trazado, TipoTrazado } from './tipos';

/** Radio mínimo de curva (m) por tipo de trazado. */
export const RADIO_MIN: Record<TipoTrazado, number> = { via: 80, carril: 8, camino: 0 };

/** Punto de muestreo: dirección unitaria y distancia acumulada `s` desde el inicio. */
export interface Muestra { x: number; z: number; dx: number; dz: number; s: number }

type P = [number, number];

const DIST_MIN = 0.01; // puntos consecutivos más cerca que 1 cm se descartan
const FLECHA_MAX = 0.04; // desvío máximo de una cuerda respecto al arco (m)
const EPS_ANGULO = 1e-3; // por debajo de esto el vértice es recto o una inversión

/** Quita puntos consecutivos a menos de 1 cm. */
function limpiar(puntos: P[]): P[] {
  const out: P[] = [];
  for (const p of puntos) {
    const u = out[out.length - 1];
    if (!u || Math.hypot(p[0] - u[0], p[1] - u[1]) >= DIST_MIN) out.push([p[0], p[1]]);
  }
  return out;
}

/** Largo total de la polilínea en metros. */
export function largo(puntos: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < puntos.length; i++) {
    s += Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]);
  }
  return s;
}

/**
 * Reemplaza cada vértice interior por un arco (filete) de radio ≤ `radio`,
 * limitado para que la tangente no pase de la mitad del tramo adyacente más corto.
 * Vértices rectos o con giro de 180° se dejan tal cual.
 */
export function redondear(puntos: [number, number][], radio: number): [number, number][] {
  const p = limpiar(puntos);
  if (!(radio > 0) || p.length < 3) return p;
  const out: P[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const v = p[i];
    const l1 = Math.hypot(p[i - 1][0] - v[0], p[i - 1][1] - v[1]);
    const l2 = Math.hypot(p[i + 1][0] - v[0], p[i + 1][1] - v[1]);
    const u1: P = [(p[i - 1][0] - v[0]) / l1, (p[i - 1][1] - v[1]) / l1];
    const u2: P = [(p[i + 1][0] - v[0]) / l2, (p[i + 1][1] - v[1]) / l2];
    const cos = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
    const theta = Math.acos(cos); // ángulo interior entre los tramos
    if (theta < EPS_ANGULO || theta > Math.PI - EPS_ANGULO) {
      out.push(v);
      continue;
    }
    const tanMitad = Math.tan(theta / 2);
    const t = Math.min(radio / tanMitad, Math.min(l1, l2) / 2); // largo de la tangente
    const r = t * tanMitad;
    const t1: P = [v[0] + u1[0] * t, v[1] + u1[1] * t];
    const t2: P = [v[0] + u2[0] * t, v[1] + u2[1] * t];
    const bx = u1[0] + u2[0];
    const bz = u1[1] + u2[1];
    const bl = Math.hypot(bx, bz);
    const dc = r / Math.sin(theta / 2);
    const c: P = [v[0] + (bx / bl) * dc, v[1] + (bz / bl) * dc];
    const a1 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    let barrido = Math.atan2(t2[1] - c[1], t2[0] - c[0]) - a1;
    while (barrido > Math.PI) barrido -= 2 * Math.PI;
    while (barrido < -Math.PI) barrido += 2 * Math.PI;
    const paso = 2 * Math.acos(Math.max(0, 1 - FLECHA_MAX / r));
    const n = Math.max(1, Math.ceil(Math.abs(barrido) / paso));
    out.push(t1);
    for (let k = 1; k < n; k++) {
      const a = a1 + (barrido * k) / n;
      out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
    out.push(t2);
  }
  out.push(p[p.length - 1]);
  return out;
}

/** Puntos equiespaciados a `paso` m a lo largo de la polilínea, incluyendo el primero y el último. */
export function muestrear(puntos: [number, number][], paso: number): Muestra[] {
  const p = limpiar(puntos);
  if (p.length === 0) return [];
  if (p.length === 1) return [{ x: p[0][0], z: p[0][1], dx: 0, dz: 0, s: 0 }];
  const total = largo(p);
  const salida: Muestra[] = [];
  let i = 0; // tramo actual
  let inicioTramo = 0; // s al comienzo del tramo i
  const paso_ = paso > 0 ? paso : total;
  const objetivos: number[] = [];
  for (let s = 0; s < total - 1e-9; s += paso_) objetivos.push(s);
  objetivos.push(total);
  for (const s of objetivos) {
    let lt = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    while (i < p.length - 2 && s > inicioTramo + lt) {
      inicioTramo += lt;
      i++;
      lt = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    }
    const dx = (p[i + 1][0] - p[i][0]) / lt;
    const dz = (p[i + 1][1] - p[i][1]) / lt;
    const f = Math.min(Math.max(s - inicioTramo, 0), lt);
    salida.push({ x: p[i][0] + dx * f, z: p[i][1] + dz * f, dx, dz, s });
  }
  return salida;
}

/** Primer o último punto de algún trazado a ≤ `distMax` de `p`; el más cercano gana. */
export function extremoCercano(
  trazados: Trazado[],
  p: [number, number],
  distMax: number,
): { id: string; indice: number; punto: [number, number] } | null {
  let mejor: { id: string; indice: number; punto: [number, number] } | null = null;
  let mejorD = Infinity;
  for (const t of trazados) {
    if (t.puntos.length === 0) continue;
    for (const indice of [0, t.puntos.length - 1]) {
      const q = t.puntos[indice];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= distMax && d < mejorD) {
        mejorD = d;
        mejor = { id: t.id, indice, punto: [q[0], q[1]] };
      }
    }
  }
  return mejor;
}
