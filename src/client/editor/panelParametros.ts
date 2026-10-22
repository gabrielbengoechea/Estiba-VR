// Panel de parámetros del módulo seleccionado: un control deslizante por parámetro editable.
// Al soltar el control manda solo el parámetro que cambió; mientras se arrastra, solo actualiza el número.
import type { Modulo } from '../../shared/tipos';
import { catalogo } from '../escena/catalogo';
import { paramsPorDefecto } from './herramientas';

export class PanelParametros {
  private idActual: string | null = null;
  private lectura: HTMLElement | null = null;
  private controles = new Map<string, { rango: HTMLInputElement; salida: HTMLOutputElement }>();
  private arrastrando: string | null = null;

  constructor(
    private contenedor: HTMLElement,
    private alCambiar: (id: string, params: Record<string, number>) => void,
  ) {
    this.mostrar(null);
  }

  /** Muestra `modulo`. Si es el mismo con los mismos controles, solo actualiza valores (menos el que se está arrastrando). */
  mostrar(modulo: Modulo | null): void {
    if (modulo && modulo.id === this.idActual && this.lectura && this.controles.size === catalogo[modulo.tipo].paramsEditables.length) {
      this.lectura.textContent = this.detalle(modulo);
      const defecto = paramsPorDefecto(modulo.tipo) ?? {};
      for (const def of catalogo[modulo.tipo].paramsEditables) {
        const c = this.controles.get(def.clave);
        if (!c || this.arrastrando === def.clave) continue;
        const valor = String(modulo.params?.[def.clave] ?? defecto[def.clave] ?? def.min);
        c.rango.value = valor;
        c.salida.textContent = valor;
      }
      return;
    }
    this.controles.clear();
    this.lectura = null;
    this.arrastrando = null;
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
    pos.textContent = this.detalle(modulo);
    this.lectura = pos;
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
      rango.addEventListener('pointerdown', () => { this.arrastrando = def.clave; });
      const soltar = () => { if (this.arrastrando === def.clave) this.arrastrando = null; };
      rango.addEventListener('pointerup', soltar);
      rango.addEventListener('pointercancel', soltar);
      rango.addEventListener('blur', soltar);
      rango.addEventListener('keydown', () => { this.arrastrando = def.clave; });
      rango.addEventListener('change', () => {
        this.arrastrando = null;
        if (this.idActual !== null) this.alCambiar(this.idActual, { [def.clave]: Number(rango.value) });
        rango.blur(); // el foco no queda en el slider: los atajos de teclado siguen funcionando
      });
      this.controles.set(def.clave, { rango, salida: lectura });
      fila.append(texto, rango);
      this.contenedor.append(fila);
    }
  }

  private detalle(m: Modulo): string {
    return `Celda ${m.celda[0]}, ${m.celda[1]} · giro ${m.rot}°`;
  }

  private nota(texto: string): void {
    const p = document.createElement('p');
    p.className = 'detalle';
    p.textContent = texto;
    this.contenedor.append(p);
  }
}
