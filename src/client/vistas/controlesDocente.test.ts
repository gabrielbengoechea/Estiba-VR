import { describe, expect, it } from 'vitest';
import { comandoTraer, factorSuavizado, guinadaHacia, teclaAComando, urlAlumno } from './controlesDocente';

describe('teclaAComando', () => {
  it('las flechas pasan de paso', () => {
    expect(teclaAComando('ArrowRight')).toEqual({ t: 'siguiente' });
    expect(teclaAComando('ArrowLeft')).toEqual({ t: 'anterior' });
  });
  it('otras teclas no hacen nada', () => {
    expect(teclaAComando('m')).toBeNull();
    expect(teclaAComando('Enter')).toBeNull();
  });
});

describe('comandoTraer', () => {
  it('baja la posición a 1,7 m y mira en la misma dirección que la cámara', () => {
    expect(comandoTraer([10, 50, -20], [0, 0, -1])).toEqual({ t: 'traer', pos: [10, 1.7, -20], mira: [10, 1.7, -30] });
  });
});

describe('guinadaHacia', () => {
  it('mirar hacia -z no gira', () => {
    expect(guinadaHacia([0, 1, 0], [0, 5, -10])).toBeCloseTo(0);
  });
  it('mirar hacia +x gira -90 grados', () => {
    expect(guinadaHacia([0, 1, 0], [10, 1, 0])).toBeCloseTo(-Math.PI / 2);
  });
  it('mirar hacia arriba sin desplazamiento horizontal no gira', () => {
    expect(guinadaHacia([3, 1, 3], [3, 9, 3])).toBe(0);
  });
});

describe('factorSuavizado', () => {
  it('va de 0 hacia 1 con el tiempo', () => {
    expect(factorSuavizado(0, 8)).toBe(0);
    expect(factorSuavizado(0.1, 8)).toBeGreaterThan(0.5);
    expect(factorSuavizado(10, 8)).toBeCloseTo(1);
  });
});

describe('urlAlumno', () => {
  it('arma el link con sala y rol', () => {
    expect(urlAlumno('https://estiba.test', '1234')).toBe('https://estiba.test/?sala=1234&rol=alumno');
  });
});
