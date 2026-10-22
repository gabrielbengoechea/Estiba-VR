import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RawData, WebSocket } from 'ws';
import { leerMsgCliente, type MsgServidor } from '../src/shared/protocolo';
import { aplicarComando, estadoInicial } from '../src/shared/sala';
import type { Clase, Escena, EstadoSala, Rol } from '../src/shared/tipos';

export interface OpcionesSalas {
  pin: string;
  dirDatos: string;
  contenidoPorDefecto: () => { escena: Escena; clase: Clase };
}

export const MAX_CONEXIONES_POR_SALA = 40;
const CODIGO_SALA = /^\d{4}$/;
const ABIERTO = 1; // WebSocket.OPEN

interface Sala {
  codigo: string;
  estado: EstadoSala;
  conexiones: Map<WebSocket, Rol>;
}

function enviar(ws: WebSocket, texto: string): void {
  if (ws.readyState === ABIERTO) ws.send(texto);
}

function rechazar(ws: WebSocket, motivo: string): void {
  const m: MsgServidor = { t: 'error', motivo };
  enviar(ws, JSON.stringify(m));
  ws.close();
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

function contenidoValido(x: unknown): x is { escena: Escena; clase: Clase } {
  if (!esObjeto(x) || !esObjeto(x.escena) || !esObjeto(x.clase)) return false;
  return Array.isArray(x.escena.modulos) && esObjeto(x.escena.vistas) && Array.isArray(x.clase.pasos);
}

export class Salas {
  private readonly salas = new Map<string, Sala>();

  constructor(private readonly opts: OpcionesSalas) {}

  /** Atiende una conexión nueva: el primer mensaje válido debe ser `unirse`. */
  conectar(ws: WebSocket): void {
    let sala: Sala | null = null;
    let rol: Rol = 'alumno';

    ws.on('error', () => { /* el cierre se encarga de limpiar */ });
    ws.on('close', () => { sala?.conexiones.delete(ws); });
    ws.on('message', (data: RawData, esBinario: boolean) => {
      try {
        const msg = esBinario ? null : leerMsgCliente(data.toString());
        if (!sala) {
          if (!msg || msg.t !== 'unirse') { rechazar(ws, 'Primero hay que unirse a una sala'); return; }
          sala = this.unirse(ws, msg.sala, msg.rol, msg.pin);
          rol = msg.rol;
          return;
        }
        if (!msg) return; // basura: se ignora sin cortar la conexión
        this.atender(sala, ws, rol, msg);
      } catch (err) {
        console.error('Error atendiendo un mensaje:', err);
      }
    });
  }

  private unirse(ws: WebSocket, codigo: string, rol: Rol, pin: string | undefined): Sala | null {
    if (!CODIGO_SALA.test(codigo)) { rechazar(ws, 'El código de sala debe tener 4 dígitos'); return null; }
    if ((rol === 'docente' || rol === 'editor') && pin !== this.opts.pin) {
      rechazar(ws, 'PIN incorrecto');
      return null;
    }
    const sala = this.obtener(codigo);
    if (sala.conexiones.size >= MAX_CONEXIONES_POR_SALA) { rechazar(ws, 'Sala llena'); return null; }
    sala.conexiones.set(ws, rol);
    enviar(ws, this.msgEstado(sala));
    return sala;
  }

  private atender(sala: Sala, ws: WebSocket, rol: Rol, msg: NonNullable<ReturnType<typeof leerMsgCliente>>): void {
    const puedeMandar = rol === 'docente' || rol === 'editor';
    switch (msg.t) {
      case 'ping': {
        const pong: MsgServidor = { t: 'pong', tc: msg.tc, ts: Date.now() };
        enviar(ws, JSON.stringify(pong));
        return;
      }
      case 'comando': {
        if (!puedeMandar) return;
        const antes = sala.estado;
        const despues = aplicarComando(antes, msg.c, Date.now());
        if (despues === antes || despues.version === antes.version) return;
        sala.estado = despues;
        if (despues.escena !== antes.escena || despues.clase !== antes.clase) this.guardar(sala);
        this.difundir(sala, this.msgEstado(sala));
        return;
      }
      case 'pose': {
        if (!puedeMandar) return;
        const texto = JSON.stringify({ t: 'pose', cabeza: msg.cabeza, rayo: msg.rayo } satisfies MsgServidor);
        this.difundir(sala, texto, ws);
        return;
      }
      default: return; // `unirse` repetido: se ignora
    }
  }

  private msgEstado(sala: Sala): string {
    const m: MsgServidor = { t: 'estado', e: sala.estado, ts: Date.now() };
    return JSON.stringify(m);
  }

  private difundir(sala: Sala, texto: string, salvo?: WebSocket): void {
    for (const ws of sala.conexiones.keys()) if (ws !== salvo) enviar(ws, texto);
  }

  private obtener(codigo: string): Sala {
    let sala = this.salas.get(codigo);
    if (!sala) {
      sala = { codigo, estado: this.crearEstado(codigo), conexiones: new Map() };
      this.salas.set(codigo, sala);
    }
    return sala;
  }

  private crearEstado(codigo: string): EstadoSala {
    const { escena, clase } = this.cargar(codigo) ?? this.opts.contenidoPorDefecto();
    const estado = estadoInicial(escena, clase);
    // estadoInicial deja inicio = 0; sin esto, quien entra tarde calcularía el tiempo desde 1970.
    return estado.animacion ? { ...estado, animacion: { ...estado.animacion, inicio: Date.now() } } : estado;
  }

  private archivo(codigo: string): string {
    return join(this.opts.dirDatos, `${codigo}.json`);
  }

  private cargar(codigo: string): { escena: Escena; clase: Clase } | null {
    try {
      const x: unknown = JSON.parse(readFileSync(this.archivo(codigo), 'utf8'));
      return contenidoValido(x) ? { escena: x.escena, clase: x.clase } : null;
    } catch {
      return null; // no existe o está dañado: se usa el contenido por defecto
    }
  }

  private guardar(sala: Sala): void {
    try {
      mkdirSync(this.opts.dirDatos, { recursive: true });
      const destino = this.archivo(sala.codigo);
      const temporal = `${destino}.tmp`;
      writeFileSync(temporal, JSON.stringify({ escena: sala.estado.escena, clase: sala.estado.clase }));
      renameSync(temporal, destino);
    } catch (err) {
      console.error(`No se pudo guardar la sala ${sala.codigo}:`, err);
    }
  }
}
