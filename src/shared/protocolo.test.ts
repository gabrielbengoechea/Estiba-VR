import { describe, expect, it } from 'vitest';
import { leerEscena, leerMsgCliente, MAX_PUNTOS_ESCENA } from './protocolo';

const v = (x = 0): [number, number, number] => [x, 0, 0];
const modulo = { id: 'm1', tipo: 'grua-sts', celda: [1, 2], rot: 90 };
const paso = { id: 'p1', titulo: 'Paso', vista: 'v1', resaltar: ['m1'] };

describe('leerMsgCliente', () => {
  it('devuelve null si no es JSON', () => {
    expect(leerMsgCliente('no es json')).toBeNull();
    expect(leerMsgCliente('null')).toBeNull();
    expect(leerMsgCliente('42')).toBeNull();
    expect(leerMsgCliente('[]')).toBeNull();
  });

  it('rechaza comandos desconocidos', () => {
    expect(leerMsgCliente('{"t":"comando","c":{"t":"volar"}}')).toBeNull();
    expect(leerMsgCliente('{"t":"comando"}')).toBeNull();
    expect(leerMsgCliente('{"t":"otra"}')).toBeNull();
  });

  it('devuelve un unirse válido tal cual', () => {
    const m = { t: 'unirse', sala: '1234', rol: 'alumno' };
    expect(leerMsgCliente(JSON.stringify(m))).toEqual(m);
    const d = { t: 'unirse', sala: '1234', rol: 'docente', pin: '0000' };
    expect(leerMsgCliente(JSON.stringify(d))).toEqual(d);
  });

  it('rechaza unirse con rol, sala o pin de tipo incorrecto', () => {
    expect(leerMsgCliente('{"t":"unirse","sala":"1234","rol":"rey"}')).toBeNull();
    expect(leerMsgCliente('{"t":"unirse","sala":1234,"rol":"alumno"}')).toBeNull();
    expect(leerMsgCliente('{"t":"unirse","sala":"1234","rol":"docente","pin":5}')).toBeNull();
  });

  it('valida ping y pose', () => {
    expect(leerMsgCliente('{"t":"ping","tc":12}')).toEqual({ t: 'ping', tc: 12 });
    expect(leerMsgCliente('{"t":"ping","tc":"x"}')).toBeNull();
    const pose = { t: 'pose', cabeza: { pos: v(1), quat: [0, 0, 0, 1] }, rayo: null };
    expect(leerMsgCliente(JSON.stringify(pose))).toEqual(pose);
    const conRayo = { ...pose, rayo: { origen: v(), dir: v(1) } };
    expect(leerMsgCliente(JSON.stringify(conRayo))).toEqual(conRayo);
  });

  it('rechaza una pose con pos de 2 números o quat de 3', () => {
    const mala = { t: 'pose', cabeza: { pos: [1, 2], quat: [0, 0, 0, 1] }, rayo: null };
    expect(leerMsgCliente(JSON.stringify(mala))).toBeNull();
    const mala2 = { t: 'pose', cabeza: { pos: v(), quat: [0, 0, 1] }, rayo: null };
    expect(leerMsgCliente(JSON.stringify(mala2))).toBeNull();
    const mala3 = { t: 'pose', cabeza: { pos: v(), quat: [0, 0, 0, 1] }, rayo: { origen: v(), dir: [1] } };
    expect(leerMsgCliente(JSON.stringify(mala3))).toBeNull();
    const sinRayo = { t: 'pose', cabeza: { pos: v(), quat: [0, 0, 0, 1] } };
    expect(leerMsgCliente(JSON.stringify(sinRayo))).toBeNull();
  });

  it('rechaza números no finitos en Vec3', () => {
    // JSON no tiene NaN/Infinity; 1e999 se parsea como Infinity.
    const texto = '{"t":"comando","c":{"t":"mirenAca","pos":[1,2,1e999]}}';
    expect(leerMsgCliente(texto)).toBeNull();
  });

  it('acepta los comandos simples', () => {
    for (const c of [
      { t: 'siguiente' }, { t: 'anterior' }, { t: 'irA', paso: 2 },
      { t: 'resaltar', id: 'm1' }, { t: 'resaltar', id: null },
      { t: 'ficha', id: null }, { t: 'mirenAca', pos: v(1) }, { t: 'mirenAca', pos: null },
      { t: 'traer', pos: v(1), mira: v(2) }, { t: 'animar', id: 'a' }, { t: 'recentrar' },
    ]) {
      expect(leerMsgCliente(JSON.stringify({ t: 'comando', c }))).toEqual({ t: 'comando', c });
    }
  });

  it('rechaza comandos con campos faltantes o de tipo incorrecto', () => {
    for (const c of [
      { t: 'irA' }, { t: 'irA', paso: '1' }, { t: 'resaltar' }, { t: 'resaltar', id: 3 },
      { t: 'mirenAca', pos: [1, 2] }, { t: 'traer', pos: v() }, { t: 'animar', id: null },
      { t: 'escena' }, { t: 'escena', op: { op: 'volar' } }, { t: 'clase', op: { op: 'x' } },
    ]) {
      expect(leerMsgCliente(JSON.stringify({ t: 'comando', c }))).toBeNull();
    }
  });

  it('valida las operaciones de escena', () => {
    const buenas = [
      { op: 'agregar', modulo },
      { op: 'agregar', modulo: { ...modulo, params: { largo: 3 }, nombre: 'Grúa' } },
      { op: 'mover', id: 'm1', celda: [3, 4] }, { op: 'girar', id: 'm1' }, { op: 'borrar', id: 'm1' },
      { op: 'params', id: 'm1', params: { alto: 2 } },
    ];
    for (const op of buenas) {
      expect(leerMsgCliente(JSON.stringify({ t: 'comando', c: { t: 'escena', op } })))
        .toEqual({ t: 'comando', c: { t: 'escena', op } });
    }
    const malas = [
      { op: 'agregar', modulo: { ...modulo, tipo: 'nave' } },
      { op: 'agregar', modulo: { ...modulo, rot: 45 } },
      { op: 'agregar', modulo: { ...modulo, celda: [1] } },
      { op: 'agregar', modulo: { ...modulo, params: { largo: 'x' } } },
      { op: 'agregar' }, { op: 'mover', id: 'm1', celda: [1, 'a'] }, { op: 'girar' },
      { op: 'params', id: 'm1', params: 5 },
    ];
    for (const op of malas) {
      expect(leerMsgCliente(JSON.stringify({ t: 'comando', c: { t: 'escena', op } }))).toBeNull();
    }
  });

  it('valida las operaciones de clase', () => {
    const vista = { pos: v(1), mira: v(2) };
    const buenas = [
      { op: 'agregarPaso', paso, despuesDe: 0 },
      { op: 'agregarPaso', paso: { ...paso, animacion: 'a', ficha: 'f' }, despuesDe: -1 },
      { op: 'editarPaso', indice: 0, cambios: { titulo: 'Otro', resaltar: [] } },
      { op: 'borrarPaso', indice: 1 }, { op: 'guardarVista', id: 'v2', vista },
    ];
    for (const op of buenas) {
      expect(leerMsgCliente(JSON.stringify({ t: 'comando', c: { t: 'clase', op } })))
        .toEqual({ t: 'comando', c: { t: 'clase', op } });
    }
    const malas = [
      { op: 'agregarPaso', paso: { ...paso, resaltar: 'm1' }, despuesDe: 0 },
      { op: 'agregarPaso', paso, despuesDe: 'x' },
      { op: 'editarPaso', indice: 0, cambios: { titulo: 5 } },
      { op: 'editarPaso', indice: 0 }, { op: 'borrarPaso' },
      { op: 'guardarVista', id: 'v2', vista: { pos: v() } },
    ];
    for (const op of malas) {
      expect(leerMsgCliente(JSON.stringify({ t: 'comando', c: { t: 'clase', op } }))).toBeNull();
    }
  });

  it('descarta campos desconocidos al editar un paso', () => {
    const texto = JSON.stringify({
      t: 'comando', c: { t: 'clase', op: { op: 'editarPaso', indice: 0, cambios: { titulo: 'X', id: 'otro', basura: 1 } } },
    });
    const r = leerMsgCliente(texto);
    expect(r).toEqual({
      t: 'comando', c: { t: 'clase', op: { op: 'editarPaso', indice: 0, cambios: { titulo: 'X', id: 'otro' } } },
    });
  });

  it('null en editarPaso quita la ficha y la animación; en agregarPaso no vale', () => {
    const ed = leerMsgCliente(JSON.stringify({
      t: 'comando', c: { t: 'clase', op: { op: 'editarPaso', indice: 0, cambios: { ficha: null, animacion: null } } },
    }));
    expect(ed).toMatchObject({ c: { op: { cambios: {} } } });
    const cambios = (ed as { c: { op: { cambios: Record<string, unknown> } } }).c.op.cambios;
    expect(Object.keys(cambios).sort()).toEqual(['animacion', 'ficha']);
    expect(cambios.ficha).toBeUndefined();
    expect(leerMsgCliente(JSON.stringify({
      t: 'comando', c: { t: 'clase', op: { op: 'agregarPaso', paso: { ...paso, ficha: null }, despuesDe: 0 } },
    }))).toBeNull();
  });
});

