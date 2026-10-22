import { describe, expect, it } from 'vitest';
import { desplazamientosExplotada, factorExplotada } from './explotada';

describe('desplazamientosExplotada', () => {
  it('con f = 0 todo en su lugar', () => {
    for (const v of Object.values(desplazamientosExplotada(0))) expect(v).toEqual([0, 0, 0]);
  });
  it('con f = 1 usa los desplazamientos del brief', () => {
    const d = desplazamientosExplotada(1);
    expect(d.estructura).toEqual([0, 0, 0]);
    expect(d.pluma).toEqual([0, 8, 0]);
    expect(d.carro).toEqual([0, 14, 0]);
    expect(d.spreader).toEqual([0, 6, -6]);
    expect(d.cabina).toEqual([-6, 0, 0]);
    expect(d.contenedor).toEqual([0, -10, 0]);
  });
  it('interpola linealmente', () => {
    expect(desplazamientosExplotada(0.5).pluma).toEqual([0, 4, 0]);
  });
  it('limita f a [0, 1]', () => {
    expect(desplazamientosExplotada(2).carro).toEqual([0, 14, 0]);
    expect(desplazamientosExplotada(-1).carro).toEqual([0, 0, 0]);
  });
});

describe('factorExplotada', () => {
  it('avanza hacia 1 si está abierta y hacia 0 si no, en 1,5 s', () => {
    expect(factorExplotada(0, 0.75, true)).toBeCloseTo(0.5);
    expect(factorExplotada(0.9, 1, true)).toBe(1);
    expect(factorExplotada(0.5, 0.75, false)).toBeCloseTo(0);
    expect(factorExplotada(0, 0.1, false)).toBe(0);
  });
});
