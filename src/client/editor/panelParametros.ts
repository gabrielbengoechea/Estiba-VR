// Panel de parámetros del módulo seleccionado: un control deslizante por parámetro editable.
// Al soltar el control manda solo el parámetro que cambió; mientras se arrastra, solo actualiza el número.
import type { Modulo } from '../../shared/tipos';
import { catalogo } from '../escena/catalogo';
import { paramsPorDefecto } from './herramientas';

export class PanelParametros {
  private idActual: string | null = null;

  constructor(
    private contenedor: HTMLElement,
    private alCambiar: (id: string, params: Record<string, number>) => void,
  ) {
    this.mostrar(null);
  }

  /** Redibuja para `modulo`. Si es el mismo módulo y se está tocando un control, no lo pisa. */
  mostrar(modulo: Modulo | null): void {
    const mismo = modulo !== null && modulo.id === this.idActual;
    if (mismo && this.contenedor.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) {
      return;
    }
    this.idActual = modulo?.id ?? null;
    this.contenedor.textContent = '';
    const titulo = document.createElement('h2');
    titulo.textContent = 'Parámetros';
    this.contenedor.append(titulo);

    if (!modulo) {
      this.nota('Elegí un módulo en la grilla para ver sus parámetros.');
      return;
    }
    const entrada = catalogo[modulo.tipo];
    const nombre = document.createElement('p');
    nombre.className = 'nombre-modulo';
    nombre.textContent = `${modulo.nombre ?? entrada.nombre} (${modulo.id})`;
    this.contenedor.append(nombre);
    const pos = document.createElement('p');
    pos.className = 'detalle';
    pos.textContent = `Celda ${modulo.celda[0]}, ${modulo.celda[1]} · giro ${modulo.rot}°`;
    this.contenedor.append(pos);

    if (entrada.paramsEditables.length === 0) {
      this.nota('Este módulo no tiene parámetros para ajustar.');
      return;
    }
    const defecto = paramsPorDefecto(modulo.tipo) ?? {};
    for (const def of entrada.paramsEditables) {
      const valor = modulo.params?.[def.clave] ?? defecto[def.clave] ?? def.min;
      const fila = document.createElement('label');
      fila.className = 'param';
      const texto = document.createElement('span');
      const lectura = document.createElement('output');
      lectura.textContent = String(valor);
      texto.append(`${def.etiqueta}: `, lectura);
      const rango = document.createElement('input');
      rango.type = 'range';
      rango.min = String(def.min);
      rango.max = String(def.max);
      rango.step = String(def.paso);
      rango.value = String(valor);
      rango.addEventListener('input', () => { lectura.textContent = rango.value; });
      rango.addEventListener('change', () => {
        if (this.idActual !== null) this.alCambiar(this.idActual, { [def.clave]: Number(rango.value) });
      });
      fila.append(texto, rango);
      this.contenedor.append(fila);
    }
  }

  private nota(texto: string): void {
    const p = document.createElement('p');
    p.className = 'detalle';
    p.textContent = texto;
    this.contenedor.append(p);
  }
}
