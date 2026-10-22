import { describe, expect, it } from 'vitest';
import type { Quat } from '../../shared/tipos';
import { estaQuieto, guiñada, orientacionAQuat } from './orientacion';

function casiIgual(a: Quat, b: Quat): void {
  for (let i = 0; i < 4; i++) expect(a[i]).toBeCloseTo(b[i], 5);
}

describe('orientacionAQuat', () => {
  it('celular vertical mirando al horizonte es la identidad', () => {
    casiIgual(orientacionAQuat(0, 90, 0, 0), [0, 0, 0, 1]);
  });

  it('alpha 90 gira 90 grados alrededor de Y', () => {
    casiIgual(orientacionAQuat(90, 90, 0, 0), [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  });
});

describe('guiñada', () => {
  it('devuelve la rotación alrededor de Y en radianes', () => {
    expect(guiñada([0, Math.SQRT1_2, 0, Math.SQRT1_2])).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('estaQuieto', () => {
  const identidad: Quat = [0, 0, 0, 1];
  const girado10: Quat = [Math.sin((10 * Math.PI) / 360), 0, 0, Math.cos((10 * Math.PI) / 360)];

  function muestras(hastaMs: number, pasoMs: number, q: (t: number) => Quat) {
    const lista: { t: number; q: Quat }[] = [];
    for (let t = 0; t <= hastaMs; t += pasoMs) lista.push({ t, q: q(t) });
    return lista;
  }

  it('es verdadero con muestras idénticas durante 2100 ms', () => {
    expect(estaQuieto(muestras(2100, 100, () => identidad), 2000, 3)).toBe(true);
  });

  it('es falso si hubo un salto de 10 grados a los 1500 ms', () => {
    const m = muestras(2100, 100, (t) => (t < 1500 ? identidad : girado10));
    expect(estaQuieto(m, 2000, 3)).toBe(false);
  });

  it('es falso con solo 1000 ms de muestras', () => {
    expect(estaQuieto(muestras(1000, 100, () => identidad), 2000, 3)).toBe(false);
  });

  it('es falso sin muestras', () => {
    expect(estaQuieto([], 2000, 3)).toBe(false);
  });
});
