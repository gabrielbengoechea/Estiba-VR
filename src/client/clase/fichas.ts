// Fichas 3D estilo «JigSpace»: un panel de texto junto al módulo resaltado, siempre mirando a quien lo ve,
// y la vista explotada de la grúa STS cuando la ficha lo pide.
import * as THREE from 'three';
import { Text } from 'troika-three-text';
import type { EstadoSala, Ficha, Vec3 } from '../../shared/tipos';
import type { EscenaViva } from '../escena/construirEscena';
import fuenteNormal from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url';
import fuenteSemi from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url';
import { DISTANCIA_REF, escalaAparente, VistaExplotada } from './explotada';

export const MAX_DATOS = 3;
export type ModoPanel = 'visor' | 'escritorio';
/** Medidas del panel (m) a `DISTANCIA_REF` (25 m) de quien lo mira, antes de multiplicar por la escala del modo. */
interface Medidas { ancho: number; margen: number; titulo: number; texto: number; nota: number }
export const MEDIDAS: Record<ModoPanel, Medidas> = {
  escritorio: { ancho: 12, margen: 0.7, titulo: 0.9, texto: 0.45, nota: 0.36 },
  visor: { ancho: 4.9, margen: 0.25, titulo: 0.45, texto: 0.45, nota: 0.3 },
};
const INTERLINEA = 0.3;
/** Mitad del campo visual (grados) que se considera útil en un ojo del visor; el panel tiene que caber dentro. */
const CAMPO_MEDIO = 38;
/** Si el módulo está a más de estos grados de donde mira la cámara, el panel no se ajusta al campo visual. */
const LIMITE_AJUSTE = 60;
/**
 * Escala del visor: un ojo de celular mide 390 px de alto para 80° de campo, así que 40 px = 8,2° = 3,6 m a 25 m.
 * Los datos miden 0,45 m de base, por lo que ESCALA_VISOR ≈ 8,2 (la tangente no es lineal) deja cada línea de datos en 40 px
 * (el título, igual de grande, también en 40 px; la nota «Datos de ejemplo», secundaria, en 27 px).
 */
export const PX_OJO_ALTO = 390;
export const CAMPO_VERTICAL_GRADOS = 80;
export const ESCALA_VISOR = 8.2;
export const ESCALA_ESCRITORIO = 1;
/** Ancho (m) del panel en el visor: fijo, no depende de la distancia. */
export const TAMANO_VISOR_M = 6;
/** Separación (m) entre la caja de la pieza y el panel anclado. */
const SEPARACION_ANCLA = 2;
/** Diámetro (m) del ícono «i» y altura (m) a la que flota sobre la caja de la pieza. */
const DIAMETRO_ICONO = 1.5;
const ALTURA_ICONO = 2;

/**
 * Punto fijo del panel en el visor: al costado de la caja de la pieza del lado del observador, a 1/3 de su altura
 * y `SEPARACION_ANCLA` m afuera de la caja. Se calcula una sola vez al abrir la ficha.
 */
export function posicionAnclada(caja: { min: Vec3; max: Vec3 }, ojo: Vec3): Vec3 {
  const cx = (caja.min[0] + caja.max[0]) / 2, cz = (caja.min[2] + caja.max[2]) / 2;
  const hx = (caja.max[0] - caja.min[0]) / 2, hz = (caja.max[2] - caja.min[2]) / 2;
  let dx = ojo[0] - cx, dz = ojo[2] - cz;
  const n = Math.hypot(dx, dz);
  if (n < 1e-6) { dx = 0; dz = 1; } else { dx /= n; dz /= n; }
  const t = Math.min(Math.abs(dx) > 1e-9 ? hx / Math.abs(dx) : Infinity, Math.abs(dz) > 1e-9 ? hz / Math.abs(dz) : Infinity);
  const d = t + SEPARACION_ANCLA;
  return [cx + dx * d, caja.min[1] + (caja.max[1] - caja.min[1]) / 3, cz + dz * d];
}

/** Altura aparente en px de algo de `metros` a 25 m, en un ojo de `PX_OJO_ALTO` px y `CAMPO_VERTICAL_GRADOS`. */
export function pxAparentes(metros: number, escala: number): number {
  const grados = (Math.atan((metros * escala) / DISTANCIA_REF) * 180) / Math.PI;
  return (grados / CAMPO_VERTICAL_GRADOS) * PX_OJO_ALTO;
}

export interface LineaPanel { tipo: 'titulo' | 'texto' | 'dato' | 'nota'; texto: string }

/** Qué líneas muestra el panel: en el visor no va el párrafo `texto` (no entra a 40 px); en escritorio sí. */
export function contenidoPanel(f: Ficha, modo: ModoPanel): LineaPanel[] {
  const l: LineaPanel[] = [{ tipo: 'titulo', texto: f.titulo }];
  if (modo === 'escritorio') l.push({ tipo: 'texto', texto: f.texto });
  for (const d of f.datos.slice(0, MAX_DATOS)) l.push({ tipo: 'dato', texto: `${d.etiqueta}: ${d.valor}` });
  if (f.ejemplo) l.push({ tipo: 'nota', texto: 'Datos de ejemplo' });
  return l;
}

