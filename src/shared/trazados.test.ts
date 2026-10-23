import { describe, it, expect } from 'vitest';
import { redondear, muestrear, largo, extremoCercano, RADIO_MIN } from './trazados';
import type { Trazado } from './tipos';

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('muestrear', () => {
  it('recta de 20 m con paso 7', () => {
    const m = muestrear([[0, 0], [20, 0]], 7);
    expect(m.map((p) => p.s)).toEqual([0, 7, 14, 20]);
    expect(m[1].dx).toBeCloseTo(1);
    expect(m[1].dz).toBeCloseTo(0);
  });
  it('0 o 1 punto', () => {
    expect(muestrear([], 1)).toEqual([]);
    expect(muestrear([[3, 4]], 1)).toEqual([{ x: 3, z: 4, dx: 0, dz: 0, s: 0 }]);
  });
  it('ignora puntos repetidos', () => {
    const m = muestrear([[0, 0], [0, 0.001], [10, 0]], 5);
    expect(m.map((p) => p.s)).toEqual([0, 5, 10]);
  });
});

describe('redondear', () => {
  it('L de 50+50 con radio 8', () => {
    const v: [number, number] = [50, 0];
    const r = redondear([[0, 0], v, [50, 50]], 8);
    const centro: [number, number] = [42, 8];
    expect(r.some((p) => Math.abs(p[0] - 42) < 1e-6 && Math.abs(p[1]) < 1e-6)).toBe(true);
    expect(r.some((p) => Math.abs(p[0] - 50) < 1e-6 && Math.abs(p[1] - 8) < 1e-6)).toBe(true);
    for (const p of r) {
      const enArco = Math.abs(dist(p, centro) - 8) < 1e-6;
      if (!enArco) expect(dist(p, v)).toBeGreaterThanOrEqual(8 - 1e-6);
    }
    expect(largo(r)).toBeLessThan(100);
    expect(r.length).toBeGreaterThan(4);
  });
  it('chord deviation <= 5 cm', () => {
    const r = redondear([[0, 0], [50, 0], [50, 50]], 8);
    const centro: [number, number] = [42, 8];
    for (let i = 1; i < r.length; i++) {
      if (Math.abs(dist(r[i], centro) - 8) < 1e-6 && Math.abs(dist(r[i - 1], centro) - 8) < 1e-6) {
        const mid: [number, number] = [(r[i][0] + r[i - 1][0]) / 2, (r[i][1] + r[i - 1][1]) / 2];
        expect(8 - dist(mid, centro)).toBeLessThanOrEqual(0.05);
      }
    }
  });
  it('limita el radio por la mitad del tramo corto', () => {
    const r = redondear([[0, 0], [10, 0], [10, 50]], 8);
    expect(r.some((p) => Math.abs(p[0] - 5) < 1e-6 && Math.abs(p[1]) < 1e-6)).toBe(true);
  });
  it('colineales se mantienen', () => {
    expect(redondear([[0, 0], [5, 0], [10, 0]], 8)).toEqual([[0, 0], [5, 0], [10, 0]]);
  });
  it('giro de 180 no produce NaN', () => {
    const r = redondear([[0, 0], [10, 0], [0, 0]], 8);
    expect(r.flat().every(Number.isFinite)).toBe(true);
    expect(r).toContainEqual([10, 0]);
    const m = muestrear([[0, 0], [10, 0], [0, 0]], 3);
    expect(m.every((p) => [p.x, p.z, p.dx, p.dz, p.s].every(Number.isFinite))).toBe(true);
  });
  it('radio 0 devuelve copia limpia', () => {
    const e: [number, number][] = [[0, 0], [0, 0], [4, 0], [4, 4]];
    const r = redondear(e, 0);
    expect(r).toEqual([[0, 0], [4, 0], [4, 4]]);
    expect(r).not.toBe(e);
  });
});

describe('largo y RADIO_MIN', () => {
  it('largo', () => expect(largo([[0, 0], [3, 4]])).toBe(5));
  it('radios', () => expect(RADIO_MIN).toEqual({ via: 80, carril: 8, camino: 0 }));
});

describe('extremoCercano', () => {
  const t: Trazado[] = [
    { id: 'a', tipo: 'via', puntos: [[0, 0], [10, 0], [20, 0]] },
    { id: 'b', tipo: 'camino', puntos: [[0, 3.5], [5, 5]] },
  ];
  it('encuentra el extremo a 2,5 m', () => {
    expect(extremoCercano(t, [22.5, 0], 3)).toEqual({ id: 'a', indice: 2, punto: [20, 0] });
  });
  it('no el de 3,5 m', () => {
    expect(extremoCercano(t, [-3.5, 0], 3)).toBeNull();
  });
});
