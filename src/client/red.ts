import type { Comando } from '../shared/sala';
import type { MsgCliente, MsgServidor } from '../shared/protocolo';
import type { EstadoSala, Rol } from '../shared/tipos';
import { Reloj } from './reloj';

/** Errores del servidor tras los cuales no tiene sentido reconectar. */
const ERRORES_FATALES = [
  'PIN incorrecto',
  'Demasiados intentos, esperá un minuto',
  'No se pudo abrir la sala',
  'Sala llena',
];

export const ESPERAS_MS = [500, 1000, 2000, 5000];
const MIN_ENTRE_POSES_MS = 50;

export type PoseServidor = MsgServidor & { t: 'pose' };
export type PoseSaliente = Omit<MsgCliente & { t: 'pose' }, 't'>;

export interface SocketLike {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(datos: string): void;
  close(): void;
}

export interface OpcionesRed {
  url?: string;
  crearSocket?: (url: string) => SocketLike;
  ahora?: () => number;
}

const ABIERTO = 1;

export function urlPorDefecto(): string {
  const seguro = location.protocol === 'https:';
  return `${seguro ? 'wss:' : 'ws:'}//${location.host}/ws`;
}

export class ConexionSala {
  readonly reloj: Reloj;
  conectado = false;

  private socket: SocketLike | null = null;
  private intento = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private cerrada = false;
  private fatal = false;
  private ultimaPose = -Infinity;
  private cbEstado: ((e: EstadoSala) => void)[] = [];
  private cbPose: ((p: PoseServidor) => void)[] = [];
  private cbError: ((motivo: string) => void)[] = [];
  private cbConexion: ((conectado: boolean) => void)[] = [];
  private url: string;
  private crearSocket: (url: string) => SocketLike;
  private ahora: () => number;

  constructor(
    private sala: string,
    private rol: Rol,
    private pin?: string,
    opciones: OpcionesRed = {},
  ) {
    this.url = opciones.url ?? urlPorDefecto();
    this.crearSocket = opciones.crearSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike);
    this.ahora = opciones.ahora ?? (() => Date.now());
    this.reloj = new Reloj((tc) => this.mandar({ t: 'ping', tc }), this.ahora);
    this.abrir();
  }

  alEstado(fn: (e: EstadoSala) => void): void { this.cbEstado.push(fn); }
  alPose(fn: (p: PoseServidor) => void): void { this.cbPose.push(fn); }
  alError(fn: (motivo: string) => void): void { this.cbError.push(fn); }
  alCambioConexion(fn: (conectado: boolean) => void): void { this.cbConexion.push(fn); }

  enviar(c: Comando): void {
    this.mandar({ t: 'comando', c });
  }

  /** Máximo 20 por segundo; las que sobran se descartan. */
  enviarPose(p: PoseSaliente): void {
    const t = this.ahora();
    if (t - this.ultimaPose < MIN_ENTRE_POSES_MS) return;
    this.ultimaPose = t;
    this.mandar({ t: 'pose', ...p });
  }

  cerrar(): void {
    this.cerrada = true;
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.reloj.detener();
    this.socket?.close();
  }

  private mandar(m: MsgCliente): void {
    if (this.socket && this.socket.readyState === ABIERTO) this.socket.send(JSON.stringify(m));
  }

  private abrir(): void {
    if (this.cerrada) return;
    const s = this.crearSocket(this.url);
    this.socket = s;
    s.onopen = () => {
      this.intento = 0;
      this.mandar({
        t: 'unirse', sala: this.sala, rol: this.rol,
        ...(this.pin !== undefined ? { pin: this.pin } : {}),
      });
      this.cambiarConexion(true);
      this.reloj.iniciar();
    };
    s.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let m: MsgServidor;
      try { m = JSON.parse(ev.data) as MsgServidor; } catch { return; }
      this.recibir(m);
    };
    s.onclose = () => {
      if (this.socket !== s) return;
      this.reloj.detener();
      this.cambiarConexion(false);
      if (this.cerrada || this.fatal) return;
      const espera = ESPERAS_MS[Math.min(this.intento, ESPERAS_MS.length - 1)];
      this.intento++;
      this.temporizador = setTimeout(() => this.abrir(), espera);
    };
    s.onerror = () => { /* el cierre se encarga de reconectar */ };
  }

  private recibir(m: MsgServidor): void {
    switch (m.t) {
      case 'estado': this.cbEstado.forEach((f) => f(m.e)); break;
      case 'pose': this.cbPose.forEach((f) => f(m)); break;
      case 'pong': this.reloj.recibirPong(m.tc, m.ts); break;
      case 'error':
        if (ERRORES_FATALES.includes(m.motivo)) this.fatal = true;
        this.cbError.forEach((f) => f(m.motivo));
        break;
    }
  }

  private cambiarConexion(c: boolean): void {
    if (this.conectado === c) return;
    this.conectado = c;
    this.cbConexion.forEach((f) => f(c));
  }
}
