// Lógica pura del editor (sin DOM ni three.js): ids, módulos nuevos, atajos de teclado y geometría de la huella.
import type { Escena, Modulo, TipoModulo } from '../../shared/tipos';
import type { OpEscena } from '../../shared/sala';

/** Parámetros con los que nace cada tipo parametrizable (los mismos que asume el catálogo). */
const PARAMS_POR_DEFECTO: Partial<Record<TipoModulo, Record<string, number>>> = {
  muelle: { largo: 40 },
  'bloque-patio': { filas: 6, bahias: 20, altura: 4, ocupacion: 0.7, semilla: 7 },
  puerta: { carriles: 4 },
  via: { largo: 20 },
  deposito: { ancho: 6, largo: 10 },
};

export function paramsPorDefecto(tipo: TipoModulo): Record<string, number> | undefined {
  const p = PARAMS_POR_DEFECTO[tipo];
  return p ? { ...p } : undefined;
}

/** `'<tipo>-<n>'` con el menor n >= 1 que no esté en uso. */
export function nuevoId(tipo: TipoModulo, existentes: string[]): string {
  const usados = new Set<number>();
  const prefijo = `${tipo}-`;
  for (const id of existentes) {
    if (!id.startsWith(prefijo)) continue;
    const resto = id.slice(prefijo.length);
    if (/^[1-9]\d*$/.test(resto)) usados.add(Number(resto));
  }
  let n = 1;
  while (usados.has(n)) n++;
  return `${prefijo}${n}`;
}

export function opColocar(tipo: TipoModulo, celda: [number, number], escena: Escena): OpEscena {
  const modulo: Modulo = {
    id: nuevoId(tipo, escena.modulos.map((m) => m.id)),
    tipo,
    celda: [celda[0], celda[1]],
    rot: 0,
  };
  const params = paramsPorDefecto(tipo);
  if (params) modulo.params = params;
  return { op: 'agregar', modulo };
}

/** R gira y Supr borra (Retroceso no, para no borrar por accidente) el módulo seleccionado. */
export function teclaAOp(tecla: string, seleccionado: string | null): OpEscena | null {
  if (seleccionado === null) return null;
  if (tecla === 'r' || tecla === 'R') return { op: 'girar', id: seleccionado };
  if (tecla === 'Delete') return { op: 'borrar', id: seleccionado };
  return null;
}

/** Los atajos no deben dispararse mientras se escribe. Cuenta cualquier control con foco, también un slider. */
export function esTeclaEnCampo(tag: string | undefined, _tipo?: string): boolean {
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Celda de destino al arrastrar: la original más lo que se movió el puntero, en celdas. */
export function celdaArrastrada(
  celdaOriginal: [number, number], celdaPunteroInicio: [number, number], celdaPunteroAhora: [number, number],
): [number, number] {
  return [
    celdaOriginal[0] + celdaPunteroAhora[0] - celdaPunteroInicio[0],
    celdaOriginal[1] + celdaPunteroAhora[1] - celdaPunteroInicio[1],
  ];
}

/**
 * Esquinas de la huella (en celdas, [x, z]) de un módulo en `celda` con giro `rot`.
 * La huella crece en +x y hacia tierra (-z) desde la celda, como los bloques de patio y los depósitos, y gira alrededor de ella, igual que rotation.y de three.js.
 */
export function rectanguloHuella(celda: [number, number], huella: [number, number], rot: number): [number, number][] {
  const a = (rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [w, h] = huella;
  return ([[0, 0], [w, 0], [w, -h], [0, -h]] as [number, number][]).map(([x, z]) => [
    celda[0] + x * c + z * s,
    celda[1] - x * s + z * c,
  ]);
}
