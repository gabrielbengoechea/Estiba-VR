export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Rol = 'docente' | 'alumno' | 'proyector' | 'editor';
export type TipoModulo =
  | 'muelle' | 'grua-sts' | 'buque' | 'tractor' | 'bloque-patio'
  | 'grua-rtg' | 'puerta' | 'via' | 'tren' | 'deposito';

export interface Modulo {
  id: string;
  tipo: TipoModulo;
  celda: [number, number];
  rot: 0 | 90 | 180 | 270;
  params?: Record<string, number>;
  nombre?: string;
  /** Posición libre en metros [x, z]; si existe manda sobre `celda`. */
  pos?: [number, number];
  /** Giro libre en grados; si existe manda sobre `rot`. */
  giro?: number;
}

export type TipoTrazado = 'via' | 'carril' | 'camino';
/** Trazado dibujado: `puntos` son [x, z] en metros. */
export interface Trazado { id: string; tipo: TipoTrazado; puntos: [number, number][]; nombre?: string }

export interface Vista { pos: Vec3; mira: Vec3 }

export interface Escena {
  metrosPorCelda: number;
  modulos: Modulo[];
  vistas: Record<string, Vista>;
  trazados?: Trazado[];
}

export interface Paso {
  id: string;
  titulo: string;
  vista: string;
  resaltar: string[];
  animacion?: string;
  ficha?: string;
}

export interface Clase { id: string; titulo: string; escena: string; pasos: Paso[] }

export interface Ficha {
  id: string;
  titulo: string;
  texto: string;
  datos: { etiqueta: string; valor: string }[];
  explotada?: 'grua-sts';
  ejemplo?: boolean;
}

export interface Ubicacion { pos: Vec3; mira: Vec3; seq: number }

export interface EstadoSala {
  version: number;
  escena: Escena;
  clase: Clase;
  paso: number;
  ubicacion: Ubicacion;
  resaltado: string | null;
  fichaAbierta: string | null;
  mirenAca: Vec3 | null;
  animacion: { id: string; inicio: number } | null;
  recentrar: number;
  /** El docente deja que los alumnos caminen libremente. Apagado por defecto. */
  recorridoLibre?: boolean;
}
