import type { Comando, OpClase, OpEscena } from './sala';
import type { EstadoSala, Modulo, Paso, Quat, Rol, TipoModulo, Vec3, Vista } from './tipos';

type Rayo = { origen: Vec3; dir: Vec3 } | null;
type Cabeza = { pos: Vec3; quat: Quat };

export type MsgCliente =
  | { t: 'unirse'; sala: string; rol: Rol; pin?: string }
  | { t: 'comando'; c: Comando }
  | { t: 'pose'; cabeza: Cabeza; rayo: Rayo }
  | { t: 'ping'; tc: number };

export type MsgServidor =
  | { t: 'estado'; e: EstadoSala; ts: number }
  | { t: 'pose'; cabeza: Cabeza; rayo: Rayo }
  | { t: 'pong'; tc: number; ts: number }
  | { t: 'error'; motivo: string };

const ROLES: readonly Rol[] = ['docente', 'alumno', 'proyector', 'editor'];
const TIPOS: readonly TipoModulo[] = [
  'muelle', 'grua-sts', 'buque', 'tractor', 'bloque-patio',
  'grua-rtg', 'puerta', 'via', 'tren', 'deposito',
];
const ROTS: readonly number[] = [0, 90, 180, 270];

type Obj = Record<string, unknown>;

const esObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const esNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const esTexto = (x: unknown): x is string => typeof x === 'string';
const esTextoONull = (x: unknown): x is string | null => x === null || typeof x === 'string';
const esNums = (x: unknown, n: number): boolean => Array.isArray(x) && x.length === n && x.every(esNum);
const esVec3 = (x: unknown): x is Vec3 => esNums(x, 3);
const esQuat = (x: unknown): x is Quat => esNums(x, 4);
const esListaTexto = (x: unknown): x is string[] => Array.isArray(x) && x.every(esTexto);

function leerParams(x: unknown): Record<string, number> | null {
  if (!esObj(x)) return null;
  const r: Record<string, number> = {};
  for (const [k, v] of Object.entries(x)) {
    if (!esNum(v)) return null;
    r[k] = v;
  }
  return r;
}

function leerModulo(x: unknown): Modulo | null {
  if (!esObj(x)) return null;
  if (!esTexto(x.id) || !TIPOS.includes(x.tipo as TipoModulo)) return null;
  if (!esNums(x.celda, 2) || !ROTS.includes(x.rot as number)) return null;
  const celda = x.celda as number[];
  const m: Modulo = {
    id: x.id, tipo: x.tipo as TipoModulo, celda: [celda[0], celda[1]], rot: x.rot as Modulo['rot'],
  };
  if (x.params !== undefined) {
    const p = leerParams(x.params);
    if (!p) return null;
    m.params = p;
  }
  if (x.nombre !== undefined) {
    if (!esTexto(x.nombre)) return null;
    m.nombre = x.nombre;
  }
  return m;
}

/** Copia los campos de Paso que vengan en `x` (solo los conocidos). Con `completo` exige los obligatorios. */
function leerPaso(x: unknown, completo: boolean): Partial<Paso> | null {
  if (!esObj(x)) return null;
  const p: Partial<Paso> = {};
  for (const k of ['id', 'titulo', 'vista'] as const) {
    if (x[k] === undefined) { if (completo) return null; continue; }
    const v = x[k];
    if (!esTexto(v)) return null;
    p[k] = v;
  }
  if (x.resaltar === undefined) {
    if (completo) return null;
  } else {
    if (!esListaTexto(x.resaltar)) return null;
    p.resaltar = x.resaltar.slice();
  }
  for (const k of ['animacion', 'ficha'] as const) {
    if (x[k] === undefined) continue;
    const v = x[k];
    // En una edición, `null` quita la ficha o la animación del paso.
    if (v === null && !completo) { p[k] = undefined; continue; }
    if (!esTexto(v)) return null;
    p[k] = v;
  }
  return p;
}

function leerVista(x: unknown): Vista | null {
  if (!esObj(x) || !esVec3(x.pos) || !esVec3(x.mira)) return null;
  return { pos: x.pos, mira: x.mira };
}

