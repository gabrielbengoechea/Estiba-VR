import { describe, expect, it } from 'vitest';
import type { Ficha } from '../../shared/tipos';
import { contenidoPanel, ESCALA_VISOR, MEDIDAS, pxAparentes } from './fichas';

const f: Ficha = {
  id: 'x', titulo: 'Grúa', texto: 'Un párrafo largo.',
  datos: [1, 2, 3, 4].map((n) => ({ etiqueta: `E${n}`, valor: `V${n}` })), ejemplo: true,
};

describe('contenidoPanel', () => {
  it('visor: título, hasta 3 datos y nota; sin el texto', () => {
    const l = contenidoPanel(f, 'visor');
    expect(l.map((x) => x.tipo)).toEqual(['titulo', 'dato', 'dato', 'dato', 'nota']);
    expect(l.some((x) => x.texto === f.texto)).toBe(false);
    expect(l[1].texto).toBe('E1: V1');
  });
  it('escritorio: incluye el texto entre el título y los datos', () => {
    expect(contenidoPanel(f, 'escritorio').map((x) => x.tipo)).toEqual(['titulo', 'texto', 'dato', 'dato', 'dato', 'nota']);
  });
  it('sin ejemplo no hay nota', () => {
    expect(contenidoPanel({ ...f, ejemplo: false, datos: [] }, 'visor')).toEqual([{ tipo: 'titulo', texto: 'Grúa' }]);
  });
});

describe('tamaño en el visor', () => {
  it('cada línea de datos mide al menos 40 px en un ojo de 390 px de alto', () => {
    expect(pxAparentes(MEDIDAS.visor.texto, ESCALA_VISOR)).toBeGreaterThanOrEqual(40);
    expect(pxAparentes(MEDIDAS.visor.titulo, ESCALA_VISOR)).toBeGreaterThanOrEqual(40);
  });
});
