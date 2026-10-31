// Práctica de estiba en la exploración libre: un patio chico con celdas de 40' pintadas, dos camiones con la cama vacía
// y diez contenedores del kit. Se toman con el agarre del control (o arrastrando con el mouse) y se sueltan sobre una
// celda, otro contenedor o la cama de un camión. La zona magnética está en los esquineros: si el contenedor encastra,
// aparece la silueta verde con los cuatro twistlocks donde va a trabar; si no, la silueta roja y el motivo.
//
// No hay física: el lugar de cada contenedor lo decide `Apilado` (src/shared/apilado.ts) y su pose sale siempre de la
// celda y de los niveles de abajo. Por eso una pila alta no tiembla y lo que va en un camión queda fijo a su cama.
import * as THREE from 'three';
import {
  Apilado, MEDIDAS, esquineros, type Candidato, type Celda, type Contenedor, type Instantanea, type Lugar, type Mitad, type Pose,
  type TipoContenedor,
} from '../../shared/apilado';
import { armarLods, cajasColision, cargarPaquete, clonar, contenedorSuelto, nodo } from '../escena/kit';

/** Esquina del patio de práctica en terminal-a.json: entre el bloque A, la STS 3 y la puerta. */
export const ORIGEN_PRACTICA = new THREE.Vector3(246, 0, -52);
const PASO_BAHIA = 13.4;
const PASO_FILA = 2.8;
const NIVELES = 5;
const FILAS = ['A', 'B', 'C'];
/** Altura a la que flota el contenedor en la mano sobre su destino. */
const FLOTE = 0.6;

export interface Aviso { texto: string; ok: boolean }

interface Llevando {
  cont: Contenedor;
  desde: Lugar;
  obj: THREE.Object3D;
  giro: number;
  candidato: Candidato | null;
}

interface Animacion { obj: THREE.Object3D; hasta: Pose; fin?: () => void }

const _v = new THREE.Vector3();
const _plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _rc = new THREE.Raycaster();

function texturaPatio(celdas: Celda[], x0: number, z0: number, ancho: number, fondo: number): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const ppm = 24;
  const c = document.createElement('canvas');
  c.width = Math.round(ancho * ppm);
  c.height = Math.round(fondo * ppm);
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#3f454c';
  g.fillRect(0, 0, c.width, c.height);
  // grano del asfalto
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  const px = (x: number) => (x - x0) * ppm;
  const pz = (z: number) => (z - z0) * ppm;
  for (const k of celdas) {
    const camion = k.niveles === 1;
    if (camion) continue;
    const l = MEDIDAS['40'].largo + 0.4;
    const w = MEDIDAS['40'].ancho + 0.2;
    g.save();
    g.translate(px(k.x), pz(k.z));
    g.rotate(-k.giro);
    g.strokeStyle = '#f2f2ee';
    g.lineWidth = 0.12 * ppm;
    g.strokeRect((-l / 2) * ppm, (-w / 2) * ppm, l * ppm, w * ppm);
    g.setLineDash([0.4 * ppm, 0.3 * ppm]);
    g.lineWidth = 0.06 * ppm;
    g.beginPath();
    g.moveTo(0, (-w / 2) * ppm);
    g.lineTo(0, (w / 2) * ppm);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#f2c94c';
    g.font = `700 ${Math.round(1.2 * ppm)}px "IBM Plex Sans", Arial, sans-serif`;
    g.textBaseline = 'middle';
    g.fillText(k.etiqueta ?? k.id, (-l / 2 - 1.8) * ppm, 0);
    g.restore();
  }
  // carril de camiones: franja amarilla
  g.fillStyle = '#e2b21a';
  g.fillRect(px(x0 + 1), pz(-61.6), (ancho - 2) * ppm, 0.2 * ppm);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function cartel(lineas: string[]): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'cartel-practica';
  const poste = new THREE.MeshStandardMaterial({ color: '#59606a', roughness: 0.6, metalness: 0.4 });
  for (const x of [-2.1, 2.1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), poste);
    p.position.set(x, 1.6, 0);
    g.add(p);
  }
  let mapa: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const k = c.getContext('2d');
    if (k) {
      k.fillStyle = '#0b1624';
      k.fillRect(0, 0, 1024, 512);
      k.fillStyle = '#ffb547';
      k.fillRect(0, 0, 1024, 18);
      k.fillStyle = '#f2f6fa';
      k.font = '700 64px "IBM Plex Sans", Arial, sans-serif';
      k.fillText('Práctica de estiba', 48, 110);
      k.font = '400 36px "IBM Plex Sans", Arial, sans-serif';
      lineas.forEach((l, i) => k.fillText(l, 48, 190 + i * 56));
      mapa = new THREE.CanvasTexture(c);
      mapa.colorSpace = THREE.SRGBColorSpace;
    }
  }
  const tablero = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshStandardMaterial({ map: mapa, color: mapa ? '#ffffff' : '#0b1624', roughness: 0.7 }));
  tablero.position.set(0, 2.3, 0.09);
  const dorso = new THREE.Mesh(new THREE.BoxGeometry(4.7, 2.4, 0.1), poste);
  dorso.position.set(0, 2.3, 0);
  g.add(dorso, tablero);
  return g;
}

