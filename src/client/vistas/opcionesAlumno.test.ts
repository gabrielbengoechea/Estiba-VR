import { describe, expect, it } from 'vitest';
import { opcionesRendimiento } from './opcionesAlumno';

describe('opcionesRendimiento', () => {
  it('por defecto hay sombras y pixel ratio hasta 2', () => {
    expect(opcionesRendimiento('')).toEqual({ sombras: true, pixelRatioMax: 2 });
    expect(opcionesRendimiento('?sala=1234&rol=alumno')).toEqual({ sombras: true, pixelRatioMax: 2 });
  });
  it('?sombras=0 apaga las sombras y deja el pixel ratio en 1', () => {
    expect(opcionesRendimiento('?sala=1234&sombras=0')).toEqual({ sombras: false, pixelRatioMax: 1 });
  });
  it('cualquier otro valor no cambia nada', () => {
    expect(opcionesRendimiento('?sombras=1').sombras).toBe(true);
    expect(opcionesRendimiento('?sombras=no').sombras).toBe(true);
  });
});