describe('leerMsgCliente: dispositivo', () => {
  const ok = (m: unknown) => leerMsgCliente(JSON.stringify(m));
  it('acepta batería 0–1 o null', () => {
    expect(ok({ t: 'dispositivo', bateria: 0.5, cargando: true })).toEqual({ t: 'dispositivo', bateria: 0.5, cargando: true });
    expect(ok({ t: 'dispositivo', bateria: null, cargando: null })).toEqual({ t: 'dispositivo', bateria: null, cargando: null });
    expect(ok({ t: 'dispositivo', bateria: 0, cargando: false })).not.toBeNull();
  });
  it('rechaza fuera de rango, tipos erróneos o campos faltantes', () => {
    expect(ok({ t: 'dispositivo', bateria: 1.5, cargando: true })).toBeNull();
    expect(ok({ t: 'dispositivo', bateria: -0.1, cargando: true })).toBeNull();
    expect(ok({ t: 'dispositivo', bateria: 'x', cargando: true })).toBeNull();
    expect(ok({ t: 'dispositivo', bateria: 0.5, cargando: 'si' })).toBeNull();
    expect(ok({ t: 'dispositivo', bateria: 0.5 })).toBeNull();
    expect(ok({ t: 'dispositivo', cargando: true })).toBeNull();
    expect(ok({ t: 'dispositivo' })).toBeNull();
  });
});

