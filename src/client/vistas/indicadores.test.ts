import { describe, expect, it } from 'vitest';
import { estadoIndicador } from './alumno';

describe('estadoIndicador', () => {
  it('conectado: oculto', () => {
    expect(estadoIndicador(true, 0)).toBe('oculto');
  });
  it('desconectado hace menos de 2 s: oculto', () => {
    expect(estadoIndicador(false, 1999)).toBe('oculto');
  });
  it('desconectado desde hace 2 s o más: aviso', () => {
    expect(estadoIndicador(false, 2000)).toBe('aviso');
  });
});
