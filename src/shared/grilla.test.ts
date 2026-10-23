import { describe, expect, it } from 'vitest';
import { celdaAMundo, mundoACelda, posicionModulo } from './grilla';

describe('grilla', () => {
  it('celdaAMundo convierte [col, fila] en [x, 0, z] en metros', () => {
    expect(celdaAMundo([3, 2], 10)).toEqual([30, 0, 20]);
  });

  it('mundoACelda redondea a la celda más cercana', () => {
    expect(mundoACelda([31, 0, 18], 10)).toEqual([3, 2]);
  });

  it('ida y vuelta devuelve la misma celda', () => {
    for (const celda of [[0, 0], [12, 7]] as [number, number][]) {
      expect(mundoACelda(celdaAMundo(celda, 10), 10)).toEqual(celda);
    }
  });
});

describe('posicionModulo', () => {
  it('sin pos ni giro usa celda × metros y rot', () => {
    const p = posicionModulo({ id: 'a', tipo: 'muelle', celda: [2, 3], rot: 90 }, 10);
    expect(p.x).toBe(20);
    expect(p.z).toBe(30);
    expect(p.rad).toBeCloseTo(Math.PI / 2);
  });

  it('pos y giro mandan sobre celda y rot', () => {
    const p = posicionModulo({ id: 'a', tipo: 'muelle', celda: [2, 3], rot: 90, pos: [1.5, -4], giro: 15 }, 10);
    expect(p.x).toBe(1.5);
    expect(p.z).toBe(-4);
    expect(p.rad).toBeCloseTo((15 * Math.PI) / 180);
  });

  it('pos sin giro conserva rot, y giro sin pos conserva celda', () => {
    expect(posicionModulo({ id: 'a', tipo: 'muelle', celda: [1, 1], rot: 180, pos: [5, 5] }, 2).rad).toBeCloseTo(Math.PI);
    expect(posicionModulo({ id: 'a', tipo: 'muelle', celda: [1, 1], rot: 0, giro: 0 }, 2).x).toBe(2);
  });
});
