// Editor de escenas (laptop). Cada acción sale como un comando `escena` al servidor; la escena local
// solo cambia con el `estado` que vuelve, así que todos (editor, docente, alumnos) ven lo mismo.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Escena, EstadoSala, Modulo, TipoModulo } from '../../shared/tipos';
import type { OpEscena } from '../../shared/sala';
import { mundoACelda, posicionModulo } from '../../shared/grilla';
import { ConexionSala } from '../red';
import { configurarRenderer, crearAmbiente, habilitarSombras, moduloDe } from '../escena/ambiente';
import { EscenaViva } from '../escena/construirEscena';
import { catalogo } from '../escena/catalogo';
import {
  celdaArrastrada, esTeclaEnCampo, opColocar, paramsPorDefecto, rectanguloHuella, teclaAOp,
} from './herramientas';
import { PanelParametros } from './panelParametros';
import { PanelPasos } from './pasos';
import { instalarRegistroErrores } from '../errores';

const CAPA_OVERLAY = 1;
const UMBRAL_ARRASTRE_PX = 4;
const CELDAS_X: [number, number] = [-20, 100];
const CELDAS_Z: [number, number] = [-30, 90];

const ICONOS: Record<TipoModulo, string> = {
  muelle: '<rect x="2" y="12" width="20" height="6" fill="#8a8f94"/><rect x="2" y="18" width="20" height="3" fill="#3d6c8c"/>',
  'grua-sts': '<path d="M5 21V8m10 13V8M3 8h20M3 8l-1 4" stroke="#d9822b" stroke-width="2" fill="none"/>',
  buque: '<path d="M2 15h20l-3 5H5z" fill="#35506b"/><rect x="6" y="8" width="4" height="7" fill="#c8553d"/><rect x="11" y="10" width="4" height="5" fill="#e0b341"/>',
  tractor: '<rect x="3" y="11" width="12" height="6" fill="#e0b341"/><rect x="15" y="8" width="6" height="9" fill="#555"/><circle cx="7" cy="18" r="2" fill="#222"/><circle cx="17" cy="18" r="2" fill="#222"/>',
  'bloque-patio': '<rect x="3" y="5" width="5" height="6" fill="#c8553d"/><rect x="9" y="5" width="5" height="6" fill="#4a7ab5"/><rect x="15" y="5" width="5" height="6" fill="#e0b341"/><rect x="3" y="13" width="5" height="6" fill="#4a9a6a"/><rect x="9" y="13" width="5" height="6" fill="#c8553d"/>',
  'grua-rtg': '<path d="M4 21V6m16 15V6M2 6h20" stroke="#e0b341" stroke-width="2" fill="none"/><rect x="9" y="7" width="6" height="4" fill="#c8553d"/>',
  puerta: '<path d="M3 20V9h18v11M3 9l9-5 9 5" stroke="#8a8f94" stroke-width="2" fill="none"/><rect x="9" y="12" width="6" height="8" fill="#555"/>',
  via: '<path d="M8 3 5 21M16 3l3 18" stroke="#8a8f94" stroke-width="2"/><path d="M6 7h12M5.5 12h13M5 17h14" stroke="#6b5a45" stroke-width="2"/>',
  tren: '<rect x="2" y="9" width="6" height="8" fill="#c8553d"/><rect x="9" y="9" width="6" height="8" fill="#4a7ab5"/><rect x="16" y="9" width="6" height="8" fill="#e0b341"/><path d="M2 19h20" stroke="#555" stroke-width="2"/>',
  deposito: '<path d="M3 20V10l9-5 9 5v10z" fill="#6c737a"/><rect x="8" y="13" width="8" height="7" fill="#3a3f44"/>',
};