/** Contenedores iniciales: [celda, mitad, tipo, librea]. */
const INICIAL: [string, Mitad, TipoContenedor, number][] = [
  ['A1', 'C', '40', 0], ['A1', 'C', '40HC', 2], ['A1', 'C', '40', 5],
  ['A2', 'A', '20', 1], ['A2', 'B', '20', 3], ['A2', 'C', '40', 6],
  ['B1', 'A', '20', 4], ['B1', 'A', '20', 7],
  ['B2', 'C', '40HC', 1],
  ['C2', 'C', '40', 3],
  ['CAM2', 'A', '20', 2],
];

export class PatioPractica {
  readonly raiz = new THREE.Group();
  /** Cajas de colisión de los contenedores apoyados (para la caminata). */
  readonly colisiones = new THREE.Group();
  readonly apilado = new Apilado();
  /** Se llama cuando cambia lo que se puede chocar (rehacer el BVH dinámico). */
  alCambiar: () => void = () => undefined;
  avisar: (a: Aviso) => void = () => undefined;

  private contenedores = new THREE.Group();
  private objetos = new Map<string, THREE.Object3D>();
  private kitCont: THREE.Object3D | null = null;
  private llevando: Llevando | null = null;
  private animaciones: Animacion[] = [];
  private fantasma: THREE.Mesh;
  private bordes: THREE.LineSegments;
  private twistlocks: THREE.InstancedMesh;
  private matOk = new THREE.MeshBasicMaterial({ color: '#36d27a', transparent: true, opacity: 0.22, depthWrite: false });
  private matMal = new THREE.MeshBasicMaterial({ color: '#ff5a4f', transparent: true, opacity: 0.22, depthWrite: false });
  private inicial: Instantanea | null = null;
  private camiones: { id: string; obj: THREE.Object3D }[] = [];
  private ultimoPunto = new THREE.Vector3();

