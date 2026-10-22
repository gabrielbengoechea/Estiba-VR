import type {
  Clase, Escena, EstadoSala, Modulo, Paso, Ubicacion, Vec3, Vista,
} from './tipos';

export type OpEscena =
  | { op: 'agregar'; modulo: Modulo } | { op: 'mover'; id: string; celda: [number, number] }
  | { op: 'girar'; id: string } | { op: 'borrar'; id: string }
  | { op: 'params'; id: string; params: Record<string, number> };
export type OpClase =
  | { op: 'agregarPaso'; paso: Paso; despuesDe: number } | { op: 'editarPaso'; indice: number; cambios: Partial<Paso> }
  | { op: 'borrarPaso'; indice: number } | { op: 'guardarVista'; id: string; vista: Vista };
export type Comando =
  | { t: 'siguiente' } | { t: 'anterior' } | { t: 'irA'; paso: number }
  | { t: 'resaltar'; id: string | null } | { t: 'ficha'; id: string | null }
  | { t: 'mirenAca'; pos: Vec3 | null } | { t: 'traer'; pos: Vec3; mira: Vec3 }
  | { t: 'animar'; id: string } | { t: 'recentrar' }
  | { t: 'escena'; op: OpEscena } | { t: 'clase'; op: OpClase };

type Efectos = Pick<EstadoSala, 'paso' | 'ubicacion' | 'resaltado' | 'fichaAbierta' | 'mirenAca' | 'animacion'>;

const CERO: Vec3 = [0, 0, 0];

/** Lo que cambia al entrar a un paso. Si su vista no existe, conserva la posición previa pero sube seq. */
function entrarPaso(escena: Escena, clase: Clase, indice: number, previa: Ubicacion, seq: number, ahora: number): Efectos {
  const paso = clase.pasos[indice];
  const vista = escena.vistas[paso.vista];
  return {
    paso: indice,
    ubicacion: vista ? { pos: vista.pos, mira: vista.mira, seq } : { pos: previa.pos, mira: previa.mira, seq },
    resaltado: paso.resaltar[0] ?? null,
    fichaAbierta: paso.ficha ?? null,
    mirenAca: null,
    animacion: paso.animacion ? { id: paso.animacion, inicio: ahora } : null,
  };
}

export function estadoInicial(escena: Escena, clase: Clase): EstadoSala {
  const primera = Object.values(escena.vistas)[0];
  const previa: Ubicacion = { pos: primera?.pos ?? CERO, mira: primera?.mira ?? CERO, seq: 0 };
  const efectos: Efectos = clase.pasos.length > 0
    ? entrarPaso(escena, clase, 0, previa, 0, 0)
    : { paso: 0, ubicacion: previa, resaltado: null, fichaAbierta: null, mirenAca: null, animacion: null };
  return { version: 0, escena, clase, recentrar: 0, ...efectos };
}

function conVersion(e: EstadoSala, cambios: Partial<EstadoSala>): EstadoSala {
  return { ...e, ...cambios, version: e.version + 1 };
}

function irAPaso(e: EstadoSala, indice: number, ahora: number): EstadoSala {
  if (!Number.isInteger(indice) || indice < 0 || indice >= e.clase.pasos.length) return e;
  if (indice === e.paso) return e;
  return conVersion(e, entrarPaso(e.escena, e.clase, indice, e.ubicacion, e.ubicacion.seq + 1, ahora));
}

function reemplazarModulo(e: EstadoSala, id: string, f: (m: Modulo) => Modulo): EstadoSala {
  const i = e.escena.modulos.findIndex((m) => m.id === id);
  if (i < 0) return e;
  const nuevo = f(e.escena.modulos[i]);
  if (nuevo === e.escena.modulos[i]) return e;
  const modulos = e.escena.modulos.slice();
  modulos[i] = nuevo;
  return conVersion(e, { escena: { ...e.escena, modulos } });
}

