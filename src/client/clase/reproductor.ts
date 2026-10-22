// Reproduce en cliente lo que manda la sala: fundidos entre vistas, módulo resaltado, «Miren acá», recentrado y etiquetas.
// Modo `alumno`: mueve la cámara (con fundido a negro de 0,3 s) y dibuja la capa de ayudas por ojo.
// Modo `escritorio` (proyector y docente): solo resaltado, aro y ficha; sin fundidos ni movimientos de cámara.
import * as THREE from 'three';
import type { EstadoSala, Vec3 } from '../../shared/tipos';
import { PALETA } from '../../shared/colores';
import { catalogo } from '../escena/catalogo';
import { moduloDe } from '../escena/ambiente';
import type { EscenaViva } from '../escena/construirEscena';
import { guinadaHacia } from '../vistas/controlesDocente';
import type { OrientacionAlumno } from '../vistas/orientacion';
import { actualizarPermanencia, anguloFlecha, dentroDelCono, type Permanencia } from './mirada';
import { DURACION_FUNDIDO, pasoFundido } from './transiciones';

export interface OpcionesReproductor {
  escena: THREE.Scene;
  viva: EscenaViva;
  camara: THREE.PerspectiveCamera;
  /** Solo en el alumno: contenedor donde van el fundido y las ayudas, y el giroscopio. */
  alumno?: { app: HTMLElement; orientacion: OrientacionAlumno };
  /** Gancho para el panel 3D de fichas (Task 12): se llama cuando cambia `fichaAbierta`. */
  alCambiarFicha?: (id: string | null) => void;
}

const AMARILLO = new THREE.Color(PALETA.amarillo);
/** El rayo de la retícula se lanza 10 veces por segundo, no en cada cuadro. */
const INTERVALO_MIRADA_S = 0.1;

const ESTILO_TEXTO =
  'position:fixed;pointer-events:none;font:700 40px/1.1 system-ui,sans-serif;color:#fff;' +
  'text-shadow:0 0 4px #000,0 0 4px #000;transform:translate(-50%,-50%);text-align:center;z-index:8;';

export class Reproductor {
  private estado: EstadoSala | null = null;
  private seqVisto: number | null = null;
  private recentrarVisto: number | null = null;
  private fichaVista: string | null | undefined;
  private t = 0;

  // Fundido
  private fundidoT = Infinity;
  private opacidadVelo = 0;
  private pendiente: { pos: Vec3; mira: Vec3 } | null = null;
  private velo: HTMLElement | null = null;
  private base = new THREE.Quaternion();
  private sensor = new THREE.Quaternion();

  // Resaltado: caja y contorno propios (no se tocan los materiales compartidos de las piezas)
  private cajaFondo: THREE.Mesh;
  private cajaBorde: THREE.LineSegments;
  private caja = new THREE.Box3();
  private tamano = new THREE.Vector3();
  private centro = new THREE.Vector3();

  // «Miren acá»
  private aro: THREE.Mesh;
  private flechas: HTMLElement[] = [];

  // Mirada
  private rayo = new THREE.Raycaster();
  private permanencia: Permanencia = { objetivo: null, tiempo: 0 };
  private objetivoMirado: string | null = null;
  private acumMirada = 0;
  private etiquetas: HTMLElement[] = [];

