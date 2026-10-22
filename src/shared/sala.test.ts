import { describe, expect, it } from 'vitest';
import type { Clase, Escena, EstadoSala, Modulo } from './tipos';
import { aplicarComando, estadoInicial, type Comando } from './sala';

function crearEscena(): Escena {
  return {
    metrosPorCelda: 2,
    modulos: [
      { id: 'muelle-1', tipo: 'muelle', celda: [0, 0], rot: 0 },
      { id: 'grua-1', tipo: 'grua-sts', celda: [1, 0], rot: 270, params: { alcance: 40 } },
      { id: 'buque-1', tipo: 'buque', celda: [2, 0], rot: 90 },
    ],
    vistas: {
      general: { pos: [0, 10, 20], mira: [0, 0, 0] },
      grua: { pos: [5, 3, 5], mira: [6, 4, 0] },
      buque: { pos: [-8, 4, 2], mira: [-2, 2, 0] },
    },
  };
}

function crearClase(): Clase {
  return {
    id: 'clase-1',
    titulo: 'Terminal de contenedores',
    escena: 'terminal-a',
    pasos: [
      { id: 'p0', titulo: 'Vista general', vista: 'general', resaltar: [] },
      { id: 'p1', titulo: 'La grúa', vista: 'grua', resaltar: ['grua-1'], ficha: 'grua-sts' },
      {
        id: 'p2',
        titulo: 'El ciclo de descarga',
        vista: 'buque',
        resaltar: ['grua-1', 'buque-1'],
        animacion: 'descarga-ciclo',
      },
    ],
  };
}

function crear(): EstadoSala {
  return estadoInicial(crearEscena(), crearClase());
}

function aplicar(e: EstadoSala, ...cs: Comando[]): EstadoSala {
  return cs.reduce((acc, c, i) => aplicarComando(acc, c, 100 + i), e);
}

function congelar<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as object)) congelar(v);
  }
  return x;
}

describe('estadoInicial', () => {
  it('arranca en el paso 0 con su vista, seq 0 y version 0', () => {
    const e = crear();
    expect(e.version).toBe(0);
    expect(e.paso).toBe(0);
    expect(e.ubicacion).toEqual({ pos: [0, 10, 20], mira: [0, 0, 0], seq: 0 });
    expect(e.resaltado).toBeNull();
    expect(e.fichaAbierta).toBeNull();
    expect(e.mirenAca).toBeNull();
    expect(e.animacion).toBeNull();
    expect(e.recentrar).toBe(0);
  });

  it('aplica ficha, resaltado y animación del paso 0 con inicio 0', () => {
    const clase = crearClase();
    clase.pasos[0] = {
      id: 'p0', titulo: 'Inicio', vista: 'grua', resaltar: ['grua-1'], ficha: 'f', animacion: 'a',
    };
    const e = estadoInicial(crearEscena(), clase);
    expect(e.ubicacion.pos).toEqual([5, 3, 5]);
    expect(e.resaltado).toBe('grua-1');
    expect(e.fichaAbierta).toBe('f');
    expect(e.animacion).toEqual({ id: 'a', inicio: 0 });
  });

  it('sin pasos usa la primera vista de la escena, o ceros si no hay', () => {
    const sinPasos: Clase = { ...crearClase(), pasos: [] };
    const e = estadoInicial(crearEscena(), sinPasos);
    expect(e.paso).toBe(0);
    expect(e.ubicacion).toEqual({ pos: [0, 10, 20], mira: [0, 0, 0], seq: 0 });
    const sinVistas = estadoInicial({ ...crearEscena(), vistas: {} }, sinPasos);
    expect(sinVistas.ubicacion).toEqual({ pos: [0, 0, 0], mira: [0, 0, 0], seq: 0 });
  });
});

