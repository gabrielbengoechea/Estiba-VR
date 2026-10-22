import { describe, expect, it } from 'vitest';
import { celdaAMundo, mundoACelda } from './grilla';

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
