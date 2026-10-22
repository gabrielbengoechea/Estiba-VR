import { describe, expect, it } from 'vitest';
import type { Clase } from '../../shared/tipos';
import { alternarResaltado, idPasoLibre, idVistaLibre, opAgregarPasoDesdeVista, resumenPaso } from './pasos';

const clase: Clase = {
  id: 'c', titulo: 'C', escena: 'e',
  pasos: [
    { id: 'paso-1', titulo: 'Uno', vista: 'general', resaltar: [] },
    { id: 'paso-2', titulo: 'Dos', vista: 'general', resaltar: ['sts-1'], ficha: 'grua-sts', animacion: 'atraque' },
  ],
};
const camara = { pos: [1, 2, 3] as [number, number, number], mira: [4, 5, 6] as [number, number, number] };

describe('opAgregarPasoDesdeVista', () => {
  it('devuelve guardarVista y agregarPaso con ids libres', () => {
    const ops = opAgregarPasoDesdeVista(clase, ['general'], 0, camara, 'Nuevo');
    expect(ops).toEqual([
      { op: 'guardarVista', id: 'vista-1', vista: camara },
      { op: 'agregarPaso', despuesDe: 0, paso: { id: 'paso-3', titulo: 'Nuevo', vista: 'vista-1', resaltar: [] } },
    ]);
  });

  it('salta los ids de vista ya usados', () => {
    const ops = opAgregarPasoDesdeVista(clase, ['vista-1', 'vista-3'], 1, camara, 'X');
    expect(ops[0]).toMatchObject({ id: 'vista-2' });
    expect(ops[1]).toMatchObject({ despuesDe: 1, paso: { vista: 'vista-2' } });
  });

  it('copia la cámara para no compartir referencias', () => {
    const ops = opAgregarPasoDesdeVista(clase, [], 0, camara, 'X');
    const v = (ops[0] as { vista: typeof camara }).vista;
    expect(v).not.toBe(camara);
    expect(v.pos).not.toBe(camara.pos);
  });
});

describe('ids libres', () => {
  it('idPasoLibre usa el menor n libre', () => {
    expect(idPasoLibre(['paso-1', 'paso-3', 'llegada'])).toBe('paso-2');
    expect(idPasoLibre([])).toBe('paso-1');
  });
  it('idVistaLibre ignora ids que no son vista-<n>', () => {
    expect(idVistaLibre(['general', 'vista-01', 'vista-x'])).toBe('vista-1');
  });
});

describe('resumenPaso', () => {
  it('resume resaltado, ficha y animación', () => {
    expect(resumenPaso(clase.pasos[1])).toBe('resalta sts-1 · ficha grua-sts · animación atraque');
    expect(resumenPaso(clase.pasos[0])).toBe('sin resaltado · sin ficha · sin animación');
  });
});

describe('alternarResaltado', () => {
  it('suma si no estaba y quita si estaba', () => {
    expect(alternarResaltado(['a'], 'b')).toEqual(['a', 'b']);
    expect(alternarResaltado(['a', 'b'], 'a')).toEqual(['b']);
    expect(alternarResaltado([], 'x')).toEqual(['x']);
  });
});
