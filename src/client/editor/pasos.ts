// Armado de la clase en el editor: lista de pasos, «Agregar paso desde esta vista» y datos de cada paso.
// Lo puro (ids libres, ops, resumen) se prueba en pasos.test.ts; PanelPasos solo dibuja y manda comandos.
import type { Comando, OpClase } from '../../shared/sala';
import type { Clase, EstadoSala, Paso, Vista } from '../../shared/tipos';

/** Fichas y animaciones que existen (las animaciones las implementa la Task 13). */
export const FICHAS_DISPONIBLES: { id: string; titulo: string }[] = [
  { id: 'buque-portacontenedores', titulo: 'Buque portacontenedores' },
  { id: 'grua-sts', titulo: 'Grúa pórtico (con vista explotada)' },
  { id: 'descarga', titulo: 'Descarga' },
  { id: 'bloque-patio', titulo: 'Bloque de patio' },
  { id: 'recorrido-contenedor', titulo: 'Recorrido del contenedor' },
  { id: 'puerta-y-tren', titulo: 'Puerta y tren' },
];
export const ANIMACIONES_DISPONIBLES: { id: string; titulo: string }[] = [
  { id: 'atraque', titulo: 'Atraque del buque' },
  { id: 'descarga-ciclo', titulo: 'Ciclo de descarga' },
  { id: 'recorrido', titulo: 'Recorrido del contenedor' },
  { id: 'salida', titulo: 'Salida por puerta o tren' },
];

/** `'<prefijo>-<n>'` con el menor n >= 1 libre. */
function idLibre(prefijo: string, existentes: string[]): string {
  const usados = new Set<number>();
  for (const id of existentes) {
    if (!id.startsWith(`${prefijo}-`)) continue;
    const resto = id.slice(prefijo.length + 1);
    if (/^[1-9]\d*$/.test(resto)) usados.add(Number(resto));
  }
  let n = 1;
  while (usados.has(n)) n++;
  return `${prefijo}-${n}`;
}

export const idPasoLibre = (existentes: string[]): string => idLibre('paso', existentes);
export const idVistaLibre = (existentes: string[]): string => idLibre('vista', existentes);

/**
 * Guarda la cámara como vista nueva y agrega un paso que la usa, después del paso `despuesDe`.
 * `vistasExistentes` son las claves de `escena.vistas` (los ids de vista no viven en la clase).
 */
export function opAgregarPasoDesdeVista(
  clase: Clase, vistasExistentes: string[], despuesDe: number, camara: Vista, titulo: string,
): OpClase[] {
  const vista = idVistaLibre(vistasExistentes);
  const id = idPasoLibre(clase.pasos.map((p) => p.id));
  return [
    { op: 'guardarVista', id: vista, vista: { pos: [...camara.pos], mira: [...camara.mira] } },
    { op: 'agregarPaso', despuesDe, paso: { id, titulo, vista, resaltar: [] } },
  ];
}

/** Suma `id` a la lista de módulos resaltados, o lo quita si ya estaba. */
export function alternarResaltado(resaltar: string[], id: string): string[] {
  return resaltar.includes(id) ? resaltar.filter((r) => r !== id) : [...resaltar, id];
}

export function resumenPaso(p: Paso): string {
  return [
    p.resaltar.length > 0 ? `resalta ${p.resaltar.join(', ')}` : 'sin resaltado',
    p.ficha ? `ficha ${p.ficha}` : 'sin ficha',
    p.animacion ? `animación ${p.animacion}` : 'sin animación',
  ].join(' · ');
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...hijos);
  return e;
}

function selector(
  etiqueta: string, opciones: { id: string; titulo: string }[], valor: string | undefined, vacio: string,
  alElegir: (id: string | null) => void,
): HTMLElement {
  const s = el('select');
  s.append(el('option', { value: '', textContent: vacio }));
  for (const o of opciones) s.append(el('option', { value: o.id, textContent: o.titulo }));
  s.value = valor ?? '';
  s.addEventListener('change', () => { alElegir(s.value === '' ? null : s.value); s.blur(); });
  return el('label', { className: 'campo-paso' }, etiqueta, s);
}

export interface OpcionesPanelPasos {
  enviar(c: Comando): void;
  /** Cámara de la vista 3D pequeña, que es la que se guarda como vista del paso nuevo. */
  camara(): Vista;
}

type CambiosPaso = { [K in keyof Paso]?: Paso[K] | null };

export class PanelPasos {
  private claveVista = '';
  private estado: EstadoSala | null = null;
  private readonly lista = el('div', { className: 'lista-pasos' });
  private readonly detalle = el('div', { className: 'detalle-paso' });
  private readonly titulo = el('input', { type: 'text', placeholder: 'Título del paso nuevo', maxLength: 60 });