describe('navegación de pasos', () => {
  it('siguiente desde el paso 0 va al 1 con su vista, seq +1 y version +1', () => {
    const e = crear();
    const s = aplicarComando(e, { t: 'siguiente' }, 5);
    expect(s.paso).toBe(1);
    expect(s.ubicacion.pos).toEqual(e.escena.vistas.grua.pos);
    expect(s.ubicacion.mira).toEqual(e.escena.vistas.grua.mira);
    expect(s.ubicacion.seq).toBe(e.ubicacion.seq + 1);
    expect(s.version).toBe(e.version + 1);
    expect(s.resaltado).toBe('grua-1');
    expect(s.fichaAbierta).toBe('grua-sts');
    expect(s.mirenAca).toBeNull();
    expect(s.animacion).toBeNull();
  });

  it('anterior en el paso 0 devuelve el mismo objeto', () => {
    const e = crear();
    expect(aplicarComando(e, { t: 'anterior' }, 1)).toBe(e);
  });

  it('siguiente en el último paso y irA fuera de rango no hacen nada', () => {
    const e = aplicar(crear(), { t: 'irA', paso: 2 });
    expect(aplicarComando(e, { t: 'siguiente' }, 1)).toBe(e);
    expect(aplicarComando(e, { t: 'irA', paso: 3 }, 1)).toBe(e);
    expect(aplicarComando(e, { t: 'irA', paso: -1 }, 1)).toBe(e);
    expect(aplicarComando(e, { t: 'irA', paso: 1.5 }, 1)).toBe(e);
  });

  it('un paso con animación fija { id, inicio: ahora }', () => {
    const s = aplicarComando(crear(), { t: 'irA', paso: 2 }, 1234);
    expect(s.animacion).toEqual({ id: 'descarga-ciclo', inicio: 1234 });
    expect(s.resaltado).toBe('grua-1');
  });

  it('al cambiar de paso se limpian mirenAca y la animación anterior', () => {
    let e = aplicar(crear(), { t: 'irA', paso: 2 }, { t: 'mirenAca', pos: [1, 2, 3] });
    expect(e.mirenAca).toEqual([1, 2, 3]);
    e = aplicarComando(e, { t: 'anterior' }, 9);
    expect(e.mirenAca).toBeNull();
    expect(e.animacion).toBeNull();
  });

  it('irA al paso actual lo vuelve a entrar (reinicia la animación)', () => {
    const e = aplicarComando(crear(), { t: 'irA', paso: 2 }, 10);
    const r = aplicarComando(e, { t: 'irA', paso: 2 }, 50);
    expect(r.version).toBe(e.version + 1);
    expect(r.ubicacion.seq).toBe(e.ubicacion.seq + 1);
    expect(r.animacion).toEqual({ id: 'descarga-ciclo', inicio: 50 });
  });

  it('con una vista inexistente conserva la posición pero sube seq', () => {
    const clase = crearClase();
    clase.pasos[1] = { ...clase.pasos[1], vista: 'no-existe' };
    const e = estadoInicial(crearEscena(), clase);
    const s = aplicarComando(e, { t: 'siguiente' }, 1);
    expect(s.paso).toBe(1);
    expect(s.ubicacion.pos).toEqual(e.ubicacion.pos);
    expect(s.ubicacion.mira).toEqual(e.ubicacion.mira);
    expect(s.ubicacion.seq).toBe(e.ubicacion.seq + 1);
  });
});

