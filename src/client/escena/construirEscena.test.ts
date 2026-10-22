import { describe, it, expect } from 'vitest';
import { diferenciaEscena } from './construirEscena';
import type { Escena, Modulo } from '../../shared/tipos';

const a: Modulo = { id: 'a', tipo: 'muelle', celda: [0, 0], rot: 0 };
const b: Modulo = { id: 'b', tipo: 'bloque-patio', celda: [2, 3], rot: 90, params: { filas: 4 } };
const escena = (modulos: Modulo[]): Escena => ({ metrosPorCelda: 10, modulos, vistas: {} });

describe('diferenciaEscena', () => {
  it('de null a dos módulos crea los dos', () => {
    const d = diferenciaEscena(null, escena([a, b]));
    expect(d.crear.map((m) => m.id)).toEqual(['a', 'b']);
    expect(d.actualizar).toEqual([]);
    expect(d.borrar).toEqual([]);
  });
  it('mover un módulo solo lo actualiza a él', () => {
    const d = diferenciaEscena(escena([a, b]), escena([a, { ...b, celda: [5, 3] }]));
    expect(d.actualizar.map((m) => m.id)).toEqual(['b']);
    expect(d.crear).toEqual([]);
    expect(d.borrar).toEqual([]);
  });
  it('cambiar rot o params actualiza', () => {
    expect(diferenciaEscena(escena([a]), escena([{ ...a, rot: 180 }])).actualizar).toHaveLength(1);
    expect(diferenciaEscena(escena([b]), escena([{ ...b, params: { filas: 5 } }])).actualizar).toHaveLength(1);
  });
  it('quitar un módulo lo lista en borrar', () => {
    const d = diferenciaEscena(escena([a, b]), escena([a]));
    expect(d.borrar).toEqual(['b']);
    expect(d.crear).toEqual([]);
    expect(d.actualizar).toEqual([]);
  });
  it('la misma escena no produce cambios', () => {
    const d = diferenciaEscena(escena([a, b]), escena([{ ...a }, { ...b, params: { ...b.params } }]));
    expect(d).toEqual({ crear: [], actualizar: [], borrar: [] });
  });
});
