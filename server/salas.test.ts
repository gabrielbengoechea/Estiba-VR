import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import type { MsgServidor } from '../src/shared/protocolo';
import type { Clase, Escena, EstadoSala } from '../src/shared/tipos';
import { Salas } from './salas';

const PIN = '4321';

function contenido(): { escena: Escena; clase: Clase } {
  return {
    escena: {
      metrosPorCelda: 10,
      modulos: [
        { id: 'a', tipo: 'muelle', celda: [0, 0], rot: 0 },
        { id: 'b', tipo: 'grua-sts', celda: [1, 0], rot: 0 },
      ],
      vistas: { v1: { pos: [0, 1.6, 0], mira: [0, 1.6, -5] }, v2: { pos: [5, 1.6, 0], mira: [5, 1.6, -5] } },
    },
    clase: {
      id: 'c', titulo: 'Clase', escena: 'e',
      pasos: [
        { id: 'p0', titulo: 'Uno', vista: 'v1', resaltar: ['a'], animacion: 'ani' },
        { id: 'p1', titulo: 'Dos', vista: 'v2', resaltar: ['b'] },
        { id: 'p2', titulo: 'Tres', vista: 'v1', resaltar: [] },
      ],
    },
  };
}

/** Cliente de prueba: guarda todo lo que llega y permite esperar un mensaje que cumpla una condición. */
class Cliente {
  readonly mensajes: MsgServidor[] = [];
  cerrado = false;
  private esperas: Array<() => void> = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (d) => {
      this.mensajes.push(JSON.parse(d.toString()) as MsgServidor);
      this.esperas.forEach((f) => f());
    });
    ws.on('close', () => { this.cerrado = true; this.esperas.forEach((f) => f()); });
  }

  static async conectar(puerto: number): Promise<Cliente> {
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}`);
    const c = new Cliente(ws);
    await new Promise<void>((ok, mal) => { ws.once('open', () => ok()); ws.once('error', mal); });
    return c;
  }

  enviar(m: unknown): void { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }

  esperar<T extends MsgServidor>(cond: (m: MsgServidor) => m is T, ms = 2000): Promise<T> {
    return new Promise((ok, mal) => {
      const t = setTimeout(() => mal(new Error('Tiempo agotado esperando mensaje')), ms);
      const revisar = (): void => {
        const m = this.mensajes.find(cond);
        if (m) { clearTimeout(t); this.esperas = this.esperas.filter((f) => f !== revisar); ok(m); }
      };
      this.esperas.push(revisar);
      revisar();
    });
  }

  estado(cond: (e: EstadoSala) => boolean = () => true): Promise<EstadoSala> {
    return this.esperar((m): m is Extract<MsgServidor, { t: 'estado' }> => m.t === 'estado' && cond(m.e)).then((m) => m.e);
  }

  estados(): EstadoSala[] {
    return this.mensajes.flatMap((m) => (m.t === 'estado' ? [m.e] : []));
  }

  esperarCierre(ms = 2000): Promise<void> {
    return new Promise((ok, mal) => {
      const t = setTimeout(() => mal(new Error('No se cerró')), ms);
      const revisar = (): void => { if (this.cerrado) { clearTimeout(t); ok(); } };
      this.esperas.push(revisar);
      revisar();
    });
  }
}

const pausa = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

let dir: string;
let servidores: WebSocketServer[];
let clientes: Cliente[];

async function levantar(porDefecto: () => { escena: Escena; clase: Clase } = contenido): Promise<number> {
  const salas = new Salas({ pin: PIN, dirDatos: dir, contenidoPorDefecto: porDefecto });
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  wss.on('connection', (ws, req) => salas.conectar(ws, req.socket.remoteAddress));
  await new Promise<void>((ok) => wss.once('listening', () => ok()));
  servidores.push(wss);
  return (wss.address() as AddressInfo).port;
}

async function unir(puerto: number, rol: 'alumno' | 'docente' | 'editor' | 'proyector', sala = '1111', pin?: string): Promise<Cliente> {
  const c = await Cliente.conectar(puerto);
  clientes.push(c);
  c.enviar({ t: 'unirse', sala, rol, ...(pin !== undefined ? { pin } : {}) });
  return c;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'estiba-salas-'));
  servidores = [];
  clientes = [];
});

afterEach(async () => {
  for (const c of clientes) c.ws.terminate();
  await Promise.all(servidores.map((s) => new Promise<void>((ok) => { s.close(() => ok()); })));
  rmSync(dir, { recursive: true, force: true });
});

describe('Salas', () => {
  it('un alumno que se une recibe el estado completo con version 0', async () => {
    const p = await levantar();
    const a = await unir(p, 'alumno');
    const e = await a.estado();
    expect(e.version).toBe(0);
    expect(e.paso).toBe(0);
    expect(e.escena.modulos).toHaveLength(2);
    expect(e.clase.pasos).toHaveLength(3);
  });

  it('al crear la sala, una animación del primer paso arranca ahora y todos ven el mismo inicio', async () => {
    const antes = Date.now();
    const p = await levantar();
    const a = await unir(p, 'alumno');
    const ea = await a.estado();
    await pausa(20);
    const b = await unir(p, 'alumno');
    const eb = await b.estado();
    expect(ea.animacion?.id).toBe('ani');
    expect(ea.animacion!.inicio).toBeGreaterThanOrEqual(antes);
    expect(eb.animacion!.inicio).toBe(ea.animacion!.inicio);
  });

  it('un alumno que manda siguiente no cambia nada', async () => {
    const p = await levantar();
    const a = await unir(p, 'alumno');
    const b = await unir(p, 'alumno');
    await a.estado(); await b.estado();
    a.enviar({ t: 'comando', c: { t: 'siguiente' } });
    // Un ping de b vuelve después de que el servidor procesó el comando de a.
    b.enviar({ t: 'ping', tc: 1 });
    await b.esperar((m): m is Extract<MsgServidor, { t: 'pong' }> => m.t === 'pong');
    await pausa(30);
    expect(a.estados()).toHaveLength(1);
    expect(b.estados()).toHaveLength(1);
    expect(a.estados()[0].paso).toBe(0);
  });

  it('un docente con PIN malo recibe error PIN incorrecto y se cierra', async () => {
    const p = await levantar();
    const d = await unir(p, 'docente', '1111', '9999');
    const err = await d.esperar((m): m is Extract<MsgServidor, { t: 'error' }> => m.t === 'error');
    expect(err.motivo).toBe('PIN incorrecto');
    await d.esperarCierre();
    expect(d.estados()).toHaveLength(0);
  });

  it('un editor sin PIN es rechazado', async () => {
    const p = await levantar();
    const e = await unir(p, 'editor');
    const err = await e.esperar((m): m is Extract<MsgServidor, { t: 'error' }> => m.t === 'error');
    expect(err.motivo).toBe('PIN incorrecto');
    await e.esperarCierre();
  });

  it('el docente manda siguiente y dos alumnos reciben estado con paso 1', async () => {
    const p = await levantar();
    const a1 = await unir(p, 'alumno');
    const a2 = await unir(p, 'alumno');
    const d = await unir(p, 'docente', '1111', PIN);
    await Promise.all([a1.estado(), a2.estado(), d.estado()]);
    d.enviar({ t: 'comando', c: { t: 'siguiente' } });
    const [e1, e2] = await Promise.all([a1.estado((e) => e.paso === 1), a2.estado((e) => e.paso === 1)]);
    expect(e1.version).toBe(1);
    expect(e2.version).toBe(1);
    expect(e1.ubicacion.pos).toEqual([5, 1.6, 0]);
  });

  it('un comando sin efecto no genera un estado nuevo', async () => {
    const p = await levantar();
    const d = await unir(p, 'docente', '1111', PIN);
    await d.estado();
    d.enviar({ t: 'comando', c: { t: 'anterior' } });
    d.enviar({ t: 'ping', tc: 7 });
    await d.esperar((m): m is Extract<MsgServidor, { t: 'pong' }> => m.t === 'pong');
    expect(d.estados()).toHaveLength(1);
  });

  it('un alumno que se une después del siguiente recibe directamente paso 1', async () => {
    const p = await levantar();
    const d = await unir(p, 'docente', '1111', PIN);
    await d.estado();
    d.enviar({ t: 'comando', c: { t: 'siguiente' } });
    await d.estado((e) => e.paso === 1);
    const tarde = await unir(p, 'alumno');
    const e = await tarde.estado();
    expect(e.paso).toBe(1);
    expect(e.version).toBe(1);
    expect(tarde.estados()).toHaveLength(1);
  });

  it('las salas son independientes', async () => {
    const p = await levantar();
    const d = await unir(p, 'docente', '1111', PIN);
    const otra = await unir(p, 'alumno', '2222');
    await d.estado(); await otra.estado();
    d.enviar({ t: 'comando', c: { t: 'siguiente' } });
    await d.estado((e) => e.paso === 1);
    const tarde = await unir(p, 'alumno', '2222');
    expect((await tarde.estado()).paso).toBe(0);
    expect(otra.estados()).toHaveLength(1);
  });

  it('mensajes basura de un alumno no cortan a los demás ni a él', async () => {
    const p = await levantar();
    const malo = await unir(p, 'alumno');
    const otro = await unir(p, 'alumno');
    const d = await unir(p, 'docente', '1111', PIN);
    await Promise.all([malo.estado(), otro.estado(), d.estado()]);
    malo.enviar('esto no es json');
    malo.enviar({ t: 'comando', c: { t: 'volar' } });
    malo.enviar({ t: 'pose', cabeza: { pos: [1, 2], quat: [0, 0, 0, 1] }, rayo: null });
    malo.enviar({ t: 'unirse', sala: '9999', rol: 'docente', pin: PIN });
    malo.ws.send(Buffer.from([0, 1, 2, 3]));
    d.enviar({ t: 'comando', c: { t: 'siguiente' } });
    await otro.estado((e) => e.paso === 1);
    await malo.estado((e) => e.paso === 1);
    expect(malo.cerrado).toBe(false);
    malo.enviar({ t: 'ping', tc: 3 });
    const pong = await malo.esperar((m): m is Extract<MsgServidor, { t: 'pong' }> => m.t === 'pong');
    expect(pong.tc).toBe(3);
    expect(typeof pong.ts).toBe('number');
  });

  it('el primer mensaje debe ser unirse con código de 4 dígitos', async () => {
    const p = await levantar();
    const sinUnirse = await Cliente.conectar(p);
    clientes.push(sinUnirse);
    sinUnirse.enviar({ t: 'comando', c: { t: 'siguiente' } });
    await sinUnirse.esperar((m): m is Extract<MsgServidor, { t: 'error' }> => m.t === 'error');
    await sinUnirse.esperarCierre();

    for (const sala of ['12', 'abcd', '12345', '../x']) {
      const c = await unir(p, 'alumno', sala);
      await c.esperar((m): m is Extract<MsgServidor, { t: 'error' }> => m.t === 'error');
      await c.esperarCierre();
    }
    expect(existsSync(join(dir, '..', 'x.json'))).toBe(false);
  });

  it('la pose del docente llega a todos menos a quien la manda; la del alumno se ignora', async () => {
    const p = await levantar();
    const d = await unir(p, 'docente', '1111', PIN);
    const a = await unir(p, 'alumno');
    const pr = await unir(p, 'proyector');
    await Promise.all([d.estado(), a.estado(), pr.estado()]);
    const pose = { t: 'pose', cabeza: { pos: [1, 2, 3], quat: [0, 0, 0, 1] }, rayo: null };
    a.enviar(pose);
    d.enviar(pose);
    const recibida = await a.esperar((m): m is Extract<MsgServidor, { t: 'pose' }> => m.t === 'pose');
    await pr.esperar((m): m is Extract<MsgServidor, { t: 'pose' }> => m.t === 'pose');
    expect(recibida.cabeza.pos).toEqual([1, 2, 3]);
    d.enviar({ t: 'ping', tc: 1 });
    await d.esperar((m): m is Extract<MsgServidor, { t: 'pong' }> => m.t === 'pong');
    expect(d.mensajes.some((m) => m.t === 'pose')).toBe(false);
    expect(a.mensajes.filter((m) => m.t === 'pose')).toHaveLength(1);
  });

  it('acepta como máximo 40 conexiones por sala', async () => {
    const p = await levantar();
    const dentro: Cliente[] = [];
    for (let i = 0; i < 40; i += 1) dentro.push(await unir(p, 'alumno'));
    await Promise.all(dentro.map((c) => c.estado()));
    const extra = await unir(p, 'alumno');
    const err = await extra.esperar((m): m is Extract<MsgServidor, { t: 'error' }> => m.t === 'error');
    expect(err.motivo).toBe('Sala llena');
    await extra.esperarCierre();
    // Si alguien se va, entra otro.
    dentro[0].ws.close();
    await dentro[0].esperarCierre();
    await pausa(30);
    const nuevo = await unir(p, 'alumno');
    await nuevo.estado();
  });

  it('docente y editor mandan 20 comandos intercalados y todos terminan con la misma version', async () => {
    const p = await levantar();
    const d = await unir(p, 'docente', '1111', PIN);
    const ed = await unir(p, 'editor', '1111', PIN);
    const a = await unir(p, 'alumno');
    await Promise.all([d.estado(), ed.estado(), a.estado()]);

    // 8 recentrar (siempre cambian) + 8 agregar de módulos distintos + 4 sin efecto = 16 con efecto.
    for (let i = 0; i < 8; i += 1) {
      d.enviar({ t: 'comando', c: { t: 'recentrar' } });
      ed.enviar({ t: 'comando', c: { t: 'escena', op: { op: 'agregar', modulo: { id: `n${i}`, tipo: 'via', celda: [i, 5], rot: 0 } } } });
      if (i % 2 === 0) {
        d.enviar({ t: 'comando', c: { t: 'anterior' } });
        ed.enviar({ t: 'comando', c: { t: 'escena', op: { op: 'borrar', id: 'no-existe' } } });
      }
    }
    const esperadas = 16;
    await Promise.all([d, ed, a].map((c) => c.estado((e) => e.version === esperadas)));
    await pausa(60);
    for (const c of [d, ed, a]) {
      const vs = c.estados().map((e) => e.version);
      expect(vs[vs.length - 1]).toBe(esperadas);
      expect(vs).toEqual([...vs].sort((x, y) => x - y));
      expect(new Set(vs).size).toBe(vs.length);
    }
    const ultimo = a.estados().at(-1)!;
    expect(ultimo.recentrar).toBe(8);
    expect(ultimo.escena.modulos).toHaveLength(2 + 8);
  });

  it('guarda escena y clase en data/<sala>.json y una Salas nueva arranca con eso', async () => {
    const p = await levantar();
    const ed = await unir(p, 'editor', '5555', PIN);
    await ed.estado();
    const modulo = { id: 'nuevo', tipo: 'tren', celda: [4, 4], rot: 90 };
    ed.enviar({ t: 'comando', c: { t: 'escena', op: { op: 'agregar', modulo } } });
    await ed.estado((e) => e.version === 1);
    const archivo = join(dir, '5555.json');
    expect(existsSync(archivo)).toBe(true);
    const guardado = JSON.parse(readFileSync(archivo, 'utf8')) as { escena: Escena; clase: Clase };
    expect(guardado.escena.modulos.some((m) => m.id === 'nuevo')).toBe(true);

    ed.enviar({ t: 'comando', c: { t: 'clase', op: { op: 'borrarPaso', indice: 2 } } });
    await ed.estado((e) => e.version === 2);

    const p2 = await levantar();
    const a = await unir(p2, 'alumno', '5555');
    const e = await a.estado();
    expect(e.escena.modulos.map((m) => m.id)).toContain('nuevo');
    expect(e.clase.pasos).toHaveLength(2);
    expect(e.version).toBe(0);
  });

  it('los comandos de presentación no escriben en disco', async () => {
    const p = await levantar();
    const d = await unir(p, 'docente', '1111', PIN);
    await d.estado();
    d.enviar({ t: 'comando', c: { t: 'siguiente' } });
    await d.estado((e) => e.paso === 1);
    expect(existsSync(join(dir, '1111.json'))).toBe(false);
  });

  it('ignora un archivo guardado corrupto y usa el contenido por defecto', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, '7777.json'), '{ no es json');
    const p = await levantar();
    const a = await unir(p, 'alumno', '7777');
    expect((await a.estado()).escena.modulos).toHaveLength(2);
  });

  it('tras 5 PIN malos desde la misma dirección, el sexto con PIN correcto también se rechaza', async () => {
    const p = await levantar();
    for (let i = 0; i < 5; i += 1) {
      const c = await unir(p, 'docente', '1111', `000${i}`);
      const err = await c.esperar((m): m is Extract<MsgServidor, { t: 'error' }> => m.t === 'error');
      expect(err.motivo).toBe('PIN incorrecto');
      await c.esperarCierre();
    }
    const sexto = await unir(p, 'editor', '1111', PIN);
    const err = await sexto.esperar((m): m is Extract<MsgServidor, { t: 'error' }> => m.t === 'error');
    expect(err.motivo).toBe('Demasiados intentos, esperá un minuto');
    await sexto.esperarCierre();
    expect(sexto.estados()).toHaveLength(0);
    // Los alumnos no usan PIN y no se ven afectados.
    const alumno = await unir(p, 'alumno');
    await alumno.estado();
  });

  it('si no se puede crear la sala responde No se pudo abrir la sala y cierra', async () => {
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = await levantar(() => { throw new Error('contenido roto'); });
    const a = await unir(p, 'alumno');
    const err = await a.esperar((m): m is Extract<MsgServidor, { t: 'error' }> => m.t === 'error');
    expect(err.motivo).toBe('No se pudo abrir la sala');
    await a.esperarCierre();
    silencio.mockRestore();
  });

  describe('participantes', () => {
    type Part = Extract<MsgServidor, { t: 'participantes' }>;
    const esPart = (m: MsgServidor): m is Part => m.t === 'participantes';
    const conAlumnos = (n: number) => (m: MsgServidor): m is Part =>
      esPart(m) && m.lista.filter((x) => x.rol === 'alumno').length === n;

    it('un docente recibe la lista con 2 alumnos tras unirse dos, y un alumno nunca la recibe', async () => {
      const p = await levantar();
      const d = await unir(p, 'docente', '1111', PIN);
      const a1 = await unir(p, 'alumno');
      const a2 = await unir(p, 'alumno');
      const m = await d.esperar(conAlumnos(2), 4500);
      expect(m.lista.filter((x) => x.rol === 'alumno').map((x) => x.nombre)).toEqual(['Alumno 1', 'Alumno 2']);
      a1.enviar({ t: 'dispositivo', bateria: 0.1, cargando: false });
      const m2 = await d.esperar((x): x is Part => esPart(x) && x.lista.some((y) => y.bateria === 0.1), 4500);
      expect(m2.lista.find((y) => y.bateria === 0.1)).toMatchObject({ nombre: 'Alumno 1', cargando: false });
      await a2.estado();
      expect(a1.mensajes.some(esPart)).toBe(false);
      expect(a2.mensajes.some(esPart)).toBe(false);
    }, 12000);

    it('un dispositivo malformado se ignora y la lista pierde al que se va', async () => {
      const p = await levantar();
      const d = await unir(p, 'docente', '1111', PIN);
      const a = await unir(p, 'alumno');
      await d.esperar(conAlumnos(1), 4500);
      a.enviar({ t: 'dispositivo', bateria: 7, cargando: false });
      a.ws.close();
      await d.esperar(conAlumnos(0), 4500);
      expect(d.mensajes.filter(esPart).some((m) => m.lista.some((x) => x.bateria === 7))).toBe(false);
    }, 12000);
  });
});
