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
