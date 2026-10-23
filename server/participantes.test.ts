import { describe, expect, it } from 'vitest';
import { Participantes } from './participantes';

describe('Participantes', () => {
  it('numera Alumno 1, 2, 3 por orden de llegada', () => {
    const p = new Participantes();
    const a = {}, b = {}, c = {};
    expect(p.unir(a, 'alumno').nombre).toBe('Alumno 1');
    expect(p.unir(b, 'alumno').nombre).toBe('Alumno 2');
    expect(p.unir(c, 'alumno').nombre).toBe('Alumno 3');
    expect(p.lista().map((x) => x.nombre)).toEqual(['Alumno 1', 'Alumno 2', 'Alumno 3']);
  });

  it('reutiliza el número más bajo libre tras quitar', () => {
    const p = new Participantes();
    const a = {}, b = {}, c = {};
    p.unir(a, 'alumno'); p.unir(b, 'alumno'); p.unir(c, 'alumno');
    p.quitar(a);
    expect(p.unir({}, 'alumno').nombre).toBe('Alumno 1');
    p.quitar(b);
    expect(p.unir({}, 'alumno').nombre).toBe('Alumno 2');
  });

  it('docente, editor y proyector se llaman por su rol y no gastan números', () => {
    const p = new Participantes();
    expect(p.unir({}, 'docente').nombre).toBe('docente');
    expect(p.unir({}, 'proyector').nombre).toBe('proyector');
    expect(p.unir({}, 'alumno').nombre).toBe('Alumno 1');
  });

  it('actualizar guarda batería y carga; ignora sockets desconocidos', () => {
    const p = new Participantes();
    const a = {};
    p.unir(a, 'alumno', 1000);
    expect(p.lista()[0]).toMatchObject({ bateria: null, cargando: null, desde: 1000, rol: 'alumno' });
    p.actualizar(a, 0.15, false);
    expect(p.lista()[0]).toMatchObject({ bateria: 0.15, cargando: false });
    expect(() => p.actualizar({}, 0.5, true)).not.toThrow();
    expect(p.lista()).toHaveLength(1);
  });

  it('los ids son únicos y quitar un desconocido no rompe', () => {
    const p = new Participantes();
    const x = p.unir({}, 'alumno');
    const y = p.unir({}, 'alumno');
    expect(x.id).not.toBe(y.id);
    expect(() => p.quitar({})).not.toThrow();
  });
});