  constructor() {
    this.raiz.name = 'patio-practica';
    this.raiz.userData.sinColision = true; // el BVH fijo no lo incluye: va en el dinámico (colisiones)
    this.colisiones.name = 'colisiones-practica';
    this.contenedores.name = 'contenedores-practica';
    this.fantasma = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.matOk);
    this.fantasma.visible = false;
    this.fantasma.raycast = () => undefined;
    this.fantasma.renderOrder = 5;
    this.bordes = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#ffffff' }));
    this.bordes.raycast = () => undefined;
    this.fantasma.add(this.bordes);
    this.twistlocks = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.34, 10), new THREE.MeshBasicMaterial({ color: '#36d27a', depthTest: false }), 4);
    this.twistlocks.renderOrder = 6;
    this.twistlocks.visible = false;
    this.twistlocks.raycast = () => undefined;
    this.raiz.add(this.contenedores, this.fantasma, this.twistlocks);
  }

  get enMano(): string | null {
    return this.llevando?.cont.id ?? null;
  }

  /** Arma el patio con los modelos del kit. */
  async cargar(): Promise<this> {
    const [ind, cont] = await Promise.all([cargarPaquete('industrial'), cargarPaquete('contenedores')]);
    this.kitCont = cont;
    const O = ORIGEN_PRACTICA;
    const celdas: Celda[] = [];
    FILAS.forEach((f, i) => {
      for (let b = 0; b < 2; b++) {
        celdas.push({ id: `${f}${b + 1}`, etiqueta: `${f}${b + 1}`, x: O.x + b * PASO_BAHIA, y: 0, z: O.z - i * PASO_FILA, giro: 0, niveles: NIVELES });
      }
    });
    // Camiones: tractor + semirremolque esqueleto. La celda es el montaje de 40' de la cama; los 20' usan los suyos.
    const colores = ['Blanco', 'Rojo'];
    for (let k = 0; k < 2; k++) {
      const id = `CAM${k + 1}`;
      const camion = this.camion(ind, colores[k]);
      camion.position.set(O.x + 11.5, 0, O.z - 12 - k * 5);
      this.raiz.add(camion);
      camion.updateMatrixWorld(true);
      const m40 = nodo(camion, 'Mount_40')!.getWorldPosition(new THREE.Vector3());
      const mA = nodo(camion, 'Mount_20A')!.getWorldPosition(new THREE.Vector3());
      const mB = nodo(camion, 'Mount_20B')!.getWorldPosition(new THREE.Vector3());
      celdas.push({ id, etiqueta: `Camión ${k + 1}`, x: m40.x, y: m40.y, z: m40.z, giro: 0, niveles: 1, mitades: { A: mA.x - m40.x, B: mB.x - m40.x } });
      this.camiones.push({ id, obj: camion });
    }
    for (const c of celdas) this.apilado.agregarCelda(c);

    // Piso pintado y cartel
    const x0 = O.x - 11;
    const ancho = 36;
    const fondo = 28;
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(ancho, fondo),
      new THREE.MeshStandardMaterial({ map: texturaPatio(celdas, x0, O.z + 3 - fondo, ancho, fondo), color: '#ffffff', roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(x0 + ancho / 2, 0.005, O.z + 3 - fondo / 2);
    piso.receiveShadow = true;
    piso.name = 'piso-practica';
    const cart = cartel([
      'Apuntá a un contenedor y mantené el agarre',
      '(grip) para tomarlo; con A lo girás 90°.',
      'Soltalo sobre una celda, otro contenedor o',
      'la cama de un camión: encastra en los esquineros.',
    ]);
    cart.position.set(O.x - 9, 0, O.z + 2.5);
    cart.rotation.y = Math.PI - 0.35; // mira hacia el lugar de llegada (al sur del patio)
    this.raiz.add(piso, cart);

    // Contenedores iniciales
    let n = 0;
    for (const [celda, mitad, tipo, librea] of INICIAL) {
      const c: Contenedor = { id: `P${String(++n).padStart(2, '0')}`, tipo, librea };
      const v = this.apilado.colocar(c, celda, mitad, n % 3 === 0);
      if (!v.ok) throw new Error(`Práctica: ${c.id} en ${celda}: ${v.motivo}`);
      this.objetoDe(c);
    }
    this.inicial = this.apilado.instantanea();
    this.ubicarTodos();
    return this;
  }

  private camion(ind: THREE.Object3D, color: string): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'camion-practica';
    const tractor = clonar(ind, 'Truck_Tractor');
    tractor.traverse((o) => { if (/^Truck_Tractor_(Blanco|Rojo|Azul)_LOD/.test(o.name) && !o.name.includes(color)) o.visible = false; });
    for (const o of [...tractor.children]) if (!o.visible) tractor.remove(o);
    const trailer = clonar(ind, 'Trailer_Skeletal40');
    const hitch = nodo(tractor, 'Hitch')!.position;
    trailer.position.set(hitch.x, 0, 0);
    armarLods(tractor, [0, 90]);
    armarLods(trailer, [0, 90]);
    g.add(tractor, trailer);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true; });
    // colisión aproximada del camión para la caminata
    const caja = cajasColision([
      { centro: new THREE.Vector3(2.1, 1.9, 0), medidas: new THREE.Vector3(7, 3.8, 2.5) },
      { centro: new THREE.Vector3(hitch.x - 5.4, 0.7, 0), medidas: new THREE.Vector3(12.4, 1.4, 2.5) },
    ]);
    g.add(caja);
    g.userData.colisionCamion = caja;
    return g;
  }

  private objetoDe(c: Contenedor): THREE.Object3D {
    let o = this.objetos.get(c.id);
    if (!o) {
      o = contenedorSuelto(this.kitCont!, c.tipo, c.librea);
      o.name = `contenedor-${c.id}`;
      o.userData.practicaId = c.id;
      o.traverse((h) => {
        h.userData.sinColision = true;
        if ((h as THREE.Mesh).isMesh) (h as THREE.Mesh).castShadow = (h as THREE.Mesh).receiveShadow = true;
      });
      this.objetos.set(c.id, o);
      this.contenedores.add(o);
    }
    return o;
  }

  private ponerEn(o: THREE.Object3D, p: Pose) {
    o.position.set(p.x, p.y, p.z);
    o.rotation.set(0, p.giro, 0);
  }

  /** Cada contenedor apoyado en su pose exacta y colisiones al día. */
  private ubicarTodos() {
    for (const c of this.apilado.todos) {
      const p = this.apilado.pose(c.id);
      if (p) this.ponerEn(this.objetoDe(c), p);
    }
    this.rehacerColisiones();
  }

  private rehacerColisiones() {
    for (const h of [...this.colisiones.children]) {
      this.colisiones.remove(h);
      (h as THREE.InstancedMesh).dispose?.();
    }
    const cajas = this.apilado.todos.map((c) => {
      const p = this.apilado.pose(c.id)!;
      const m = MEDIDAS[c.tipo];
      return { centro: new THREE.Vector3(p.x, p.y + m.alto / 2, p.z), medidas: new THREE.Vector3(m.largo, m.alto, m.ancho), giro: p.giro };
    });
    if (cajas.length) this.colisiones.add(cajasColision(cajas));
    for (const k of this.camiones) {
      const cl = (k.obj.userData.colisionCamion as THREE.Object3D).clone();
      cl.position.copy(k.obj.position);
      cl.quaternion.copy(k.obj.quaternion);
      this.colisiones.add(cl);
    }
    this.colisiones.updateMatrixWorld(true);
    this.alCambiar();
  }

  /** Contenedor apuntado por el rayo (o null). */
  apuntado(rayo: THREE.Ray, lejos = 60): string | null {
    this.raiz.updateMatrixWorld();
    _rc.ray.copy(rayo);
    _rc.far = lejos;
    const objs = [...this.objetos.entries()].filter(([id]) => id !== this.enMano).map(([, o]) => o);
    const hit = _rc.intersectObjects(objs, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.practicaId === undefined) o = o.parent;
    return (o?.userData.practicaId as string) ?? null;
  }

  /** Toma un contenedor (si no tiene nada encima). */
  tomar(id: string, giroMano = 0): boolean {
    if (this.llevando) return false;
    const r = this.apilado.levantar(id);
    if (!r.ok) {
      this.avisar({ texto: r.motivo, ok: false });
      return false;
    }
    const obj = this.objetos.get(id)!;
    this.animaciones = this.animaciones.filter((a) => a.obj !== obj);
    this.llevando = { cont: r.contenedor, desde: r.desde, obj, giro: obj.rotation.y - giroMano, candidato: null };
    this.ultimoPunto.copy(obj.position);
    this.rehacerColisiones();
    return true;
  }

  /** Gira 90° el contenedor que se lleva. */
  girar() {
    if (this.llevando) this.llevando.giro += Math.PI / 2;
  }

  /**
   * Mueve lo que se lleva hacia donde apunta el rayo: el punto es el primer contenedor tocado o el piso.
   * `giroMano` es el giro del control o de la cámara (el contenedor conserva su desvío respecto de él).
   */
  mover(rayo: THREE.Ray, giroMano: number) {
    const ll = this.llevando;
    if (!ll) return;
    this.raiz.updateMatrixWorld();
    _rc.ray.copy(rayo);
    _rc.far = 80;
    const objs = [...this.objetos.entries()].filter(([id]) => id !== ll.cont.id).map(([, o]) => o);
    const hit = _rc.intersectObjects([...objs, ...this.camiones.map((k) => k.obj)], true)[0];
    if (hit) {
      this.ultimoPunto.copy(hit.point);
      // En un costado, el punto se corre hacia adentro de la pila: apuntar a la pared elige esa pila, no la de al lado.
      const n = hit.face?.normal;
      if (n) {
        _v.copy(n).transformDirection(hit.object.matrixWorld);
        if (Math.abs(_v.y) < 0.5) this.ultimoPunto.addScaledVector(_v.setY(0).normalize(), -MEDIDAS['40'].ancho / 2);
      }
    }
    else if (rayo.intersectPlane(_plano, _v) && _v.distanceTo(rayo.origin) < 80) this.ultimoPunto.copy(_v);
    const giro = giroMano + ll.giro;
    ll.candidato = this.apilado.buscar(ll.cont.tipo, this.ultimoPunto.x, this.ultimoPunto.z, giro);
    this.mostrarFantasma(ll.cont.tipo, ll.candidato, giro);
  }

  private mostrarFantasma(tipo: TipoContenedor, k: Candidato | null, giro: number) {
    const ll = this.llevando!;
    const m = MEDIDAS[tipo];
    // Imán: si encastra, flota justo sobre su lugar y ya alineado; si no, sigue al puntero.
    const destino: Pose = k?.ok
      ? { ...k.pose, y: k.pose.y + FLOTE }
      : { x: this.ultimoPunto.x, y: Math.max(this.ultimoPunto.y, 0) + 1.2, z: this.ultimoPunto.z, giro };
    this.animaciones = this.animaciones.filter((a) => a.obj !== ll.obj);
    this.animaciones.push({ obj: ll.obj, hasta: destino });
    this.fantasma.visible = !!k;
    this.twistlocks.visible = !!k?.ok;
    if (!k) return;
    this.fantasma.material = k.ok ? this.matOk : this.matMal;
    this.fantasma.scale.set(m.largo, m.alto, m.ancho);
    this.fantasma.position.set(k.pose.x, k.pose.y + m.alto / 2, k.pose.z);
    this.fantasma.rotation.set(0, k.pose.giro, 0);
    if (k.ok) {
      const o = new THREE.Object3D();
      esquineros(tipo, k.pose, 'abajo').forEach(([x, y, z], i) => {
        o.position.set(x, y + 0.12, z);
        o.updateMatrix();
        this.twistlocks.setMatrixAt(i, o.matrix);
      });
      this.twistlocks.instanceMatrix.needsUpdate = true;
    }
  }

  /** Suelta lo que se lleva: encastra en el candidato válido o vuelve a su lugar. */
  soltar(): Aviso | null {
    const ll = this.llevando;
    if (!ll) return null;
    this.llevando = null;
    this.fantasma.visible = false;
    this.twistlocks.visible = false;
    const k = ll.candidato;
    let aviso: Aviso;
    if (k?.ok) {
      const v = this.apilado.colocar(ll.cont, k.celda, k.mitad, k.invertido);
      aviso = v.ok ? { texto: this.descripcion(ll.cont, k), ok: true } : { texto: v.motivo, ok: false };
      if (!v.ok) this.apilado.colocar(ll.cont, ll.desde.celda, ll.desde.mitad, ll.desde.invertido);
    } else {
      this.apilado.colocar(ll.cont, ll.desde.celda, ll.desde.mitad, ll.desde.invertido);
      aviso = { texto: k?.motivo ? `${k.motivo}. Volvió a su lugar.` : 'Fuera de las celdas: volvió a su lugar.', ok: false };
    }
    const destino = this.apilado.pose(ll.cont.id)!;
    this.animaciones = this.animaciones.filter((a) => a.obj !== ll.obj);
    this.animaciones.push({ obj: ll.obj, hasta: destino, fin: () => this.ponerEn(ll.obj, destino) });
    this.rehacerColisiones();
    this.avisar(aviso);
    return aviso;
  }

  private descripcion(c: Contenedor, k: Candidato): string {
    const celda = this.apilado.celdas.get(k.celda)!;
    const donde = celda.niveles === 1 ? `en la cama del ${celda.etiqueta?.toLowerCase()}` : `en ${celda.etiqueta}, nivel ${k.nivel + 1}`;
    const mitad = k.mitad === 'C' ? '' : ` (mitad ${k.mitad})`;
    return `Trabado: ${c.tipo === '40HC' ? "40' HC" : `${c.tipo}'`} ${donde}${mitad}`;
  }

  /** Vuelve todo a como estaba al cargar. */
  reiniciar() {
    if (this.llevando) this.soltar();
    if (!this.inicial) return;
    this.apilado.restaurar(this.inicial);
    this.animaciones = [];
    this.ubicarTodos();
  }

  /** Interpolación suave hacia los destinos; termina exacta en la pose de `Apilado`. */
  actualizar(dt: number) {
    if (!this.animaciones.length) return;
    const k = 1 - Math.exp(-dt * 14);
    this.animaciones = this.animaciones.filter((a) => {
      const o = a.obj;
      o.position.x += (a.hasta.x - o.position.x) * k;
      o.position.y += (a.hasta.y - o.position.y) * k;
      o.position.z += (a.hasta.z - o.position.z) * k;
      const dg = Math.atan2(Math.sin(a.hasta.giro - o.rotation.y), Math.cos(a.hasta.giro - o.rotation.y));
      o.rotation.y += dg * k;
      const cerca = Math.abs(a.hasta.x - o.position.x) + Math.abs(a.hasta.y - o.position.y) + Math.abs(a.hasta.z - o.position.z) < 0.004 && Math.abs(dg) < 0.002;
      if (cerca && a.fin) {
        a.fin();
        return false;
      }
      return true;
    });
  }

  /** Para las pruebas y el modo depuración. */
  estado() {
    return {
      enMano: this.enMano,
      candidato: this.llevando?.candidato ?? null,
      pilas: [...this.apilado.celdas.keys()].map((c) => ({ celda: c, ids: this.apilado.pila(c).map((p) => p.id) })),
      poses: Object.fromEntries(this.apilado.todos.map((c) => [c.id, this.apilado.pose(c.id)])),
    };
  }
}
