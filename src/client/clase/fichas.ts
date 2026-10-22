// Fichas 3D estilo «JigSpace»: un panel de texto junto al módulo resaltado, siempre mirando a quien lo ve,
// y la vista explotada de la grúa STS cuando la ficha lo pide.
import * as THREE from 'three';
import { Text } from 'troika-three-text';
import type { EstadoSala, Ficha } from '../../shared/tipos';
import type { EscenaViva } from '../escena/construirEscena';
import { DISTANCIA_REF, escalaAparente, VistaExplotada } from './explotada';

/** Medidas del panel a `DISTANCIA_REF` (25 m) de quien lo mira, en metros. */
export const ALTO_TITULO = 0.9;
export const ALTO_TEXTO = 0.45;
export const ALTO_NOTA = 0.36;
export const MAX_DATOS = 3;
const ANCHO_PANEL = 12;
const MARGEN = 0.7;
const INTERLINEA = 0.5;
/** Mitad del campo visual (grados) que se considera útil en un ojo del visor; el panel tiene que caber dentro. */
const CAMPO_MEDIO = 38;
/** Si el módulo está a más de estos grados de donde mira la cámara, el panel no se ajusta al campo visual. */
const LIMITE_AJUSTE = 60;
/**
 * Multiplicador del panel (1 = medidas del brief: título 0,9 m, texto 0,45 m a 25 m). Con 1 el texto mide unos 5 px en un
 * ojo de un celular de 390 px de alto (80° de campo): ilegible. En el visor se usa `ESCALA_VISOR`; en escritorio `ESCALA_ESCRITORIO`.
 */
export const ESCALA_VISOR = 2.6;
export const ESCALA_ESCRITORIO = 1;

const COLOR_FONDO = 0x0e1216;
const COLOR_TITULO = 0xffd24a;
const COLOR_TEXTO = 0xffffff;
const COLOR_DATO = 0xa8d8ff;

function crearTexto(texto: string, tam: number, color: number, ancho: number): Text {
  const t = new Text();
  t.text = texto;
  t.fontSize = tam;
  t.color = color;
  t.maxWidth = ancho;
  t.lineHeight = 1.2;
  t.anchorX = 'left';
  t.anchorY = 'top';
  t.material.depthTest = false;
  t.renderOrder = 31;
  t.raycast = () => undefined;
  return t;
}

/**
 * Panel de una ficha, centrado en su origen y mirando hacia +Z. Mide `ANCHO_PANEL` m de ancho a 25 m de distancia;
 * `userData.alto` se completa cuando la tipografía termina de armar el texto (el panel se reacomoda solo).
 */
export function crearPanelFicha(f: Ficha): THREE.Group {
  const grupo = new THREE.Group();
  const interior = ANCHO_PANEL - 2 * MARGEN;
  const fondo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: COLOR_FONDO, transparent: true, opacity: 0.88, depthTest: false }),
  );
  fondo.renderOrder = 30;
  fondo.raycast = () => undefined;

  const titulo = crearTexto(f.titulo, ALTO_TITULO, COLOR_TITULO, interior);
  const cuerpo = crearTexto(f.texto, ALTO_TEXTO, COLOR_TEXTO, interior);
  const datos = f.datos.slice(0, MAX_DATOS).map((d) => crearTexto(`${d.etiqueta}: ${d.valor}`, ALTO_TEXTO, COLOR_DATO, interior));
  const textos = [titulo, cuerpo, ...datos];
  if (f.ejemplo) textos.push(crearTexto('Datos de ejemplo', ALTO_NOTA, 0xc9ced3, interior));
  grupo.add(fondo, ...textos);
  grupo.userData.ancho = ANCHO_PANEL;
  grupo.userData.alto = 0;

  const alto = (t: Text): number => {
    const b = t.textRenderInfo?.blockBounds;
    return b ? b[3] - b[1] : 0;
  };
  const acomodar = () => {
    let h = MARGEN;
    const ys: number[] = [];
    for (const t of textos) {
      ys.push(h);
      h += alto(t) + INTERLINEA;
    }
    h += MARGEN - INTERLINEA;
    grupo.userData.alto = h;
    fondo.scale.set(ANCHO_PANEL, h, 1);
    fondo.position.set(0, 0, -0.01);
    textos.forEach((t, i) => t.position.set(-ANCHO_PANEL / 2 + MARGEN, h / 2 - ys[i], 0));
  };
  let pendientes = textos.length;
  for (const t of textos) t.sync(() => { if (--pendientes === 0) acomodar(); });
  acomodar();

  grupo.userData.dispose = () => {
    fondo.geometry.dispose();
    (fondo.material as THREE.Material).dispose();
    for (const t of textos) t.dispose();
  };
  return grupo;
}

