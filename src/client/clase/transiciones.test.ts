import { describe, expect, it } from 'vitest';
import { opacidadFundido } from './transiciones';

describe('opacidadFundido', () => {
  it('0 al principio, 1 a la mitad, 0 al final y después', () => {
    expect(opacidadFundido(0)).toBe(0);
    expect(opacidadFundido(0.15)).toBeCloseTo(1);
    expect(opacidadFundido(0.3)).toBeCloseTo(0);
    expect(opacidadFundido(0.5)).toBe(0);
  });
  it('sube y baja de forma lineal y respeta otra duración', () => {
    expect(opacidadFundido(0.075)).toBeCloseTo(0.5);
    expect(opacidadFundido(0.225)).toBeCloseTo(0.5);
    expect(opacidadFundido(0.5, 1)).toBeCloseTo(1);
    expect(opacidadFundido(-1)).toBe(0);
  });
});

import { pasoFundido } from './transiciones';

function correr(dt: number) {
  let t = 0;
  const cuadros = [];
  for (let i = 0; i < 100 && t < 0.3; i++) {
    const p = pasoFundido(t, dt);
    t = p.t;
    cuadros.push(p);
  }
  return cuadros;
}

describe('pasoFundido', () => {
  it.each([1 / 60, 1 / 30, 0.1])('con dt %f el cuadro donde se mueve es negro total y es único', (dt) => {
    const mov = correr(dt).filter((c) => c.moverAhora);
    expect(mov).toHaveLength(1);
    expect(mov[0].opacidad).toBe(1);
  });
  it('a 30 fps el fundido dura ~0,3 s en total', () => {
    const n = correr(1 / 30).length;
    expect(n / 30).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(n / 30).toBeLessThanOrEqual(0.3 + 1 / 30 + 1e-9);
  });
  it('con dt mayor que todo el fundido igual se mueve en un cuadro con opacidad 1', () => {
    const a = pasoFundido(0, 1);
    expect(a).toEqual({ t: 0.15, moverAhora: true, opacidad: 1 });
    const b = pasoFundido(a.t, 1);
    expect(b.moverAhora).toBe(false);
    expect(b.opacidad).toBe(0);
  });
  it('terminado no hace nada', () => {
    expect(pasoFundido(Infinity, 0.1)).toEqual({ t: Infinity, moverAhora: false, opacidad: 0 });
  });
});
