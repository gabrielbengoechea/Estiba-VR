// Vista de escritorio. `proyector`: la cámara sigue la pose que manda el docente (suavizada) y muestra el QR de la sala.
// `docente`: cámara libre con OrbitControls y atajos de teclado/mouse que mandan comandos a la sala.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import QRCode from 'qrcode';
import type { Participante } from '../../shared/protocolo';
import type { EstadoSala, Vec3 } from '../../shared/tipos';
import { ConexionSala } from '../red';
import { CERCA, LEJOS, configurarRenderer, crearAmbiente, habilitarSombras, moduloDe } from '../escena/ambiente';
import { EscenaViva } from '../escena/construirEscena';
import { Animador } from '../clase/animaciones';
import { GestorFichas } from '../clase/fichas';
import { Reproductor } from '../clase/reproductor';
import { iniciarXR } from './xr';
import { baseDeAula, comandoTraer, esLinkLocal, filaParticipante, resumenSala, factorSuavizado, idFichaAlternada, mirenAcaTrasClic, teclaAComando, urlAlumno } from './controlesDocente';

export type ModoEscritorio = 'proyector' | 'docente';

const DURACION_VUELO_S = 1.0;
const VELOCIDAD_PROYECTOR = 7;
/** Si el docente no manda pose en este tiempo, el proyector va a la ubicación del paso. */
const SIN_POSE_MS = 2500;
const UMBRAL_CLIC_PX = 5;

interface Vuelo { t0: number; pos0: THREE.Vector3; mira0: THREE.Vector3; pos1: THREE.Vector3; mira1: THREE.Vector3 }

const suave = (x: number) => x * x * (3 - 2 * x);

function crearPanel(css: string): HTMLDivElement {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;pointer-events:none;font:600 20px/1.3 system-ui,sans-serif;color:#fff;${css}`;
  return d;
}

export class VistaEscritorio {
  readonly renderer: THREE.WebGLRenderer;
  readonly escena = new THREE.Scene();
  readonly camara = new THREE.PerspectiveCamera(55, 1, CERCA, LEJOS);
  readonly viva = new EscenaViva();
  readonly conexion: ConexionSala;
  /** Resaltado, aro y fichas; sin fundidos ni movimientos de cámara. */
  readonly reproductor: Reproductor;
  private readonly fichas: GestorFichas;
  private readonly animador: Animador;

  private controles: OrbitControls | null = null;
  private estado: EstadoSala | null = null;
  private escenaJson = '';
  private seqVisto = -1;
  private vuelo: Vuelo | null = null;
  private objetivoPos = new THREE.Vector3();
  private objetivoQuat = new THREE.Quaternion();
  private ultimaPoseMs = -Infinity;
  private teclaM = false;
  private participantes: Participante[] = [];
  private verLista = false;
  private cuadroXR: (() => void) | null = null;
  private reloj = new THREE.Clock();
  private rayo = new THREE.Raycaster();
  private hud = crearPanel('left:16px;top:12px;max-width:60%;text-shadow:0 0 4px #000,0 0 4px #000');
  private estadoConexion = crearPanel('left:16px;bottom:12px;text-shadow:0 0 4px #000,0 0 4px #000;font-size:16px');