const ESTILO = `
  html,body{margin:0;height:100%;background:#0e1216;color:#eef0f2;font:14px system-ui,sans-serif;overflow:hidden}
  #app{display:grid;grid-template-columns:200px 1fr 320px;grid-template-rows:auto 1fr;height:100%}
  #barra{grid-column:1/4;display:flex;gap:16px;align-items:center;padding:8px 14px;background:#161c22;border-bottom:1px solid #2a323a}
  #barra .t{font-weight:700;font-size:16px}
  #estado-con{margin-left:auto}
  #estado-con.mal{color:#ff8a7a}
  #catalogo{overflow:auto;padding:10px;background:#161c22;border-right:1px solid #2a323a}
  #catalogo h2,#panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#9aa6b2;margin:4px 0 8px}
  .item{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 6px;padding:8px;border:1px solid #2a323a;border-radius:6px;background:#1d252d;color:inherit;font:inherit;cursor:pointer;text-align:left}
  .item:hover{background:#26313b}
  .item.activo{border-color:#e0b341;background:#3a3320}
  .item svg{width:28px;height:28px;flex:none}
  #centro{position:relative;min-width:0;min-height:0;overflow:hidden}
  #centro canvas{display:block;width:100%;height:100%}
  #ayuda{position:absolute;left:10px;bottom:10px;padding:6px 10px;border-radius:6px;background:#000a;pointer-events:none}
  #derecha{display:flex;flex-direction:column;min-height:0;background:#161c22;border-left:1px solid #2a323a}
  #vista3d{height:240px;flex:none;border-bottom:1px solid #2a323a;position:relative;overflow:hidden}
  #vista3d canvas{display:block;width:100%;height:100%}
  #pasos{flex:1;min-height:80px;padding:10px;overflow:auto;border-bottom:1px solid #2a323a}
  #panel{flex:none;max-height:30%;padding:10px;overflow:auto}
  .lista-pasos{max-height:170px;overflow:auto}
  .paso{display:block;width:100%;margin:0 0 6px;padding:6px 8px;border:1px solid #2a323a;border-radius:6px;background:#1d252d;color:inherit;font:inherit;text-align:left;cursor:pointer}
  .paso:hover{background:#26313b}
  .paso.activo{border-color:#e0b341;background:#3a3320}
  .paso-titulo{display:block;font-weight:700}
  .paso-resumen{display:block;color:#9aa6b2;font-size:12px;margin-top:2px}
  .fila-agregar{display:flex;flex-direction:column;gap:6px;margin:8px 0 12px}
  .fila-agregar input,.campo-paso input,.campo-paso select{width:100%;box-sizing:border-box;padding:5px 6px;border:1px solid #2a323a;border-radius:6px;background:#0e1216;color:inherit;font:inherit}
  .boton-agregar,.borrar-paso{padding:7px 10px;border:1px solid #e0b341;border-radius:6px;background:#3a3320;color:inherit;font:inherit;cursor:pointer}
  .borrar-paso{border-color:#8a3a30;background:#2a1a18;margin-top:8px}
  .campo-paso{display:block;margin:0 0 10px}
  .campo-paso>*:last-child{margin-top:4px}
  .resaltados{display:flex;flex-wrap:wrap;gap:4px}
  .chip{padding:3px 8px;border:1px solid #e0b341;border-radius:12px;background:#3a3320;color:inherit;font:inherit;cursor:pointer}
  #pasos h2{margin-top:12px}
  .nombre-modulo{font-weight:700;margin:4px 0}
  .detalle{color:#9aa6b2;margin:4px 0 12px}
  .param{display:block;margin:0 0 12px}
  .param input{display:block;width:100%;margin-top:4px}
`;

function elemento<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...hijos);
  return e;
}

type Gesto =
  | { tipo: 'mover'; id: string; celdaMod: [number, number]; celdaPtr0: [number, number]; x0: number; y0: number; movido: boolean }
  | { tipo: 'pan'; x: number; y: number };

export class Editor {
  private readonly conexion: ConexionSala;
  private readonly viva = new EscenaViva();
  private readonly escena = new THREE.Scene();
  private readonly overlay = new THREE.Group();

  private readonly rendSup: THREE.WebGLRenderer;
  private readonly camSup = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  private readonly rend3d: THREE.WebGLRenderer;
  private readonly cam3d = new THREE.PerspectiveCamera(45, 1, 0.5, 4000);
  private readonly orbita: OrbitControls;
  private readonly rayo = new THREE.Raycaster();
  private readonly plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private centro = new THREE.Vector2(0, 0); // x, z en metros
  private mitadAlto = 120; // metros que se ven desde el centro hacia arriba en la vista superior

  private estado: EstadoSala | null = null;
  private escenaJson = '';
  private sinEnmarcar = true;
  private seleccion: string | null = null;
  private seleccionPendiente: string | null = null;
  private herramienta: TipoModulo | null = null;
  private gesto: Gesto | null = null;
  private lineaSel: THREE.LineLoop | null = null;
  private lineaFantasma: THREE.LineLoop | null = null;
  private metrosGrilla = 0;
  private motivoError: string | null = null;

  private readonly panel: PanelParametros;
  private readonly pasos: PanelPasos;
  private readonly estadoCon: HTMLElement;
  private readonly ayuda: HTMLElement;
  private readonly botones = new Map<TipoModulo, HTMLButtonElement>();
  private readonly centroEl: HTMLElement;
  private readonly vista3dEl: HTMLElement;