export function liberarPanelFicha(g: THREE.Group): void {
  (g.userData.dispose as (() => void) | undefined)?.();
  g.removeFromParent();
}

const cache = new Map<string, Promise<Ficha | null>>();

/** Lee `/fichas/<id>.json` una sola vez. Un fallo de red o un JSON mal formado da null y no queda cacheado. */
export function cargarFicha(id: string): Promise<Ficha | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/fichas/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Ficha>) : null))
      .then((f) => (f && typeof f.titulo === 'string' && typeof f.texto === 'string' && Array.isArray(f.datos) ? f : null))
      .catch(() => null);
    cache.set(id, p);
    void p.then((f) => { if (!f) cache.delete(id); });
  }
  return p;
}

/**
 * Mantiene el panel de la ficha abierta junto al módulo resaltado (mirando a la cámara, con tamaño aparente constante)
 * y anima la vista explotada. Se engancha al Reproductor con `alCambiarFicha` y `alCuadro`.
 */
export class GestorFichas {
  /** Multiplicador del tamaño aparente del panel; público para probar legibilidad desde la consola. */
  escala: number;
  private ficha: Ficha | null = null;
  private panel: THREE.Group | null = null;
  private token = 0;
  private readonly explotada: VistaExplotada;
  private readonly caja = new THREE.Box3();
  private readonly centro = new THREE.Vector3();
  private readonly tam = new THREE.Vector3();
  private readonly derecha = new THREE.Vector3();
  private readonly adelante = new THREE.Vector3();

  constructor(private escena: THREE.Scene, private viva: EscenaViva, private camara: THREE.Camera, escala = ESCALA_ESCRITORIO) {
    this.escala = escala;
    this.explotada = new VistaExplotada(escena, escala);
  }

  /** Ficha nueva (o null para cerrar). Si llegan dos seguidas, gana la última. */
  abrir(id: string | null): void {
    const mio = ++this.token;
    if (id === null) { this.cerrarPanel(); this.ficha = null; return; }
    void cargarFicha(id).then((f) => {
      if (mio !== this.token) return;
      this.cerrarPanel();
      this.ficha = f;
      if (!f) { console.warn(`No se pudo cargar la ficha ${id}`); return; }
      this.panel = crearPanelFicha(f);
      this.panel.visible = false; // hasta el primer cuadro con posición
      this.escena.add(this.panel);
    });
  }

  private cerrarPanel(): void {
    if (this.panel) liberarPanelFicha(this.panel);
    this.panel = null;
  }

  cuadro(dt: number, e: EstadoSala | null): void {
    const modulo = e?.resaltado ? e.escena.modulos.find((m) => m.id === e.resaltado) : undefined;
    const obj = modulo ? this.viva.objeto(modulo.id) : undefined;
    const pedida = this.ficha?.explotada === 'grua-sts' && modulo?.tipo === 'grua-sts';
    this.explotada.actualizar(modulo?.tipo === 'grua-sts' ? obj : undefined, !!pedida && !!this.panel, dt, this.camara);
    if (this.panel) this.colocar(obj);
  }