describe('comandos de presentación', () => {
  it('traer cambia la ubicación y sube seq, sin cambiar el paso', () => {
    const e = crear();
    const s = aplicarComando(e, { t: 'traer', pos: [9, 1, 9], mira: [0, 1, 0] }, 1);
    expect(s.ubicacion).toEqual({ pos: [9, 1, 9], mira: [0, 1, 0], seq: e.ubicacion.seq + 1 });
    expect(s.paso).toBe(e.paso);
    expect(s.version).toBe(e.version + 1);
  });

  it('resaltar y ficha cambian el valor; repetirlo no hace nada', () => {
    const e = crear();
    const r = aplicarComando(e, { t: 'resaltar', id: 'buque-1' }, 1);
    expect(r.resaltado).toBe('buque-1');
    expect(r.version).toBe(1);
    expect(aplicarComando(r, { t: 'resaltar', id: 'buque-1' }, 2)).toBe(r);
    expect(aplicarComando(e, { t: 'resaltar', id: null }, 2)).toBe(e);
    const f = aplicarComando(e, { t: 'ficha', id: 'x' }, 1);
    expect(f.fichaAbierta).toBe('x');
    expect(aplicarComando(f, { t: 'ficha', id: 'x' }, 2)).toBe(f);
    expect(aplicarComando(f, { t: 'ficha', id: null }, 2).fichaAbierta).toBeNull();
  });

  it('mirenAca fija el punto; null sobre null no hace nada', () => {
    const e = crear();
    expect(aplicarComando(e, { t: 'mirenAca', pos: null }, 1)).toBe(e);
    const s = aplicarComando(e, { t: 'mirenAca', pos: [1, 2, 3] }, 1);
    expect(s.mirenAca).toEqual([1, 2, 3]);
    expect(aplicarComando(s, { t: 'mirenAca', pos: null }, 2).mirenAca).toBeNull();
  });

  it('animar fija { id, inicio: ahora }', () => {
    const s = aplicarComando(crear(), { t: 'animar', id: 'descarga-ciclo' }, 777);
    expect(s.animacion).toEqual({ id: 'descarga-ciclo', inicio: 777 });
    expect(s.version).toBe(1);
  });

  it('recentrar incrementa el contador', () => {
    const s = aplicar(crear(), { t: 'recentrar' }, { t: 'recentrar' });
    expect(s.recentrar).toBe(2);
    expect(s.version).toBe(2);
  });
});

describe('escena', () => {
  it('girar suma 90° módulo 360 (270 -> 0)', () => {
    const s = aplicarComando(crear(), { t: 'escena', op: { op: 'girar', id: 'grua-1' } }, 1);
    expect(s.escena.modulos.find((m) => m.id === 'grua-1')?.rot).toBe(0);
    const t = aplicarComando(s, { t: 'escena', op: { op: 'girar', id: 'grua-1' } }, 1);
    expect(t.escena.modulos.find((m) => m.id === 'grua-1')?.rot).toBe(90);
    expect(t.version).toBe(2);
  });

  it('mover cambia la celda; mover a la misma celda o a un id inexistente no hace nada', () => {
    const e = crear();
    const s = aplicarComando(e, { t: 'escena', op: { op: 'mover', id: 'muelle-1', celda: [4, 5] } }, 1);
    expect(s.escena.modulos[0].celda).toEqual([4, 5]);
    expect(aplicarComando(e, { t: 'escena', op: { op: 'mover', id: 'muelle-1', celda: [0, 0] } }, 1)).toBe(e);
    expect(aplicarComando(e, { t: 'escena', op: { op: 'mover', id: 'nada', celda: [1, 1] } }, 1)).toBe(e);
  });

  it('params mezcla los valores; id inexistente no hace nada', () => {
    const e = crear();
    const s = aplicarComando(e, { t: 'escena', op: { op: 'params', id: 'grua-1', params: { altura: 30 } } }, 1);
    expect(s.escena.modulos[1].params).toEqual({ alcance: 40, altura: 30 });
    const u = aplicarComando(e, { t: 'escena', op: { op: 'params', id: 'muelle-1', params: { largo: 3 } } }, 1);
    expect(u.escena.modulos[0].params).toEqual({ largo: 3 });
    expect(aplicarComando(e, { t: 'escena', op: { op: 'params', id: 'nada', params: { a: 1 } } }, 1)).toBe(e);
  });

  it('agregar suma el módulo; con un id repetido devuelve el mismo objeto', () => {
    const e = crear();
    const nuevo: Modulo = { id: 'tractor-1', tipo: 'tractor', celda: [3, 3], rot: 0 };
    const s = aplicarComando(e, { t: 'escena', op: { op: 'agregar', modulo: nuevo } }, 1);
    expect(s.escena.modulos).toHaveLength(4);
    expect(s.escena.modulos[3]).toEqual(nuevo);
    const repetido: Modulo = { id: 'grua-1', tipo: 'grua-sts', celda: [9, 9], rot: 0 };
    expect(aplicarComando(e, { t: 'escena', op: { op: 'agregar', modulo: repetido } }, 1)).toBe(e);
  });

  it('borrar de un módulo resaltado y presente en resaltar del paso 2 limpia ambos', () => {
    let e = aplicar(crear(), { t: 'irA', paso: 2 });
    expect(e.resaltado).toBe('grua-1');
    e = aplicarComando(e, { t: 'escena', op: { op: 'borrar', id: 'grua-1' } }, 1);
    expect(e.resaltado).toBeNull();
    expect(e.escena.modulos.map((m) => m.id)).toEqual(['muelle-1', 'buque-1']);
    expect(e.clase.pasos[2].resaltar).toEqual(['buque-1']);
    expect(e.clase.pasos[1].resaltar).toEqual([]);
  });

  it('borrar un módulo no resaltado deja el resaltado intacto; id inexistente no hace nada', () => {
    const e = aplicar(crear(), { t: 'irA', paso: 2 });
    const s = aplicarComando(e, { t: 'escena', op: { op: 'borrar', id: 'buque-1' } }, 1);
    expect(s.resaltado).toBe('grua-1');
    expect(aplicarComando(e, { t: 'escena', op: { op: 'borrar', id: 'nada' } }, 1)).toBe(e);
  });
});

