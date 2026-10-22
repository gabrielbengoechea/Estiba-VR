import { describe, expect, it } from 'vitest';
import type { Escena } from '../../shared/tipos';
import {
  celdaArrastrada, esTeclaEnCampo, nuevoId, opColocar, rectanguloHuella, teclaAOp,
} from './herramientas';

const escenaVacia: Escena = { metrosPorCelda: 10, modulos: [], vistas: {} };

describe('nuevoId', () => {
  it('usa el menor número libre', () => {
    expect(nuevoId('grua-sts', ['grua-sts-1', 'grua-sts-3'])).toBe('grua-sts-2');
  });
  it('arranca en 1', () => {
    expect(nuevoId('via', [])).toBe('via-1');
  });
  it('ignora ids de otros tipos y los que no encajan', () => {
    expect(nuevoId('via', ['via-1', 'via-2x', 'muelle-2', 'via-02'])).toBe('via-2');
  });
});

describe('opColocar', () => {
  it('bloque de patio con los parámetros por defecto', () => {
    expect(opColocar('bloque-patio', [4, 5], escenaVacia)).toEqual({
      op: 'agregar',
      modulo: {
        id: 'bloque-patio-1', tipo: 'bloque-patio', celda: [4, 5], rot: 0,
        params: { filas: 6, bahias: 20, altura: 4, ocupacion: 0.7, semilla: 7 },
      },
    });
  });
  it('evita ids ya usados y no inventa params para tipos fijos', () => {
    const e: Escena = {
      ...escenaVacia,
      modulos: [{ id: 'grua-sts-1', tipo: 'grua-sts', celda: [0, 0], rot: 0 }],
    };
    const op = opColocar('grua-sts', [2, 3], e);
    expect(op).toEqual({ op: 'agregar', modulo: { id: 'grua-sts-2', tipo: 'grua-sts', celda: [2, 3], rot: 0 } });
  });
  it('los params por defecto son una copia', () => {
    const a = opColocar('via', [0, 0], escenaVacia);
    if (a.op === 'agregar' && a.modulo.params) a.modulo.params.largo = 99;
    const b = opColocar('via', [0, 0], escenaVacia);
    expect(b.op === 'agregar' && b.modulo.params).toEqual({ largo: 20 });
  });
});

describe('teclaAOp', () => {
  it('R gira y Supr borra el seleccionado', () => {
    expect(teclaAOp('r', 'a-1')).toEqual({ op: 'girar', id: 'a-1' });
    expect(teclaAOp('R', 'a-1')).toEqual({ op: 'girar', id: 'a-1' });
    expect(teclaAOp('Delete', 'a-1')).toEqual({ op: 'borrar', id: 'a-1' });
  });
  it('Retroceso no borra (solo Supr)', () => {
    expect(teclaAOp('Backspace', 'a-1')).toBeNull();
  });
  it('sin selección o con otra tecla no hace nada', () => {
    expect(teclaAOp('r', null)).toBeNull();
    expect(teclaAOp('x', 'a-1')).toBeNull();
  });
});

describe('esTeclaEnCampo', () => {
  it('cualquier control de formulario, incluido el slider; los botones no', () => {
    expect(esTeclaEnCampo('INPUT', 'text')).toBe(true);
    expect(esTeclaEnCampo('INPUT', 'number')).toBe(true);
    expect(esTeclaEnCampo('TEXTAREA')).toBe(true);
    expect(esTeclaEnCampo('SELECT')).toBe(true);
    expect(esTeclaEnCampo('INPUT', 'range')).toBe(true);
    expect(esTeclaEnCampo('BUTTON')).toBe(false);
    expect(esTeclaEnCampo(undefined)).toBe(false);
  });
});

describe('celdaArrastrada', () => {
  it('suma el desplazamiento del puntero en celdas a la celda original', () => {
    expect(celdaArrastrada([10, 4], [3, 3], [6, 1])).toEqual([13, 2]);
    expect(celdaArrastrada([0, 0], [5, 5], [5, 5])).toEqual([0, 0]);
  });
});

describe('rectanguloHuella', () => {
  const casi = (a: number[][], b: number[][]) =>
    a.forEach((p, i) => p.forEach((v, j) => expect(v).toBeCloseTo(b[i][j], 9)));
  it('rot 0: crece en +x y hacia tierra (-z) desde la celda', () => {
    casi(rectanguloHuella([2, 3], [4, 2], 0), [[2, 3], [6, 3], [6, 1], [2, 1]]);
  });
  it('rot 90 gira alrededor de la celda como rotation.y de three', () => {
    // (x,z) -> (z, -x)
    casi(rectanguloHuella([2, 3], [4, 2], 90), [[2, 3], [2, -1], [0, -1], [0, 3]]);
  });
  it('rot 180', () => {
    casi(rectanguloHuella([0, 0], [4, 2], 180), [[0, 0], [-4, 0], [-4, 2], [0, 2]]);
  });
});
