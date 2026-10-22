import { describe, expect, it } from 'vitest';
import { comandoTraer, esLinkLocal, factorSuavizado, guinadaHacia, idFichaAlternada, teclaAComando, urlAlumno } from './controlesDocente';

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
  it('si la base pública es inválida, vuelve al origen', () => {
    for (const malo of ['basura', '%%%', 'ftp:x', 'javascript:alert(1)']) {
      expect(urlAlumno('http://localhost:5173', '1234', malo)).toBe('http://localhost:5173/?sala=1234&rol=alumno');
    }
  });
  it('de la base pública solo se conserva el origen', () => {
    expect(urlAlumno('http://localhost:5173', '1234', 'https://x.com/?a=1')).toBe('https://x.com/?sala=1234&rol=alumno');
    expect(urlAlumno('http://localhost:5173', '1234', 'https://x.com/ruta/#h')).toBe('https://x.com/?sala=1234&rol=alumno');
  });
  it('usa la base pública si se pasa, sin barra final', () => {
    expect(urlAlumno('http://localhost:5173', '1234', 'https://algo.trycloudflare.com/')).toBe('https://algo.trycloudflare.com/?sala=1234&rol=alumno');
    expect(urlAlumno('http://localhost:5173', '1234', '')).toBe('http://localhost:5173/?sala=1234&rol=alumno');
    expect(urlAlumno('http://localhost:5173', '1234', null)).toBe('http://localhost:5173/?sala=1234&rol=alumno');
  });
});

describe('esLinkLocal', () => {
  it('detecta localhost y loopback', () => {
    expect(esLinkLocal('http://localhost:5173/?sala=1')).toBe(true);
    expect(esLinkLocal('http://127.0.0.1:5173')).toBe(true);
    expect(esLinkLocal('http://[::1]:5173')).toBe(true);
  });
  it('no marca links públicos, de la LAN ni inválidos', () => {
    expect(esLinkLocal('https://algo.trycloudflare.com')).toBe(false);
    expect(esLinkLocal('http://192.168.1.20:5173')).toBe(false);
    expect(esLinkLocal('basura')).toBe(false);
  });
});

describe('idFichaAlternada', () => {
  it('abre la del paso si no hay ninguna abierta', () => {
    expect(idFichaAlternada(null, 'grua-sts')).toBe('grua-sts');
  });
  it('cierra si hay una abierta, sea la del paso o no', () => {
    expect(idFichaAlternada('grua-sts', 'grua-sts')).toBeNull();
    expect(idFichaAlternada('otra', 'grua-sts')).toBeNull();
  });
  it('sin ficha en el paso no abre nada', () => {
    expect(idFichaAlternada(null, undefined)).toBeNull();
  });
});
