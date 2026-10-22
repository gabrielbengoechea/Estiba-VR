import { describe, expect, it } from 'vitest';
import { actualizarPermanencia, anguloFlecha, dentroDelCono } from './mirada';

const ini = { objetivo: null as string | null, tiempo: 0 };

describe('actualizarPermanencia', () => {
  it('mismo objetivo 1,4 s: todavía no muestra', () => {
    let e = actualizarPermanencia(ini, 'sts-2', 0);
    e = actualizarPermanencia(e, 'sts-2', 1.4);
    expect(e.mostrar).toBeNull();
  });
  it('mismo objetivo 1,6 s: muestra el id', () => {
    let e = actualizarPermanencia(ini, 'sts-2', 0);
    e = actualizarPermanencia(e, 'sts-2', 1.6);
    expect(e.mostrar).toBe('sts-2');
  });
  it('cambiar de objetivo a 1,0 s reinicia', () => {
    let e = actualizarPermanencia(ini, 'sts-2', 0);
    e = actualizarPermanencia(e, 'sts-2', 1.0);
    e = actualizarPermanencia(e, 'buque-1', 0.1);
    expect(e.objetivo).toBe('buque-1');
    expect(e.tiempo).toBeCloseTo(0.1);
    expect(e.mostrar).toBeNull();
  });
  it('objetivo null no muestra y reinicia', () => {
    let e = actualizarPermanencia(ini, 'sts-2', 2);
    e = actualizarPermanencia(e, null, 0.5);
    expect(e).toEqual({ objetivo: null, tiempo: 0, mostrar: null });
  });
});

describe('dentroDelCono', () => {
  it('29° adentro, 31° afuera, de frente adentro, de espaldas afuera', () => {
    const f: [number, number, number] = [0, 0, -1];
    const a = (g: number): [number, number, number] => [Math.sin((g * Math.PI) / 180), 0, -Math.cos((g * Math.PI) / 180)];
    expect(dentroDelCono(f, a(29))).toBe(true);
    expect(dentroDelCono(f, a(31))).toBe(false);
    expect(dentroDelCono(f, f)).toBe(true);
    expect(dentroDelCono(f, [0, 0, 1])).toBe(false);
  });
});

describe('anguloFlecha', () => {
  it('0° arriba, 90° derecha, 180° abajo, -90° izquierda (en coordenadas de cámara)', () => {
    expect(anguloFlecha([0, 1, -1])).toBeCloseTo(0);
    expect(anguloFlecha([1, 0, -1])).toBeCloseTo(90);
    expect(anguloFlecha([0, -1, -1])).toBeCloseTo(180);
    expect(anguloFlecha([-1, 0, -1])).toBeCloseTo(-90);
  });
  it('justo detrás apunta a la derecha', () => {
    expect(anguloFlecha([0, 0, 1])).toBeCloseTo(90);
  });
});