  constructor(private o: OpcionesReproductor) {
    this.cajaFondo = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: AMARILLO, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.cajaBorde = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: AMARILLO, transparent: true, depthTest: false }),
    );
    for (const x of [this.cajaFondo, this.cajaBorde]) {
      x.visible = false;
      x.renderOrder = 10;
      x.raycast = () => undefined;
      o.escena.add(x);
    }
    this.aro = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 48),
      new THREE.MeshBasicMaterial({ color: AMARILLO, transparent: true, side: THREE.DoubleSide, depthTest: false }),
    );
    this.aro.renderOrder = 11;
    this.aro.visible = false;
    this.aro.raycast = () => undefined;
    o.escena.add(this.aro);

    if (o.alumno) this.armarCapas(o.alumno.app);
  }

  private armarCapas(app: HTMLElement): void {
    this.velo = document.createElement('div');
    this.velo.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:9';
    app.append(this.velo);
    for (const izq of [25, 75]) {
      const flecha = document.createElement('div');
      flecha.textContent = '▲';
      flecha.style.cssText = ESTILO_TEXTO + 'display:none;font-size:56px;color:#E2A300';
      flecha.dataset.izq = String(izq);
      app.append(flecha);
      this.flechas.push(flecha);

      const et = document.createElement('div');
      et.style.cssText = ESTILO_TEXTO + `left:${izq}%;top:64%;width:44%;display:none`;
      app.append(et);
      this.etiquetas.push(et);
    }
  }

  aplicar(e: EstadoSala): void {
    this.estado = e;

    if (this.o.alumno) {
      if (this.seqVisto === null) {
        this.seqVisto = e.ubicacion.seq;
        this.mover(e.ubicacion.pos, e.ubicacion.mira); // al entrar no hay fundido: se aparece en el lugar
      } else if (e.ubicacion.seq !== this.seqVisto) {
        this.seqVisto = e.ubicacion.seq;
        this.pendiente = { pos: e.ubicacion.pos, mira: e.ubicacion.mira };
        if (this.fundidoT >= DURACION_FUNDIDO / 2) this.fundidoT = 0; // si ya pasó el negro, empieza otro fundido
      }
      if (this.recentrarVisto !== null && e.recentrar > this.recentrarVisto) this.o.alumno.orientacion.recentrar();
      this.recentrarVisto = e.recentrar;
    }

    if (this.fichaVista === undefined ? e.fichaAbierta !== null : e.fichaAbierta !== this.fichaVista) {
      this.o.alCambiarFicha?.(e.fichaAbierta);
    }
    this.fichaVista = e.fichaAbierta;
  }

  /** Solo se llama en el negro: la posición cambia y la guiñada inicial mira hacia la vista; el giroscopio sigue mandando. */
  private mover(pos: Vec3, mira: Vec3): void {
    this.o.camara.position.set(...pos);
    this.base.setFromAxisAngle(new THREE.Vector3(0, 1, 0), guinadaHacia(pos, mira));
    this.componerCamara();
  }

  private componerCamara(): void {
    const al = this.o.alumno;
    if (!al) return;
    const [x, y, z, w] = al.orientacion.quat();
    this.sensor.set(x, y, z, w);
    this.o.camara.quaternion.copy(this.base).multiply(this.sensor);
  }

  cuadro(dt: number): void {
    this.t += dt;
    const e = this.estado;

    if (this.o.alumno) {
      const paso = pasoFundido(this.fundidoT, dt);
      this.fundidoT = paso.t;
      this.opacidadVelo = paso.opacidad;
      if (paso.moverAhora && this.pendiente) {
        this.mover(this.pendiente.pos, this.pendiente.mira); // este cuadro se dibuja en negro total
        this.pendiente = null;
      }
      if (this.velo) this.velo.style.opacity = String(this.opacidadVelo);
      this.componerCamara();
    }

    this.actualizarResaltado(e);
    this.actualizarAro(e);
    if (this.o.alumno) this.actualizarMirada(e, dt);
  }

  private actualizarResaltado(e: EstadoSala | null): void {
    const obj = e?.resaltado ? this.o.viva.objeto(e.resaltado) : undefined;
    this.caja.makeEmpty();
    if (obj) {
      obj.updateWorldMatrix(true, true);
      this.caja.setFromObject(obj);
    }
    const visible = !this.caja.isEmpty();
    this.cajaFondo.visible = this.cajaBorde.visible = visible;
    if (!visible) return;
    this.caja.getSize(this.tamano).addScalar(0.4);
    this.caja.getCenter(this.centro);
    for (const x of [this.cajaFondo, this.cajaBorde]) {
      x.position.copy(this.centro);
      x.scale.copy(this.tamano);
    }
    const pulso = 0.5 + 0.5 * Math.sin(this.t * 4);
    (this.cajaFondo.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.14 * pulso;
    (this.cajaBorde.material as THREE.LineBasicMaterial).opacity = 0.65 + 0.35 * pulso;
  }

  private actualizarAro(e: EstadoSala | null): void {
    const p = e?.mirenAca;
    if (!p) {
      this.aro.visible = false;
      for (const f of this.flechas) f.style.display = 'none';
      return;
    }
    const cam = this.o.camara;
    const punto = new THREE.Vector3(...p);
    // El aro está parado sobre el punto y mira siempre hacia quien lo ve (visible incluso a la altura de los ojos);
    // crece con la distancia para que se vea desde cualquier vista.
    const base = Math.max(2.5, cam.position.distanceTo(punto) / 12);
    const escala = base * (1 + 0.2 * (0.5 + 0.5 * Math.sin(this.t * 6)));
    this.aro.position.set(p[0], p[1] + base, p[2]);
    this.aro.rotation.y = Math.atan2(cam.position.x - p[0], cam.position.z - p[2]);
    this.aro.scale.setScalar(escala);
    (this.aro.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.4 * (0.5 + 0.5 * Math.cos(this.t * 6));
    this.aro.visible = true;

    if (!this.o.alumno) return;
    cam.updateMatrixWorld();
    const hacia = punto.clone().sub(cam.position);
    const frente = cam.getWorldDirection(new THREE.Vector3());
    const afuera = !dentroDelCono(frente.toArray() as Vec3, hacia.toArray() as Vec3);
    const local = punto.applyMatrix4(new THREE.Matrix4().copy(cam.matrixWorld).invert());
    const grados = anguloFlecha(local.toArray() as Vec3);
    const rad = (grados * Math.PI) / 180;
    for (const f of this.flechas) {
      f.style.display = afuera ? 'block' : 'none';
      if (!afuera) continue;
      f.style.left = `${Number(f.dataset.izq) + Math.sin(rad) * 18}%`;
      f.style.top = `${50 - Math.cos(rad) * 36}%`;
      f.style.transform = `translate(-50%,-50%) rotate(${grados}deg)`;
    }
  }

  private actualizarMirada(e: EstadoSala | null, dt: number): void {
    this.acumMirada += dt;
    if (this.acumMirada >= INTERVALO_MIRADA_S) {
      this.acumMirada = 0;
      const cam = this.o.camara;
      cam.updateMatrixWorld();
      this.rayo.set(cam.position, cam.getWorldDirection(new THREE.Vector3()));
      const golpe = this.rayo.intersectObjects(this.o.viva.raiz.children, true)[0];
      this.objetivoMirado = golpe ? moduloDe(golpe.object) : null;
    }
    const r = actualizarPermanencia(this.permanencia, this.objetivoMirado, dt);
    this.permanencia = { objetivo: r.objetivo, tiempo: r.tiempo };
    const mod = r.mostrar && e ? e.escena.modulos.find((m) => m.id === r.mostrar) : undefined;
    const texto = mod ? mod.nombre ?? catalogo[mod.tipo].nombre : '';
    for (const et of this.etiquetas) {
      et.style.display = texto ? 'block' : 'none';
      if (et.textContent !== texto) et.textContent = texto;
    }
  }
}