  constructor(private contenedor: HTMLElement, private o: OpcionesPanelPasos) {
    const agregar = el('button', { type: 'button', className: 'boton-agregar', textContent: 'Agregar paso desde esta vista' });
    agregar.title = 'Guarda la cámara de la vista 3D como vista del paso nuevo, después del paso elegido';
    agregar.addEventListener('click', () => this.agregar());
    this.contenedor.append(
      el('h2', { textContent: 'Pasos de la clase' }), this.lista,
      el('div', { className: 'fila-agregar' }, this.titulo, agregar), this.detalle,
    );
  }

  private agregar(): void {
    const e = this.estado;
    if (!e) return;
    const texto = this.titulo.value.trim() || `Paso ${e.clase.pasos.length + 1}`;
    const ops = opAgregarPasoDesdeVista(e.clase, Object.keys(e.escena.vistas), e.paso, this.o.camara(), texto);
    for (const op of ops) this.o.enviar({ t: 'clase', op });
    // El paso nuevo queda justo después del actual: se entra a él para seguir armándolo.
    this.o.enviar({ t: 'irA', paso: e.clase.pasos.length === 0 ? 0 : e.paso + 1 });
    this.titulo.value = '';
  }

  /** Sale un `editarPaso` sobre el paso actual. */
  private editar(cambios: CambiosPaso): void {
    if (!this.estado) return;
    // `null` viaja por el cable (JSON no lleva `undefined`) y el servidor lo lee como «quitar».
    this.o.enviar({ t: 'clase', op: { op: 'editarPaso', indice: this.estado.paso, cambios: cambios as Partial<Paso> } });
  }

  /** Clic en un módulo de la vista 3D: lo suma o lo quita de los resaltados del paso actual. */
  alternarModulo(id: string): void {
    const e = this.estado;
    const p = e?.clase.pasos[e.paso];
    if (!e || !p) return;
    const resaltar = alternarResaltado(p.resaltar, id);
    this.editar({ resaltar });
    this.o.enviar({ t: 'resaltar', id: resaltar[0] ?? null });
  }

  hayPasoActual(): boolean {
    return !!this.estado?.clase.pasos[this.estado.paso];
  }

  mostrar(e: EstadoSala): void {
    this.estado = e;
    const clave = JSON.stringify([e.clase.pasos, e.paso, e.escena.modulos.map((m) => [m.id, m.nombre])]);
    if (clave === this.claveVista) return;
    this.claveVista = clave;
    this.dibujarLista(e);
    this.dibujarDetalle(e);
  }

  private dibujarLista(e: EstadoSala): void {
    this.lista.textContent = '';
    if (e.clase.pasos.length === 0) {
      this.lista.append(el('p', { className: 'detalle', textContent: 'La clase todavía no tiene pasos.' }));
      return;
    }
    e.clase.pasos.forEach((p, i) => {
      const b = el('button', { type: 'button', className: `paso${i === e.paso ? ' activo' : ''}` },
        el('span', { className: 'paso-titulo', textContent: `${i + 1}. ${p.titulo}` }),
        el('span', { className: 'paso-resumen', textContent: resumenPaso(p) }));
      b.addEventListener('click', () => this.o.enviar({ t: 'irA', paso: i }));
      this.lista.append(b);
    });
  }

  private dibujarDetalle(e: EstadoSala): void {
    this.detalle.textContent = '';
    const p = e.clase.pasos[e.paso];
    if (!p) return;
    const nombre = (id: string) => e.escena.modulos.find((m) => m.id === id)?.nombre ?? id;

    const titulo = el('input', { type: 'text', value: p.titulo, maxLength: 60 });
    titulo.addEventListener('change', () => {
      const t = titulo.value.trim();
      if (t && t !== p.titulo) this.editar({ titulo: t });
    });

    const resaltados = el('div', { className: 'resaltados' });
    if (p.resaltar.length === 0) resaltados.append(el('span', { className: 'detalle', textContent: 'Nada resaltado' }));
    for (const id of p.resaltar) {
      const quitar = el('button', { type: 'button', className: 'chip', textContent: `${nombre(id)} ✕` });
      quitar.title = 'Quitar del resaltado';
      quitar.addEventListener('click', () => this.alternarModulo(id));
      resaltados.append(quitar);
    }

    const borrar = el('button', { type: 'button', className: 'borrar-paso', textContent: 'Borrar este paso' });
    borrar.addEventListener('click', () => this.o.enviar({ t: 'clase', op: { op: 'borrarPaso', indice: e.paso } }));

    this.detalle.append(
      el('h2', { textContent: `Paso ${e.paso + 1}` }),
      el('label', { className: 'campo-paso' }, 'Título', titulo),
      el('div', { className: 'campo-paso' }, 'Resaltar (hacé clic en un módulo de la vista 3D)', resaltados),
      selector('Ficha', FICHAS_DISPONIBLES, p.ficha, 'Sin ficha', (id) => this.editar({ ficha: id })),
      selector('Animación', ANIMACIONES_DISPONIBLES, p.animacion, 'Sin animación', (id) => this.editar({ animacion: id })),
      borrar,
    );
  }
}