describe('leerMsgCliente: trazados, posición libre y recorrido libre', () => {
  const cmd = (c: unknown) => leerMsgCliente(JSON.stringify({ t: 'comando', c }));
  const esc = (op: unknown) => cmd({ t: 'escena', op });
  const tr = { id: 't1', tipo: 'via', puntos: [[0, 0], [10, 0]] };
  const escenaVieja = { metrosPorCelda: 2, modulos: [modulo], vistas: { general: { pos: v(), mira: v() } } };

  it('acepta mover con pos o celda, y girar con grados', () => {
    expect(esc({ op: 'mover', id: 'm1', pos: [1.5, 2] })).toEqual({ t: 'comando', c: { t: 'escena', op: { op: 'mover', id: 'm1', pos: [1.5, 2] } } });
    expect(esc({ op: 'mover', id: 'm1', celda: [1, 2] })).not.toBeNull();
    expect(esc({ op: 'mover', id: 'm1' })).toBeNull();
    expect(esc({ op: 'mover', id: 'm1', pos: [1, null] })).toBeNull();
    expect(esc({ op: 'girar', id: 'm1', grados: 15 })).not.toBeNull();
    expect(esc({ op: 'girar', id: 'm1' })).not.toBeNull();
    expect(esc({ op: 'girar', id: 'm1', grados: 'x' })).toBeNull();
  });

  it('acepta módulos con pos y giro', () => {
    expect(esc({ op: 'agregar', modulo: { ...modulo, pos: [1, 2], giro: 15 } })).not.toBeNull();
    expect(esc({ op: 'agregar', modulo: { ...modulo, giro: 'a' } })).toBeNull();
  });

  it('acepta las operaciones de trazado y rechaza las malformadas', () => {
    expect(esc({ op: 'agregarTrazado', trazado: tr })).not.toBeNull();
    expect(esc({ op: 'agregarTrazado', trazado: { ...tr, tipo: 'ruta' } })).toBeNull();
    expect(esc({ op: 'editarTrazado', id: 't1', puntos: [[0, 0], [1, 1]] })).not.toBeNull();
    expect(esc({ op: 'borrarTrazado', id: 't1' })).not.toBeNull();
    expect(esc({ op: 'borrarTrazado' })).toBeNull();
  });

  it('rechaza un trazado con 501 puntos o con NaN, y acepta 500', () => {
    const muchos = (n: number) => Array.from({ length: n }, (_, i) => [i, 0]);
    expect(esc({ op: 'agregarTrazado', trazado: { ...tr, puntos: muchos(500) } })).not.toBeNull();
    expect(esc({ op: 'agregarTrazado', trazado: { ...tr, puntos: muchos(501) } })).toBeNull();
    expect(esc({ op: 'editarTrazado', id: 't1', puntos: muchos(501) })).toBeNull();
    // JSON no tiene NaN: se manda como null o como texto, y ambos se rechazan.
    expect(esc({ op: 'agregarTrazado', trazado: { ...tr, puntos: [[0, 0], [NaN, 1]] } })).toBeNull();
    expect(esc({ op: 'agregarTrazado', trazado: { ...tr, puntos: [[0, 0], ['1', 1]] } })).toBeNull();
  });

  it('restaurar valida la escena completa y acepta el formato viejo', () => {
    expect(esc({ op: 'restaurar', escena: escenaVieja })).toEqual(
      { t: 'comando', c: { t: 'escena', op: { op: 'restaurar', escena: escenaVieja } } },
    );
    expect(esc({ op: 'restaurar', escena: { ...escenaVieja, trazados: [tr] } })).not.toBeNull();
    expect(esc({ op: 'restaurar', escena: { ...escenaVieja, modulos: [{ id: 'x' }] } })).toBeNull();
    expect(esc({ op: 'restaurar', escena: { ...escenaVieja, trazados: [{ ...tr, puntos: [[0, NaN]] }] } })).toBeNull();
    expect(esc({ op: 'restaurar', escena: 5 })).toBeNull();
    const muchos = Array.from({ length: 201 }, (_, i) => ({ ...tr, id: `t${i}` }));
    expect(esc({ op: 'restaurar', escena: { ...escenaVieja, trazados: muchos } })).toBeNull();
    expect(esc({ op: 'restaurar', escena: { ...escenaVieja, trazados: muchos.slice(0, 200) } })).not.toBeNull();
  });

  it('recorridoLibre exige un booleano', () => {
    expect(cmd({ t: 'recorridoLibre', activo: true })).toEqual({ t: 'comando', c: { t: 'recorridoLibre', activo: true } });
    expect(cmd({ t: 'recorridoLibre', activo: 'si' })).toBeNull();
    expect(cmd({ t: 'recorridoLibre' })).toBeNull();
  });
});

