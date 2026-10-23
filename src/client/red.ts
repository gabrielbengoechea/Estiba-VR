import type { Comando } from '../shared/sala';
import type { MsgCliente, MsgServidor, Participante } from '../shared/protocolo';
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
/** Si no llegó nada del servidor (ni un pong) en este tiempo, la conexión se da por muerta y se reconecta. */
export const SILENCIO_MAX_MS = 25_000;
const REVISION_SILENCIO_MS = 5_000;

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
  private esFatal = false;
  /** Verdadero tras un error del servidor tras el cual no se reconecta. */
  get fatal(): boolean { return this.esFatal; }
  private ultimaPose = -Infinity;
  private poseDiferida: PoseSaliente | null = null;
  private timerPose: ReturnType<typeof setTimeout> | null = null;
  private vigia: ReturnType<typeof setInterval> | null = null;
  private ultimoMensaje = 0;
  private cbEstado: ((e: EstadoSala) => void)[] = [];
  private cbPose: ((p: PoseServidor) => void)[] = [];
  private cbParticipantes: ((lista: Participante[]) => void)[] = [];
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
  alParticipantes(fn: (lista: Participante[]) => void): void { this.cbParticipantes.push(fn); }
  alError(fn: (motivo: string) => void): void { this.cbError.push(fn); }
  alCambioConexion(fn: (conectado: boolean) => void): void { this.cbConexion.push(fn); }

  enviar(c: Comando): void {
    this.mandar({ t: 'comando', c });
  }

  /** Estado del dispositivo (batería 0–1 o null si no se puede leer). */
  enviarDispositivo(bateria: number | null, cargando: boolean | null): void {
    this.mandar({ t: 'dispositivo', bateria, cargando });
  }

  /** Máximo 20 por segundo; las que sobran se descartan. */
  enviarPose(p: PoseSaliente): void {
    const t = this.ahora();
    const falta = MIN_ENTRE_POSES_MS - (t - this.ultimaPose);
    if (falta <= 0) {
      this.limpiarPose();
      this.ultimaPose = t;
      this.mandar({ t: 'pose', ...p });
      return;
    }
    // Se guarda la última pose descartada y se manda al terminar la ventana.
    this.poseDiferida = p;
    if (this.timerPose === null) {
      this.timerPose = setTimeout(() => {
        this.timerPose = null;
        const d = this.poseDiferida;
        this.poseDiferida = null;
        if (d) this.enviarPose(d);
      }, falta);
    }
  }

  private limpiarPose(): void {
    if (this.timerPose !== null) clearTimeout(this.timerPose);
    this.timerPose = null;
    this.poseDiferida = null;
  }

  private avisar<T>(lista: ((x: T) => void)[], x: T): void {
    for (const f of lista) {
      try { f(x); } catch (err) { console.error('Error en un oyente de ConexionSala', err); }
    }
  }

  cerrar(): void {
    this.cerrada = true;
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.limpiarPose();
    this.detenerVigia();
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
      this.ultimoMensaje = this.ahora();
      this.detenerVigia();
      this.vigia = setInterval(() => {
        if (this.socket !== s || this.ahora() - this.ultimoMensaje <= SILENCIO_MAX_MS) return;
        // Silencio de más de 25 s: la conexión está muerta aunque el navegador no lo sepa. Se cierra a la fuerza
        // (sin esperar el cierre del navegador, que puede tardar minutos) para que actúe la reconexión de siempre.
        s.onclose = null;
        try { s.close(); } catch { /* ya estaba cerrado */ }
        alCerrar();
      }, REVISION_SILENCIO_MS);
      this.mandar({
        t: 'unirse', sala: this.sala, rol: this.rol,
        ...(this.pin !== undefined ? { pin: this.pin } : {}),
      });
      this.reloj.iniciar();
      this.cambiarConexion(true);
    };
    s.onmessage = (ev) => {
      this.ultimoMensaje = this.ahora();
      if (typeof ev.data !== 'string') return;
      let m: MsgServidor;
      try { m = JSON.parse(ev.data) as MsgServidor; } catch { return; }
      this.recibir(m);
    };
    const alCerrar = (): void => {
      if (this.socket !== s) return;
      this.detenerVigia();
      this.reloj.detener();
      this.limpiarPose();
      if (!this.cerrada && !this.esFatal) {
        const espera = ESPERAS_MS[Math.min(this.intento, ESPERAS_MS.length - 1)];
        this.intento++;
        this.temporizador = setTimeout(() => this.abrir(), espera);
      }
      this.cambiarConexion(false);
    };
    s.onclose = alCerrar;
    s.onerror = () => { /* el cierre se encarga de reconectar */ };
  }

  private detenerVigia(): void {
    if (this.vigia !== null) clearInterval(this.vigia);
    this.vigia = null;
  }

  private recibir(m: MsgServidor): void {
    switch (m.t) {
      case 'estado': this.avisar(this.cbEstado, m.e); break;
      case 'pose': this.avisar(this.cbPose, m); break;
      case 'participantes': this.avisar(this.cbParticipantes, m.lista); break;
      case 'pong': this.reloj.recibirPong(m.tc, m.ts); break;
      case 'error':
        if (ERRORES_FATALES.includes(m.motivo)) this.esFatal = true;
        this.avisar(this.cbError, m.motivo);
        break;
    }
  }

  private cambiarConexion(c: boolean): void {
    if (this.conectado === c) return;
    this.conectado = c;
    this.avisar(this.cbConexion, c);
  }
}