function leerOpEscena(x: unknown): OpEscena | null {
  if (!esObj(x)) return null;
  switch (x.op) {
    case 'agregar': {
      const modulo = leerModulo(x.modulo);
      return modulo ? { op: 'agregar', modulo } : null;
    }
    case 'mover': {
      if (!esTexto(x.id) || !esNums(x.celda, 2)) return null;
      const celda = x.celda as number[];
      return { op: 'mover', id: x.id, celda: [celda[0], celda[1]] };
    }
    case 'girar': return esTexto(x.id) ? { op: 'girar', id: x.id } : null;
    case 'borrar': return esTexto(x.id) ? { op: 'borrar', id: x.id } : null;
    case 'params': {
      const params = leerParams(x.params);
      return esTexto(x.id) && params ? { op: 'params', id: x.id, params } : null;
    }
    default: return null;
  }
}

function leerOpClase(x: unknown): OpClase | null {
  if (!esObj(x)) return null;
  switch (x.op) {
    case 'agregarPaso': {
      const paso = leerPaso(x.paso, true) as Paso | null;
      return paso && esNum(x.despuesDe) ? { op: 'agregarPaso', paso, despuesDe: x.despuesDe } : null;
    }
    case 'editarPaso': {
      const cambios = leerPaso(x.cambios, false);
      return cambios && esNum(x.indice) ? { op: 'editarPaso', indice: x.indice, cambios } : null;
    }
    case 'borrarPaso': return esNum(x.indice) ? { op: 'borrarPaso', indice: x.indice } : null;
    case 'guardarVista': {
      const vista = leerVista(x.vista);
      return esTexto(x.id) && vista ? { op: 'guardarVista', id: x.id, vista } : null;
    }
    default: return null;
  }
}

function leerComando(x: unknown): Comando | null {
  if (!esObj(x)) return null;
  switch (x.t) {
    case 'siguiente': return { t: 'siguiente' };
    case 'anterior': return { t: 'anterior' };
    case 'recentrar': return { t: 'recentrar' };
    case 'irA': return esNum(x.paso) ? { t: 'irA', paso: x.paso } : null;
    case 'resaltar': return esTextoONull(x.id) ? { t: 'resaltar', id: x.id } : null;
    case 'ficha': return esTextoONull(x.id) ? { t: 'ficha', id: x.id } : null;
    case 'mirenAca':
      if (x.pos === null) return { t: 'mirenAca', pos: null };
      return esVec3(x.pos) ? { t: 'mirenAca', pos: x.pos } : null;
    case 'traer': return esVec3(x.pos) && esVec3(x.mira) ? { t: 'traer', pos: x.pos, mira: x.mira } : null;
    case 'animar': return esTexto(x.id) ? { t: 'animar', id: x.id } : null;
    case 'escena': {
      const op = leerOpEscena(x.op);
      return op ? { t: 'escena', op } : null;
    }
    case 'clase': {
      const op = leerOpClase(x.op);
      return op ? { t: 'clase', op } : null;
    }
    default: return null;
  }
}

function leerCabeza(x: unknown): Cabeza | null {
  return esObj(x) && esVec3(x.pos) && esQuat(x.quat) ? { pos: x.pos, quat: x.quat } : null;
}

/** `undefined` = forma inválida; `null` = sin rayo. */
function leerRayo(x: unknown): Rayo | undefined {
  if (x === null) return null;
  return esObj(x) && esVec3(x.origen) && esVec3(x.dir) ? { origen: x.origen, dir: x.dir } : undefined;
}

/** Devuelve el mensaje validado y saneado, o null si no es JSON o no cumple la forma. */
export function leerMsgCliente(texto: string): MsgCliente | null {
  let x: unknown;
  try { x = JSON.parse(texto); } catch { return null; }
  if (!esObj(x)) return null;
  switch (x.t) {
    case 'unirse': {
      if (!esTexto(x.sala) || !ROLES.includes(x.rol as Rol)) return null;
      const rol = x.rol as Rol;
      if (x.pin === undefined) return { t: 'unirse', sala: x.sala, rol };
      return esTexto(x.pin) ? { t: 'unirse', sala: x.sala, rol, pin: x.pin } : null;
    }
    case 'comando': {
      const c = leerComando(x.c);
      return c ? { t: 'comando', c } : null;
    }
    case 'pose': {
      const cabeza = leerCabeza(x.cabeza);
      const rayo = leerRayo(x.rayo);
      return cabeza && rayo !== undefined ? { t: 'pose', cabeza, rayo } : null;
    }
    case 'ping': return esNum(x.tc) ? { t: 'ping', tc: x.tc } : null;
    default: return null;
  }
}