describe('clase', () => {
  const pasoNuevo = { id: 'pn', titulo: 'Nuevo', vista: 'buque', resaltar: [] as string[] };

  it('agregarPaso con despuesDe 0 lo inserta en la posición 1', () => {
    const e = crear();
    const s = aplicarComando(e, { t: 'clase', op: { op: 'agregarPaso', paso: pasoNuevo, despuesDe: 0 } }, 1);
    expect(s.clase.pasos.map((p) => p.id)).toEqual(['p0', 'pn', 'p1', 'p2']);
    expect(s.paso).toBe(0);
    expect(s.version).toBe(1);
  });

  it('agregarPaso antes del paso actual mantiene al alumno en el mismo paso', () => {
    const e = aplicar(crear(), { t: 'irA', paso: 1 });
    const s = aplicarComando(e, { t: 'clase', op: { op: 'agregarPaso', paso: pasoNuevo, despuesDe: -1 } }, 1);
    expect(s.clase.pasos.map((p) => p.id)).toEqual(['pn', 'p0', 'p1', 'p2']);
    expect(s.paso).toBe(2);
    expect(s.ubicacion).toBe(e.ubicacion);
  });

  it('agregarPaso con id repetido no hace nada', () => {
    const e = crear();
    const dup = { ...pasoNuevo, id: 'p1' };
    expect(aplicarComando(e, { t: 'clase', op: { op: 'agregarPaso', paso: dup, despuesDe: 0 } }, 1)).toBe(e);
  });

  it('borrarPaso del paso actual siendo el último deja paso en el nuevo último índice', () => {
    const e = aplicar(crear(), { t: 'irA', paso: 2 });
    const s = aplicarComando(e, { t: 'clase', op: { op: 'borrarPaso', indice: 2 } }, 7);
    expect(s.clase.pasos).toHaveLength(2);
    expect(s.paso).toBe(1);
    expect(s.ubicacion.pos).toEqual(s.escena.vistas.grua.pos);
    expect(s.ubicacion.seq).toBe(e.ubicacion.seq + 1);
    expect(s.animacion).toBeNull();
    expect(s.resaltado).toBe('grua-1');
    expect(s.fichaAbierta).toBe('grua-sts');
    expect(s.version).toBe(e.version + 1);
  });

  it('borrarPaso de uno anterior al actual corre el índice sin mover la ubicación', () => {
    const e = aplicar(crear(), { t: 'irA', paso: 2 });
    const s = aplicarComando(e, { t: 'clase', op: { op: 'borrarPaso', indice: 0 } }, 7);
    expect(s.paso).toBe(1);
    expect(s.clase.pasos.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(s.ubicacion).toBe(e.ubicacion);
  });

  it('borrarPaso fuera de rango no hace nada; borrar el único paso deja el estado limpio', () => {
    const e = crear();
    expect(aplicarComando(e, { t: 'clase', op: { op: 'borrarPaso', indice: 5 } }, 1)).toBe(e);
    const una: Clase = { ...crearClase(), pasos: [crearClase().pasos[1]] };
    const solo = estadoInicial(crearEscena(), una);
    const s = aplicarComando(solo, { t: 'clase', op: { op: 'borrarPaso', indice: 0 } }, 1);
    expect(s.clase.pasos).toEqual([]);
    expect(s.paso).toBe(0);
    expect(s.resaltado).toBeNull();
    expect(s.fichaAbierta).toBeNull();
  });

  it('editarPaso cambia el paso; índice inválido o sin cambios no hace nada', () => {
    const e = crear();
    const s = aplicarComando(e, { t: 'clase', op: { op: 'editarPaso', indice: 1, cambios: { titulo: 'Otra' } } }, 1);
    expect(s.clase.pasos[1].titulo).toBe('Otra');
    expect(s.clase.pasos[1].vista).toBe('grua');
    expect(aplicarComando(e, { t: 'clase', op: { op: 'editarPaso', indice: 9, cambios: { titulo: 'x' } } }, 1)).toBe(e);
    expect(aplicarComando(e, { t: 'clase', op: { op: 'editarPaso', indice: 1, cambios: { titulo: 'La grúa' } } }, 1)).toBe(e);
  });

  it('guardarVista escribe en escena.vistas y sube version', () => {
    const e = crear();
    const s = aplicarComando(e, { t: 'clase', op: { op: 'guardarVista', id: 'nueva', vista: { pos: [1, 1, 1], mira: [2, 2, 2] } } }, 1);
    expect(s.escena.vistas.nueva).toEqual({ pos: [1, 1, 1], mira: [2, 2, 2] });
    expect(s.escena.vistas.general).toBe(e.escena.vistas.general);
    expect(s.version).toBe(e.version + 1);
  });
});

describe('pureza', () => {
  it('no muta el estado de entrada (congelado en profundidad)', () => {
    const e = congelar(crear());
    const comandos: Comando[] = [
      { t: 'siguiente' },
      { t: 'irA', paso: 2 },
      { t: 'traer', pos: [1, 1, 1], mira: [0, 0, 0] },
      { t: 'resaltar', id: 'buque-1' },
      { t: 'ficha', id: 'x' },
      { t: 'mirenAca', pos: [1, 2, 3] },
      { t: 'animar', id: 'a' },
      { t: 'recentrar' },
      { t: 'escena', op: { op: 'agregar', modulo: { id: 'z', tipo: 'via', celda: [0, 1], rot: 0 } } },
      { t: 'escena', op: { op: 'mover', id: 'muelle-1', celda: [3, 3] } },
      { t: 'escena', op: { op: 'girar', id: 'grua-1' } },
      { t: 'escena', op: { op: 'borrar', id: 'grua-1' } },
      { t: 'escena', op: { op: 'params', id: 'grua-1', params: { a: 1 } } },
      { t: 'clase', op: { op: 'agregarPaso', paso: { id: 'n', titulo: 'n', vista: 'general', resaltar: [] }, despuesDe: 0 } },
      { t: 'clase', op: { op: 'editarPaso', indice: 0, cambios: { titulo: 'x' } } },
      { t: 'clase', op: { op: 'borrarPaso', indice: 2 } },
      { t: 'clase', op: { op: 'guardarVista', id: 'v', vista: { pos: [0, 0, 0], mira: [1, 1, 1] } } },
    ];
    const copia = JSON.parse(JSON.stringify(e));
    for (const c of comandos) {
      expect(() => aplicarComando(e, c, 1)).not.toThrow();
    }
    expect(e).toEqual(copia);
  });

  it('comparte estructura: lo que no cambia conserva la misma referencia', () => {
    const e = crear();
    const s = aplicarComando(e, { t: 'escena', op: { op: 'girar', id: 'grua-1' } }, 1);
    expect(s.clase).toBe(e.clase);
    expect(s.escena.vistas).toBe(e.escena.vistas);
    expect(s.escena.modulos[0]).toBe(e.escena.modulos[0]);
  });

  it('50 comandos alternados dejan version estrictamente creciente', () => {
    let e = crear();
    for (let i = 0; i < 50; i++) {
      const c: Comando =
        i % 3 === 0 ? { t: 'recentrar' } : i % 3 === 1 ? { t: 'siguiente' } : { t: 'anterior' };
      const antes = e.version;
      e = aplicarComando(e, c, i);
      expect(e.version).toBeGreaterThan(antes);
    }
    expect(e.version).toBe(50);
  });
});