  /** Al costado del módulo (según se lo ve), a la altura de los ojos si el módulo es alto; sin módulo, al frente. */
  private colocar(obj: THREE.Object3D | undefined): void {
    const panel = this.panel!;
    const cam = this.camara;
    cam.updateMatrixWorld();
    const alto = panel.userData.alto as number;
    if (alto <= 0) { panel.visible = false; return; }
    this.adelante.setFromMatrixPosition(cam.matrixWorld);
    const ojo = this.adelante.clone();
    let objetivo: THREE.Vector3;
    let escala: number;

    this.caja.makeEmpty();
    if (obj) {
      obj.updateWorldMatrix(true, true);
      this.caja.setFromObject(obj);
    }
    if (this.caja.isEmpty()) {
      cam.getWorldDirection(this.adelante);
      objetivo = ojo.clone().addScaledVector(this.adelante, DISTANCIA_REF);
      escala = this.escala;
    } else {
      this.caja.getCenter(this.centro);
      this.caja.getSize(this.tam);
      const dist = ojo.distanceTo(this.centro);
      escala = escalaAparente(dist) * this.escala;
      // «Derecha» según se ve el módulo desde el ojo (no según hacia dónde mira la cabeza, que se movería con ella).
      this.derecha.set(ojo.z - this.centro.z, 0, this.centro.x - ojo.x);
      if (this.derecha.lengthSq() < 1e-6) this.derecha.set(1, 0, 0);
      this.derecha.normalize();
      const mitadModulo = 0.5 * (Math.abs(this.derecha.x) * this.tam.x + Math.abs(this.derecha.z) * this.tam.z);
      // Junto al módulo, pero sin salirse del campo visual: el panel tiene un ancho angular fijo (ANCHO_PANEL / 25 m × escala).
      const mitadPanel = (Math.atan((0.5 * ANCHO_PANEL * this.escala) / DISTANCIA_REF) * 180) / Math.PI;
      const maxAngulo = Math.max(4, CAMPO_MEDIO - mitadPanel);
      const lado = Math.min(
        mitadModulo + 0.5 * ANCHO_PANEL * escala + MARGEN * escala,
        dist * Math.tan((maxAngulo * Math.PI) / 180),
      );
      objetivo = this.centro.clone().addScaledVector(this.derecha, lado);
      objetivo.y = this.centro.y;
    }
    // Solo se ajusta mientras el módulo está más o menos a la vista; si el alumno mira para otro lado, el panel queda junto al módulo.
    if (!this.caja.isEmpty()) {
      cam.getWorldDirection(this.adelante);
      const haciaModulo = this.centro.clone().sub(ojo).normalize();
      if (this.adelante.dot(haciaModulo) > Math.cos((LIMITE_AJUSTE * Math.PI) / 180)) this.mantenerEnCampo(objetivo, ojo, alto);
    }
    escala = escalaAparente(ojo.distanceTo(objetivo)) * this.escala; // tamaño aparente según donde queda el panel de verdad
    panel.position.copy(objetivo);
    panel.quaternion.copy(cam.quaternion);
    panel.scale.setScalar(escala);
    panel.visible = true;
  }

  /**
   * Si el panel quedaría fuera del campo visual, lo gira alrededor del ojo (misma distancia) hasta que entre entero.
   * Los ángulos se miden en el sistema de la cámara, así que sirve con cualquier orientación (también mirando hacia abajo).
   */
  private mantenerEnCampo(objetivo: THREE.Vector3, ojo: THREE.Vector3, alto: number): void {
    const rad = Math.PI / 180;
    const cam = this.camara;
    const local = objetivo.clone().sub(ojo).applyQuaternion(cam.quaternion.clone().invert());
    const radio = local.length();
    if (radio < 1e-3 || local.z >= 0) return; // pegado al ojo, o detrás de la cámara: no hay a qué ajustar
    const mitadAncho = Math.atan((0.5 * ANCHO_PANEL * this.escala) / DISTANCIA_REF) / rad;
    const mitadAlto = Math.atan((0.5 * alto * this.escala) / DISTANCIA_REF) / rad;
    const maxYaw = Math.max(0, CAMPO_MEDIO - mitadAncho) * rad;
    const maxPitch = Math.max(0, CAMPO_MEDIO - mitadAlto) * rad;
    const yaw = Math.min(maxYaw, Math.max(-maxYaw, Math.atan2(local.x, -local.z)));
    const pitch = Math.min(maxPitch, Math.max(-maxPitch, Math.atan2(local.y, Math.hypot(local.x, local.z))));
    local.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(radio);
    objetivo.copy(local.applyQuaternion(cam.quaternion)).add(ojo);
  }

  dispose(): void {
    this.token++;
    this.cerrarPanel();
    this.explotada.dispose();
  }
}