describe('leerEscena: límites y duplicados', () => {
  const tr = (id: string, n: number) => ({ id, tipo: 'via', puntos: Array.from({ length: n }, (_, i) => [i, 0]) });
  const base = { metrosPorCelda: 2, modulos: [modulo], vistas: {} };
  const restaurar = (escena: unknown) =>
    leerMsgCliente(JSON.stringify({ t: 'comando', c: { t: 'escena', op: { op: 'restaurar', escena } } }));

  it('acepta 5000 puntos en total y rechaza 5001', () => {
    expect(MAX_PUNTOS_ESCENA).toBe(5000);
    const diez = (n: number) => Array.from({ length: 10 }, (_, i) => tr(`t${i}`, n));
    expect(restaurar({ ...base, trazados: diez(500) })).not.toBeNull();
    expect(restaurar({ ...base, trazados: [...diez(500).slice(0, 9), tr('u', 500), tr('v', 1)] })).toBeNull();
    expect(leerEscena({ ...base, trazados: [...diez(500)] })).not.toBeNull();
    expect(leerEscena({ ...base, trazados: [...diez(500), tr('x', 2)] })).toBeNull();
  });

  it('rechaza ids de módulo o de trazado repetidos', () => {
    expect(leerEscena({ ...base, modulos: [modulo, modulo] })).toBeNull();
    expect(leerEscena({ ...base, trazados: [tr('a', 2), tr('a', 2)] })).toBeNull();
    expect(leerEscena({ ...base, trazados: [tr('a', 2), tr('b', 2)] })).not.toBeNull();
  });
});