const COLOR_FONDO = 0x0e1216;
const COLOR_TITULO = 0xffd24a;
const COLOR_TEXTO = 0xffffff;
const COLOR_DATO = 0xa8d8ff;

function crearTexto(texto: string, tam: number, color: number, ancho: number, semi = false): Text {
  const t = new Text();
  t.font = semi ? fuenteSemi : fuenteNormal; // fuente propia: troika no baja nada de un CDN
  t.text = texto;
  t.fontSize = tam;
  t.color = color;
  t.maxWidth = ancho;
  t.lineHeight = 1.15;
  t.overflowWrap = 'break-word'; // una palabra larga («portacontenedores») se parte en vez de salirse del panel
  t.anchorX = 'left';
  t.anchorY = 'top';
  t.material.depthTest = false;
  t.renderOrder = 31;
  t.raycast = () => undefined;
  return t;
}

/**
 * Panel de una ficha, centrado en su origen y mirando hacia +Z. Mide `MEDIDAS[modo].ancho` m de ancho a 25 m de distancia;
 * `userData.alto` se completa cuando la tipografía termina de armar el texto (el panel se reacomoda solo).
 */
export function crearPanelFicha(f: Ficha, modo: ModoPanel = 'escritorio'): THREE.Group {
  const grupo = new THREE.Group();
  const m = MEDIDAS[modo];
  const interior = m.ancho - 2 * m.margen;
  const fondo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: COLOR_FONDO, transparent: true, opacity: 0.88, depthTest: false }),
  );
  fondo.renderOrder = 30;
  fondo.raycast = () => undefined;

  const textos = contenidoPanel(f, modo).map((l) => {
    switch (l.tipo) {
      case 'titulo': return crearTexto(l.texto, m.titulo, COLOR_TITULO, interior, true);
      case 'texto': return crearTexto(l.texto, m.texto, COLOR_TEXTO, interior);
      case 'dato': return crearTexto(l.texto, m.texto, COLOR_DATO, interior);
      default: return crearTexto(l.texto, m.nota, 0xc9ced3, interior);
    }
  });
  grupo.add(fondo, ...textos);
  grupo.userData.ancho = m.ancho;
  grupo.userData.alto = 0;

  const alto = (t: Text): number => {
    const b = t.textRenderInfo?.blockBounds;
    return b ? b[3] - b[1] : 0;
  };
  const acomodar = () => {
    let h = m.margen;
    const ys: number[] = [];
    for (const t of textos) {
      ys.push(h);
      h += alto(t) + INTERLINEA;
    }
    h += m.margen - INTERLINEA;
    grupo.userData.alto = h;
    fondo.scale.set(m.ancho, h, 1);
    fondo.position.set(0, 0, -0.01);
    textos.forEach((t, i) => t.position.set(-m.ancho / 2 + m.margen, h / 2 - ys[i], 0));
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

/** Esfera con una «i»; flota sobre la pieza resaltada mientras hay ficha abierta. No se puede apuntar (no roba la mirada). */
export function crearIconoInfo(): THREE.Group {
  const g = new THREE.Group();
  const r = DIAMETRO_ICONO / 2;
  const esfera = new THREE.Mesh(
    new THREE.SphereGeometry(r, 24, 16),
    new THREE.MeshBasicMaterial({ color: COLOR_FONDO }),
  );
  const letra = new Text();
  letra.font = fuenteSemi;
  letra.text = 'i';
  letra.fontSize = DIAMETRO_ICONO * 0.8;
  letra.color = COLOR_TITULO;
  letra.anchorX = 'center';
  letra.anchorY = 'middle';
  letra.position.set(0, 0, r + 0.02);
  letra.sync();
  for (const x of [g, esfera, letra]) x.raycast = () => undefined;
  g.add(esfera, letra);
  g.userData.dispose = () => { esfera.geometry.dispose(); (esfera.material as THREE.Material).dispose(); letra.dispose(); };
  return g;
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
 * Panel de la ficha abierta junto al módulo resaltado. En el visor queda anclado en el mundo (tamaño fijo, sin trasladarse,
 * girando solo sobre el eje vertical); en escritorio sigue a la cámara con tamaño aparente constante. También anima la vista explotada. Se engancha al Reproductor con `alCambiarFicha` y `alCuadro`.
 */
export class GestorFichas {
  /** Multiplicador del tamaño aparente del panel; público para probar legibilidad desde la consola. */
  escala: number;
  private ficha: Ficha | null = null;
  private panel: THREE.Group | null = null;
  private token = 0;
  private anclado = false;
  private icono: THREE.Group | null = null;
  private readonly explotada: VistaExplotada;
  private readonly caja = new THREE.Box3();
  private readonly centro = new THREE.Vector3();
  private readonly tam = new THREE.Vector3();
  private readonly derecha = new THREE.Vector3();
  private readonly adelante = new THREE.Vector3();

  constructor(
    private escena: THREE.Scene, private viva: EscenaViva, private camara: THREE.Camera,
    private modo: ModoPanel = 'escritorio', escala = modo === 'visor' ? ESCALA_VISOR : ESCALA_ESCRITORIO,
  ) {
    this.escala = escala;
    this.explotada = new VistaExplotada(escena, escala);
  }

  /** La grúa STS resaltada está (o va) en vista explotada: sus piezas las mueve `VistaExplotada`. */
  get explotando(): boolean {
    return this.explotada.activa;
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
      this.panel = crearPanelFicha(f, this.modo);
      this.panel.visible = false; // hasta el primer cuadro con posición
      this.escena.add(this.panel);
      if (this.modo === 'visor') {
        this.icono = crearIconoInfo();
        this.icono.visible = false;
        this.escena.add(this.icono);
      }
    });
  }

  private cerrarPanel(): void {
    if (this.panel) liberarPanelFicha(this.panel);
    this.panel = null;
    this.anclado = false;
    if (this.icono) liberarPanelFicha(this.icono);
    this.icono = null;
  }

  cuadro(dt: number, e: EstadoSala | null): void {
    const modulo = e?.resaltado ? e.escena.modulos.find((m) => m.id === e.resaltado) : undefined;
    const obj = modulo ? this.viva.objeto(modulo.id) : undefined;
    const pedida = this.ficha?.explotada === 'grua-sts' && modulo?.tipo === 'grua-sts';
    this.explotada.actualizar(modulo?.tipo === 'grua-sts' ? obj : undefined, !!pedida && !!this.panel, dt, this.camara);
    if (this.panel) {
      // En la maqueta AR (raíz escalada) el panel del docente taparía la vista: ahí no se muestra.
      if (this.viva.raiz.scale.x !== 1) this.panel.visible = false;
      else if (this.modo === 'visor') this.colocarAnclado(obj);
      else this.colocar(obj);
    }
  }

  /**
   * Visor: el panel se ancla una sola vez (primer cuadro con alto y pieza) y de ahí no se traslada; solo gira sobre el eje
   * vertical para mirar al alumno. Tamaño fijo en metros.
   */
  private colocarAnclado(obj: THREE.Object3D | undefined): void {
    const panel = this.panel!;
    if (!this.anclado) {
      if ((panel.userData.alto as number) <= 0) { panel.visible = false; return; }
      this.caja.makeEmpty();
      if (obj) { obj.updateWorldMatrix(true, true); this.caja.setFromObject(obj); }
      this.camara.updateMatrixWorld();
      this.adelante.setFromMatrixPosition(this.camara.matrixWorld);
      if (this.caja.isEmpty()) {
        // Sin pieza (resaltado vacío): a 10 m al frente, a la altura de los ojos.
        this.camara.getWorldDirection(this.derecha).setY(0).normalize();
        panel.position.copy(this.adelante).addScaledVector(this.derecha, 10);
      } else {
        const [x, y, z] = posicionAnclada(
          { min: this.caja.min.toArray() as Vec3, max: this.caja.max.toArray() as Vec3 },
          this.adelante.toArray() as Vec3,
        );
        panel.position.set(x, y, z);
        if (this.icono) {
          this.icono.position.set((this.caja.min.x + this.caja.max.x) / 2, this.caja.max.y + ALTURA_ICONO + DIAMETRO_ICONO / 2, (this.caja.min.z + this.caja.max.z) / 2);
        }
      }
      panel.scale.setScalar(TAMANO_VISOR_M / MEDIDAS.visor.ancho);
      this.anclado = true;
    }
    this.camara.updateMatrixWorld();
    this.adelante.setFromMatrixPosition(this.camara.matrixWorld);
    const giro = Math.atan2(this.adelante.x - panel.position.x, this.adelante.z - panel.position.z);
    panel.rotation.set(0, giro, 0);
    panel.visible = true;
    if (this.icono) {
      this.icono.rotation.set(0, Math.atan2(this.adelante.x - this.icono.position.x, this.adelante.z - this.icono.position.z), 0);
      this.icono.visible = !this.caja.isEmpty();
    }
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
      // Junto al módulo, pero sin salirse del campo visual: el panel tiene un ancho angular fijo (ancho / 25 m × escala).
      const mitadPanel = (Math.atan((0.5 * MEDIDAS[this.modo].ancho * this.escala) / DISTANCIA_REF) * 180) / Math.PI;
      const maxAngulo = Math.max(4, CAMPO_MEDIO - mitadPanel);
      const lado = Math.min(
        mitadModulo + 0.5 * MEDIDAS[this.modo].ancho * escala + MEDIDAS[this.modo].margen * escala,
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
    const mitadAncho = Math.atan((0.5 * MEDIDAS[this.modo].ancho * this.escala) / DISTANCIA_REF) / rad;
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