  constructor(private app: HTMLElement, private modo: ModoEscritorio, sala: string, pin?: string) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: modo === 'docente' }); // alpha: el passthrough de la maqueta AR lo necesita
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    configurarRenderer(this.renderer);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

    crearAmbiente(this.escena);
    this.escena.add(this.viva.raiz);
    this.fichas = new GestorFichas(this.escena, this.viva, this.camara);
    this.animador = new Animador(this.escena, this.viva, () => this.conexion.reloj.ahoraServidor(), () => this.fichas.explotando);
    this.reproductor = new Reproductor({
      escena: this.escena, viva: this.viva, camara: this.camara,
      alCambiarFicha: (id) => this.fichas.abrir(id),
      alCuadro: (dt, e) => { this.fichas.cuadro(dt, e); this.animador.cuadro(dt, e); },
    });
    this.camara.position.set(210, 95, 175);
    this.camara.lookAt(210, 5, -45);
    this.objetivoPos.copy(this.camara.position);
    this.objetivoQuat.copy(this.camara.quaternion);

    app.textContent = '';
    app.style.display = 'block';
    app.append(this.renderer.domElement, this.hud, this.estadoConexion);
    this.ajustarTamano();
    addEventListener('resize', () => this.ajustarTamano());

    this.conexion = new ConexionSala(sala, modo, pin);
    this.conexion.alEstado((e) => this.recibirEstado(e));
    this.conexion.alParticipantes((l) => { this.participantes = l; this.actualizarHud(); });
    this.conexion.alCambioConexion((c) => this.mostrarConexion(c ? '' : 'Sin conexión con la sala. Reintentando…'));
    this.conexion.alError((motivo) => this.mostrarConexion(motivo));
    this.mostrarConexion('Conectando con la sala…');

    if (modo === 'proyector') {
      this.conexion.alPose((p) => {
        this.ultimaPoseMs = performance.now();
        this.objetivoPos.set(...p.cabeza.pos);
        this.objetivoQuat.set(...p.cabeza.quat);
        this.reproductor.recibirPose(p);
      });
      this.armarQr(sala);
    } else {
      this.controles = new OrbitControls(this.camara, this.renderer.domElement);
      this.controles.enableDamping = true;
      this.controles.target.set(210, 5, -45);
      this.controles.update();
      this.armarDocente();
      // Solo el docente puede entrar en VR (Quest); en laptop el botón no aparece.
      this.cuadroXR = iniciarXR(this.renderer, this.escena, this.conexion, this.viva, this.camara, () => this.estado);
    }

    this.renderer.setAnimationLoop(() => this.cuadro());
  }

  private ajustarTamano(): void {
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  private mostrarConexion(texto: string): void {
    this.estadoConexion.textContent = texto;
  }

  private recibirEstado(e: EstadoSala): void {
    this.estado = e;
    this.reproductor.aplicar(e);
    const json = JSON.stringify(e.escena);
    if (json !== this.escenaJson) {
      this.escenaJson = json;
      this.viva.aplicar(e.escena)
        .then(() => habilitarSombras(this.viva.raiz))
        .catch((err) => console.error('No se pudo aplicar la escena', err));
    }
    const primera = this.seqVisto < 0;
    if (e.ubicacion.seq !== this.seqVisto) {
      this.seqVisto = e.ubicacion.seq;
      // Sala recién abierta: se arranca viendo la terminal completa en lugar del primer paso.
      const general = e.escena.vistas.general;
      if (primera && e.ubicacion.seq === 0 && general) this.irA(general.pos, general.mira, true);
      else this.irA(e.ubicacion.pos, e.ubicacion.mira, primera);
    }
    this.actualizarHud();
  }

  /** El docente vuela a la ubicación (suave); el proyector solo lo hace si no recibe pose del docente. */
  private irA(pos: Vec3, mira: Vec3, inmediato: boolean): void {
    const p = new THREE.Vector3(...pos);
    const m = new THREE.Vector3(...mira);
    if (this.modo === 'docente' && this.controles) {
      if (inmediato) {
        this.camara.position.copy(p);
        this.controles.target.copy(m);
        this.controles.update();
        this.vuelo = null;
      } else {
        this.vuelo = {
          t0: performance.now(), pos0: this.camara.position.clone(), mira0: this.controles.target.clone(), pos1: p, mira1: m,
        };
      }
      return;
    }
    if (inmediato || performance.now() - this.ultimaPoseMs > SIN_POSE_MS) {
      const m4 = new THREE.Matrix4().lookAt(p, m, new THREE.Vector3(0, 1, 0));
      this.objetivoPos.copy(p);
      this.objetivoQuat.setFromRotationMatrix(m4);
      if (inmediato) {
        this.camara.position.copy(p);
        this.camara.quaternion.copy(this.objetivoQuat);
      }
    }
  }

  private actualizarHud(): void {
    const e = this.estado;
    if (!e) return;
    const paso = e.clase.pasos[e.paso];
    const nombre = (id: string | null) => (id ? e.escena.modulos.find((m) => m.id === id)?.nombre ?? id : null);
    const titulo = paso ? `Paso ${e.paso + 1} de ${e.clase.pasos.length}: ${paso.titulo}` : e.clase.titulo;
    const lineas = [titulo, resumenSala(this.participantes)];
    if (this.verLista) {
      const ahora = Date.now();
      lineas.push(...(this.participantes.length ? this.participantes.map((p) => filaParticipante(p, ahora)) : ['Nadie conectado']));
    }
    if (this.modo === 'docente') {
      const res = nombre(e.resaltado);
      if (res) lineas.push(`Resaltado: ${res}`);
      lineas.push('P: lista de la sala · ← → cambian de paso · clic resalta · M + clic: «miren acá» (otra vez o Esc: apagar) · T: traer · R: recentrar · Espacio: animación · F: ficha');
    }
    this.hud.replaceChildren(...lineas.map((l, i) => {
      const d = document.createElement('div');
      d.textContent = l;
      if (i === 0) d.style.cssText = `font-size:${this.modo === 'proyector' ? 34 : 24}px`;
      else d.style.cssText = 'font-size:15px;font-weight:500;opacity:.9';
      return d;
    }));
  }

  private armarQr(sala: string): void {
    const caja = crearPanel(
      'right:16px;top:16px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px;' +
      'background:#fff;color:#0e1216;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.35)',
    );
    const publico = new URLSearchParams(location.search).get('publico');
    const img = document.createElement('img');
    img.alt = `Código QR para entrar a la sala ${sala}`;
    img.width = 200;
    img.height = 200;
    const codigo = document.createElement('div');
    codigo.textContent = `Sala ${sala}`;
    codigo.style.cssText = 'font-size:34px;font-weight:800;letter-spacing:.08em';
    const link = document.createElement('div');
    link.style.cssText = 'font-size:11px;font-weight:500;max-width:200px;word-break:break-all;text-align:center';
    const nota = document.createElement('div');
    nota.textContent = 'Este link solo funciona en esta computadora. Abrí el proyector desde el link público o agregá ?publico=…';
    nota.style.cssText = 'font-size:12px;font-weight:600;max-width:200px;text-align:center;color:#b3261e';
    caja.append(img, codigo, link, nota);
    const mostrar = (base: string | null): void => {
      const url = urlAlumno(location.origin, sala, base);
      link.textContent = url;
      nota.style.display = esLinkLocal(url) ? '' : 'none';
      QRCode.toDataURL(url, { margin: 0, width: 200 })
        .then((d) => { img.src = d; })
        .catch((err) => console.error('No se pudo generar el QR', err));
    };
    mostrar(publico);
    // Modo aula (sin internet): abierto en localhost sin ?publico=, usa la IP de la red que informa el servidor.
    if (esLinkLocal(location.origin) && !publico) {
      fetch('/api/red')
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { urls?: unknown } | null) => {
          const urls = Array.isArray(d?.urls) ? d.urls.filter((u): u is string => typeof u === 'string') : [];
          const base = baseDeAula(location.origin, publico, urls);
          if (base) mostrar(base);
        })
        .catch(() => { /* sin servidor de aula: queda el aviso de link local */ });
    }
    this.app.append(caja);
  }

  private armarDocente(): void {
    const canvas = this.renderer.domElement;
    let abajo: { x: number; y: number } | null = null;

    addEventListener('keydown', (ev) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (ev.key === 'm' || ev.key === 'M') { this.teclaM = true; return; }
      if ((ev.key === 'p' || ev.key === 'P') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (!ev.repeat) { this.verLista = !this.verLista; this.actualizarHud(); }
        return;
      }
      if (ev.key === 'f' || ev.key === 'F') {
        // Abre la ficha del paso actual, o la cierra si ya está abierta.
        const e = this.estado;
        const id = e ? idFichaAlternada(e.fichaAbierta, e.clase.pasos[e.paso]?.ficha) : null;
        if (!ev.repeat && e && (id !== null || e.fichaAbierta !== null)) this.conexion.enviar({ t: 'ficha', id });
        return;
      }
      if (ev.key === 't' || ev.key === 'T') {
        if (ev.repeat) return;
        const dir = this.camara.getWorldDirection(new THREE.Vector3());
        const pos = this.camara.position;
        this.conexion.enviar(comandoTraer([pos.x, pos.y, pos.z], [dir.x, dir.y, dir.z]));
        return;
      }
      const e = this.estado;
      const c = teclaAComando(ev.key, e?.clase.pasos[e.paso]?.animacion);
      if (c) {
        ev.preventDefault();
        if (!ev.repeat) this.conexion.enviar(c);
      }
    });
    addEventListener('keyup', (ev) => { if (ev.key === 'm' || ev.key === 'M') this.teclaM = false; });
    addEventListener('blur', () => { this.teclaM = false; });

    canvas.addEventListener('pointerdown', (ev) => { if (ev.button === 0) abajo = { x: ev.clientX, y: ev.clientY }; });
    canvas.addEventListener('pointerup', (ev) => {
      if (ev.button !== 0 || !abajo) return;
      const lejos = Math.hypot(ev.clientX - abajo.x, ev.clientY - abajo.y) > UMBRAL_CLIC_PX;
      abajo = null;
      if (!lejos) this.clic(ev.clientX, ev.clientY);
    });
  }

  private clic(x: number, y: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.rayo.setFromCamera(ndc, this.camara);
    const golpe = this.rayo.intersectObjects(this.escena.children, true)[0];
    if (this.teclaM) {
      const nuevo: Vec3 | null = golpe ? [golpe.point.x, golpe.point.y, golpe.point.z] : null;
      const pos = mirenAcaTrasClic(this.estado?.mirenAca ?? null, nuevo);
      if (pos || this.estado?.mirenAca) this.conexion.enviar({ t: 'mirenAca', pos });
      return;
    }
    // Un clic sobre un módulo lo resalta; sobre el vacío (agua o suelo) quita el resaltado.
    this.conexion.enviar({ t: 'resaltar', id: golpe ? moduloDe(golpe.object) : null });
  }

  private cuadro(): void {
    const dt = this.reloj.getDelta();
    if (this.renderer.xr.isPresenting) {
      this.cuadroXR?.(); // en VR la cámara la mueve el visor: nada de OrbitControls ni pose de escritorio
    } else if (this.modo === 'docente' && this.controles) {
      if (this.vuelo) {
        const v = this.vuelo;
        const k = Math.min(1, (performance.now() - v.t0) / (DURACION_VUELO_S * 1000));
        const s = suave(k);
        this.camara.position.lerpVectors(v.pos0, v.pos1, s);
        this.controles.target.lerpVectors(v.mira0, v.mira1, s);
        if (k >= 1) this.vuelo = null;
      }
      this.controles.update();
      const p = this.camara.position;
      const q = this.camara.quaternion;
      this.conexion.enviarPose({ cabeza: { pos: [p.x, p.y, p.z], quat: [q.x, q.y, q.z, q.w] }, rayo: null });
    } else {
      const f = factorSuavizado(dt, VELOCIDAD_PROYECTOR);
      this.camara.position.lerp(this.objetivoPos, f);
      this.camara.quaternion.slerp(this.objetivoQuat, f);
    }
    this.reproductor.cuadro(dt);
    this.renderer.render(this.escena, this.camara);
  }
}