  constructor(app: HTMLElement, sala: string, pin: string) {
    document.head.append(elemento('style', { textContent: ESTILO }));
    app.textContent = '';

    const catalogoEl = elemento('div', { id: 'catalogo' }, elemento('h2', { textContent: 'Catálogo' }));
    for (const tipo of Object.keys(catalogo) as TipoModulo[]) {
      const b = elemento('button', { className: 'item', type: 'button' });
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONOS[tipo]}</svg>`;
      b.append(catalogo[tipo].nombre);
      b.addEventListener('click', () => this.elegirHerramienta(this.herramienta === tipo ? null : tipo));
      this.botones.set(tipo, b);
      catalogoEl.append(b);
    }

    this.estadoCon = elemento('span', { id: 'estado-con', textContent: 'Conectando con la sala…' });
    const barra = elemento('div', { id: 'barra' },
      elemento('span', { className: 't', textContent: 'Estiba · Editor' }),
      elemento('span', { textContent: `Sala ${sala}` }), this.estadoCon);

    this.ayuda = elemento('div', { id: 'ayuda' });
    this.centroEl = elemento('div', { id: 'centro' }, this.ayuda);
    this.vista3dEl = elemento('div', { id: 'vista3d' });
    const pasosEl = elemento('div', { id: 'pasos' });
    const panelEl = elemento('div', { id: 'panel' });
    const derecha = elemento('div', { id: 'derecha' }, this.vista3dEl, pasosEl, panelEl);
    app.append(barra, catalogoEl, this.centroEl, derecha);

    crearAmbiente(this.escena, { mapaSombra: 1024 });
    this.escena.add(this.viva.raiz, this.overlay);
    this.overlay.layers.set(CAPA_OVERLAY);
    this.camSup.layers.enable(CAPA_OVERLAY);

    this.rendSup = this.crearRenderer(this.centroEl);
    this.rend3d = this.crearRenderer(this.vista3dEl);
    this.orbita = new OrbitControls(this.cam3d, this.rend3d.domElement);

    this.panel = new PanelParametros(panelEl, (id, params) => this.mandar({ op: 'params', id, params }));
    this.pasos = new PanelPasos(pasosEl, {
      enviar: (c) => this.conexion.enviar(c),
      camara: () => ({
        pos: [this.cam3d.position.x, this.cam3d.position.y, this.cam3d.position.z],
        mira: [this.orbita.target.x, this.orbita.target.y, this.orbita.target.z],
      }),
    });
    this.conectarClic3d(this.rend3d.domElement);
    this.actualizarAyuda();

    for (const el of [this.centroEl, this.vista3dEl]) {
      new ResizeObserver(() => this.ajustarTamano()).observe(el);
    }
    this.ajustarTamano();
    this.conectarEntrada(this.rendSup.domElement);
    addEventListener('keydown', (e) => this.alTecla(e));

    this.conexion = new ConexionSala(sala, 'editor', pin);
    this.conexion.alEstado((e) => this.recibirEstado(e));
    this.conexion.alCambioConexion((c) => {
      if (c) this.motivoError = null;
      // El motivo del servidor (p. ej. «PIN incorrecto») se queda a la vista aunque después se cierre el socket.
      if (this.motivoError) return;
      this.mostrarConexion(c ? 'Conectado' : 'Sin conexión con la sala. Reintentando…', !c);
    });
    this.conexion.alError((motivo) => { this.motivoError = motivo; this.mostrarConexion(motivo, true); });

    const bucle = () => {
      this.rendSup.render(this.escena, this.camSup);
      this.rend3d.render(this.escena, this.cam3d);
      requestAnimationFrame(bucle);
    };
    requestAnimationFrame(bucle);
  }

  // ---------- red ----------

  private mandar(op: OpEscena): void {
    this.conexion.enviar({ t: 'escena', op });
  }

  private mostrarConexion(texto: string, mal = false): void {
    this.estadoCon.textContent = texto;
    this.estadoCon.classList.toggle('mal', mal);
  }

  private recibirEstado(e: EstadoSala): void {
    this.estado = e;
    const json = JSON.stringify(e.escena);
    if (json !== this.escenaJson) {
      this.escenaJson = json;
      void this.viva.aplicar(e.escena).then(() => habilitarSombras(this.viva.raiz));
    }
    this.pasos.mostrar(e);
    if (this.metrosGrilla !== e.escena.metrosPorCelda) this.construirGrilla(e.escena.metrosPorCelda);
    if (this.sinEnmarcar) { this.sinEnmarcar = false; this.enmarcar(e.escena); }

    if (this.seleccionPendiente && e.escena.modulos.some((m) => m.id === this.seleccionPendiente)) {
      this.seleccion = this.seleccionPendiente;
      this.seleccionPendiente = null;
    }
    if (this.seleccion && !e.escena.modulos.some((m) => m.id === this.seleccion)) this.seleccion = null;
    this.refrescarSeleccion();
  }

  private moduloSeleccionado(): Modulo | null {
    return this.estado?.escena.modulos.find((m) => m.id === this.seleccion) ?? null;
  }

  private refrescarSeleccion(): void {
    const m = this.moduloSeleccionado();
    this.panel.mostrar(m);
    this.quitarContorno(this.lineaSel);
    this.lineaSel = null;
    if (m && this.estado) {
      const mpc = this.estado.escena.metrosPorCelda;
      const p = posicionModulo(m, mpc);
      this.lineaSel = this.crearContorno([p.x / mpc, p.z / mpc], catalogo[m.tipo].huella(m.params, mpc), m.giro ?? m.rot, mpc, '#ffd24a');
    }
    this.actualizarAyuda();
  }

  // ---------- catálogo / ayuda ----------

  private elegirHerramienta(tipo: TipoModulo | null): void {
    this.herramienta = tipo;
    for (const [t, b] of this.botones) b.classList.toggle('activo', t === tipo);
    this.quitarFantasma();
    this.rendSup.domElement.style.cursor = tipo ? 'crosshair' : '';
    this.actualizarAyuda();
  }

  private actualizarAyuda(): void {
    this.ayuda.textContent = this.herramienta
      ? `Hacé clic en la grilla para colocar: ${catalogo[this.herramienta].nombre} (Esc para cancelar)`
      : this.seleccion
        ? 'Arrastrá para mover · R gira · Supr borra · rueda: zoom · arrastrar el fondo: desplazar'
        : 'Elegí un módulo del catálogo, o hacé clic en uno de la grilla para seleccionarlo';
  }

  // ---------- geometría de la vista superior ----------

  private crearRenderer(host: HTMLElement): THREE.WebGLRenderer {
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    configurarRenderer(r);
    host.prepend(r.domElement);
    return r;
  }

  private ajustarTamano(): void {
    const a = this.centroEl.getBoundingClientRect();
    const b = this.vista3dEl.getBoundingClientRect();
    if (a.width > 0 && a.height > 0) this.rendSup.setSize(a.width, a.height, false);
    if (b.width > 0 && b.height > 0) {
      this.rend3d.setSize(b.width, b.height, false);
      this.cam3d.aspect = b.width / b.height;
      this.cam3d.updateProjectionMatrix();
    }
    this.actualizarCamSup();
  }

  private actualizarCamSup(): void {
    const c = this.rendSup.domElement;
    const aspecto = (c.clientWidth || 1) / (c.clientHeight || 1);
    const alto = this.mitadAlto;
    Object.assign(this.camSup, { left: -alto * aspecto, right: alto * aspecto, top: alto, bottom: -alto });
    this.camSup.up.set(0, 0, -1); // +x a la derecha y +z hacia abajo, como las filas de la grilla
    this.camSup.position.set(this.centro.x, 300, this.centro.y);
    this.camSup.lookAt(this.centro.x, 0, this.centro.y);
    this.camSup.updateProjectionMatrix();
    this.camSup.updateMatrixWorld();
  }

  private enmarcar(e: Escena): void {
    const m = e.metrosPorCelda;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const mod of e.modulos) {
      const p = posicionModulo(mod, m);
      for (const [x, z] of rectanguloHuella([p.x / m, p.z / m], catalogo[mod.tipo].huella(mod.params, m), mod.giro ?? mod.rot)) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
    }
    if (!isFinite(x0)) { x0 = 0; z0 = 0; x1 = 40; z1 = 20; }
    this.centro.set(((x0 + x1) / 2) * m, ((z0 + z1) / 2) * m);
    const c = this.rendSup.domElement;
    const aspecto = (c.clientWidth || 1) / (c.clientHeight || 1);
    this.mitadAlto = Math.max(60, Math.max(((z1 - z0) / 2) * m, (((x1 - x0) / 2) * m) / aspecto) * 1.2);
    this.actualizarCamSup();

    const ext = Math.max((x1 - x0) * m, (z1 - z0) * m, 80);
    this.orbita.target.set(this.centro.x, 0, this.centro.y);
    this.cam3d.position.set(this.centro.x + ext * 0.35, ext * 0.55, this.centro.y + ext * 0.8);
    this.orbita.update();
  }

  private construirGrilla(m: number): void {
    this.metrosGrilla = m;
    const pts: number[] = [];
    const [xa, xb] = CELDAS_X;
    const [za, zb] = CELDAS_Z;
    for (let x = xa; x <= xb; x++) pts.push(x * m, 0.1, za * m, x * m, 0.1, zb * m);
    for (let z = za; z <= zb; z++) pts.push(xa * m, 0.1, z * m, xb * m, 0.1, z * m);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grilla = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22 }));
    grilla.layers.set(CAPA_OVERLAY);
    grilla.name = 'grilla';
    const vieja = this.overlay.getObjectByName('grilla');
    if (vieja) this.overlay.remove(vieja);
    this.overlay.add(grilla);
  }

  private crearContorno(celda: [number, number], huella: [number, number], rot: number, m: number, color: string): THREE.LineLoop {
    const esquinas = rectanguloHuella(celda, huella, rot).map(([x, z]) => new THREE.Vector3(x * m, 0.2, z * m));
    const l = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(esquinas),
      new THREE.LineBasicMaterial({ color, depthTest: false }),
    );
    l.renderOrder = 10;
    l.layers.set(CAPA_OVERLAY);
    this.overlay.add(l);
    return l;
  }

  private quitarContorno(l: THREE.LineLoop | null): void {
    if (!l) return;
    this.overlay.remove(l);
    l.geometry.dispose();
    (l.material as THREE.Material).dispose();
  }

  private quitarFantasma(): void {
    this.quitarContorno(this.lineaFantasma);
    this.lineaFantasma = null;
  }

  private mostrarFantasma(tipo: TipoModulo, celda: [number, number], rot: number, params: Record<string, number> | undefined): void {
    this.quitarFantasma();
    if (!this.estado) return;
    const m = this.estado.escena.metrosPorCelda;
    this.lineaFantasma = this.crearContorno(celda, catalogo[tipo].huella(params, m), rot, m, '#6fe39a');
  }

  // ---------- entrada (vista superior) ----------

  private rayoDe(ev: { clientX: number; clientY: number }): void {
    const r = this.rendSup.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.rayo.setFromCamera(ndc, this.camSup);
  }

  private puntoMundo(ev: { clientX: number; clientY: number }): THREE.Vector3 | null {
    this.rayoDe(ev);
    return this.rayo.ray.intersectPlane(this.plano, new THREE.Vector3());
  }

  private celdaDe(ev: { clientX: number; clientY: number }): [number, number] | null {
    const p = this.puntoMundo(ev);
    if (!p || !this.estado) return null;
    return mundoACelda([p.x, 0, p.z], this.estado.escena.metrosPorCelda);
  }

  private moduloBajo(ev: { clientX: number; clientY: number }): string | null {
    this.rayoDe(ev);
    for (const g of this.rayo.intersectObjects(this.viva.raiz.children, true)) {
      const id = moduloDe(g.object);
      if (id) return id;
    }
    return null;
  }

  /** Clic (sin arrastrar) en un módulo de la vista 3D: lo suma o lo quita de los resaltados del paso actual. */
  private conectarClic3d(c: HTMLCanvasElement): void {
    let abajo: { x: number; y: number } | null = null;
    c.addEventListener('pointerdown', (ev) => { abajo = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : null; });
    c.addEventListener('pointerup', (ev) => {
      const a = abajo;
      abajo = null;
      if (!a || ev.button !== 0 || Math.hypot(ev.clientX - a.x, ev.clientY - a.y) > UMBRAL_ARRASTRE_PX) return;
      const r = c.getBoundingClientRect();
      const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      this.rayo.setFromCamera(ndc, this.cam3d);
      for (const g of this.rayo.intersectObjects(this.viva.raiz.children, true)) {
        const id = moduloDe(g.object);
        if (id) { this.pasos.alternarModulo(id); return; }
      }
    });
  }

  private conectarEntrada(c: HTMLCanvasElement): void {
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (ev) => {
      if (!this.estado) return;
      c.setPointerCapture(ev.pointerId);
      if (ev.button === 1 || ev.button === 2) {
        this.gesto = { tipo: 'pan', x: ev.clientX, y: ev.clientY };
        return;
      }
      if (ev.button !== 0) return;
      const celda = this.celdaDe(ev);
      if (this.herramienta) {
        if (!celda) return;
        const op = opColocar(this.herramienta, celda, this.estado.escena);
        this.mandar(op);
        if (op.op === 'agregar') this.seleccionPendiente = op.modulo.id;
        this.elegirHerramienta(null);
        return;
      }
      const id = this.moduloBajo(ev);
      if (id && celda) {
        this.seleccion = id;
        this.refrescarSeleccion();
        const mod = this.moduloSeleccionado();
        if (mod) {
          this.gesto = { tipo: 'mover', id, celdaMod: [mod.celda[0], mod.celda[1]], celdaPtr0: celda, x0: ev.clientX, y0: ev.clientY, movido: false };
        }
      } else {
        this.seleccion = null;
        this.refrescarSeleccion();
        this.gesto = { tipo: 'pan', x: ev.clientX, y: ev.clientY };
      }
    });

    c.addEventListener('pointermove', (ev) => {
      const g = this.gesto;
      if (g?.tipo === 'pan') {
        const mPorPx = (this.mitadAlto * 2) / (c.clientHeight || 1);
        this.centro.x -= (ev.clientX - g.x) * mPorPx;
        this.centro.y -= (ev.clientY - g.y) * mPorPx;
        g.x = ev.clientX;
        g.y = ev.clientY;
        this.actualizarCamSup();
        return;
      }
      const celda = this.celdaDe(ev);
      if (!celda) return;
      if (g?.tipo === 'mover') {
        if (!g.movido && Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < UMBRAL_ARRASTRE_PX) return;
        g.movido = true;
        const mod = this.moduloSeleccionado();
        if (mod) this.mostrarFantasma(mod.tipo, celdaArrastrada(g.celdaMod, g.celdaPtr0, celda), mod.giro ?? mod.rot, mod.params);
      } else if (this.herramienta) {
        this.mostrarFantasma(this.herramienta, celda, 0, paramsPorDefecto(this.herramienta));
      }
    });

    c.addEventListener('pointerup', (ev) => {
      const g = this.gesto;
      this.gesto = null;
      if (g?.tipo !== 'mover') return;
      if (!g.movido && Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < UMBRAL_ARRASTRE_PX) return;
      this.quitarFantasma();
      const celda = this.celdaDe(ev);
      if (!celda) return;
      const destino = celdaArrastrada(g.celdaMod, g.celdaPtr0, celda);
      if (destino[0] !== g.celdaMod[0] || destino[1] !== g.celdaMod[1]) this.mandar({ op: 'mover', id: g.id, celda: destino });
    });
    c.addEventListener('pointercancel', () => { this.gesto = null; this.quitarFantasma(); });
    c.addEventListener('pointerleave', () => { if (!this.gesto) this.quitarFantasma(); });

    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const antes = this.puntoMundo(ev);
      this.mitadAlto = Math.min(600, Math.max(20, this.mitadAlto * (ev.deltaY > 0 ? 1.15 : 1 / 1.15)));
      this.actualizarCamSup();
      const despues = this.puntoMundo(ev);
      if (antes && despues) {
        this.centro.x += antes.x - despues.x;
        this.centro.y += antes.z - despues.z;
        this.actualizarCamSup();
      }
    }, { passive: false });
  }

  private alTecla(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target as HTMLElement | null;
    if (esTeclaEnCampo(t?.tagName, (t as HTMLInputElement | null)?.type)) return;
    if (ev.key === 'Escape') {
      this.elegirHerramienta(null);
      this.seleccion = null;
      this.refrescarSeleccion();
      return;
    }
    const op = teclaAOp(ev.key, this.seleccion);
    if (!op) return;
    ev.preventDefault();
    this.mandar(op);
  }
}

export function iniciarEditor(): void {
  const params = new URLSearchParams(location.search);
  const app = document.getElementById('app');
  if (!app) return;
  const sala = params.get('sala') ?? '';
  instalarRegistroErrores('editor', sala);
  const pin = params.get('pin') ?? '';
  if (!sala || !pin) {
    app.textContent = 'Falta el código de sala o el PIN en la dirección (editor.html?sala=XXXX&pin=YYYY).';
    return;
  }
  try {
    (window as unknown as { __editor: Editor }).__editor = new Editor(app, sala, pin);
  } catch (e) {
    console.error('No arrancó el editor', e);
    app.textContent = 'No pudimos iniciar el editor. Probá recargar la página.';
  }
}

iniciarEditor();