function aplicarEscena(e: EstadoSala, o: OpEscena): EstadoSala {
  switch (o.op) {
    case 'agregar':
      if (e.escena.modulos.some((m) => m.id === o.modulo.id)) return e;
      return conVersion(e, { escena: { ...e.escena, modulos: [...e.escena.modulos, o.modulo] } });
    case 'mover':
      return reemplazarModulo(e, o.id, (m) =>
        m.celda[0] === o.celda[0] && m.celda[1] === o.celda[1] ? m : { ...m, celda: [o.celda[0], o.celda[1]] });
    case 'girar':
      return reemplazarModulo(e, o.id, (m) => ({ ...m, rot: ((m.rot + 90) % 360) as Modulo['rot'] }));
    case 'params':
      return reemplazarModulo(e, o.id, (m) => ({ ...m, params: { ...m.params, ...o.params } }));
    case 'borrar': {
      if (!e.escena.modulos.some((m) => m.id === o.id)) return e;
      const modulos = e.escena.modulos.filter((m) => m.id !== o.id);
      const pasos = e.clase.pasos.map((p) =>
        p.resaltar.includes(o.id) ? { ...p, resaltar: p.resaltar.filter((r) => r !== o.id) } : p);
      return conVersion(e, {
        escena: { ...e.escena, modulos },
        clase: { ...e.clase, pasos },
        resaltado: e.resaltado === o.id ? null : e.resaltado,
      });
    }
    default: return e;
  }
}

function aplicarClase(e: EstadoSala, o: OpClase, ahora: number): EstadoSala {
  const pasos = e.clase.pasos;
  switch (o.op) {
    case 'agregarPaso': {
      if (pasos.some((p) => p.id === o.paso.id)) return e;
      const en = Math.min(Math.max(Math.trunc(o.despuesDe) + 1, 0), pasos.length);
      const nuevos = [...pasos.slice(0, en), o.paso, ...pasos.slice(en)];
      // El paso actual sigue siendo el mismo aunque se inserte antes de él.
      const paso = pasos.length > 0 && en <= e.paso ? e.paso + 1 : e.paso;
      return conVersion(e, { clase: { ...e.clase, pasos: nuevos }, paso });
    }
    case 'editarPaso': {
      if (!Number.isInteger(o.indice) || o.indice < 0 || o.indice >= pasos.length) return e;
      const actual = pasos[o.indice];
      const cambia = (Object.keys(o.cambios) as (keyof Paso)[]).some((k) => o.cambios[k] !== actual[k]);
      if (!cambia) return e;
      const nuevos = pasos.slice();
      nuevos[o.indice] = { ...actual, ...o.cambios };
      return conVersion(e, { clase: { ...e.clase, pasos: nuevos } });
    }
    case 'borrarPaso': {
      if (!Number.isInteger(o.indice) || o.indice < 0 || o.indice >= pasos.length) return e;
      const nuevos = pasos.filter((_, i) => i !== o.indice);
      const clase = { ...e.clase, pasos: nuevos };
      if (nuevos.length === 0) {
        return conVersion(e, { clase, paso: 0, resaltado: null, fichaAbierta: null, mirenAca: null, animacion: null });
      }
      if (o.indice < e.paso) return conVersion(e, { clase, paso: e.paso - 1 });
      if (o.indice > e.paso) return conVersion(e, { clase });
      // Se borró el paso actual: se entra al que ocupa su lugar (o al nuevo último).
      const destino = Math.min(e.paso, nuevos.length - 1);
      return conVersion(e, { clase, ...entrarPaso(e.escena, clase, destino, e.ubicacion, e.ubicacion.seq + 1, ahora) });
    }
    case 'guardarVista':
      return conVersion(e, { escena: { ...e.escena, vistas: { ...e.escena.vistas, [o.id]: o.vista } } });
    default: return e;
  }
}

export function aplicarComando(e: EstadoSala, c: Comando, ahora: number): EstadoSala {
  switch (c.t) {
    case 'siguiente': return irAPaso(e, e.paso + 1, ahora);
    case 'anterior': return irAPaso(e, e.paso - 1, ahora);
    case 'irA': return irAPaso(e, c.paso, ahora);
    case 'resaltar': return e.resaltado === c.id ? e : conVersion(e, { resaltado: c.id });
    case 'ficha': return e.fichaAbierta === c.id ? e : conVersion(e, { fichaAbierta: c.id });
    case 'mirenAca':
      if (c.pos === null && e.mirenAca === null) return e;
      return conVersion(e, { mirenAca: c.pos });
    case 'traer':
      return conVersion(e, { ubicacion: { pos: c.pos, mira: c.mira, seq: e.ubicacion.seq + 1 } });
    case 'animar': return conVersion(e, { animacion: { id: c.id, inicio: ahora } });
    case 'recentrar': return conVersion(e, { recentrar: e.recentrar + 1 });
    case 'escena': return aplicarEscena(e, c.op);
    case 'clase': return aplicarClase(e, c.op, ahora);
    default: return e;
  }
}
