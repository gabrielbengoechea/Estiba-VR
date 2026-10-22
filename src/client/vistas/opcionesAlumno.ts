// Palancas de la dirección para celulares lentos: `?sombras=0` apaga las sombras y baja la resolución (pixel ratio 1).
export interface OpcionesRendimiento { sombras: boolean; pixelRatioMax: number }

export function opcionesRendimiento(busqueda: string): OpcionesRendimiento {
  const sinSombras = new URLSearchParams(busqueda).get('sombras') === '0';
  return { sombras: !sinSombras, pixelRatioMax: sinSombras ? 1 : 2 };
}
