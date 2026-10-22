import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConexionSala, ESPERAS_MS, type SocketLike } from './red';

class Falso implements SocketLike {
  static todos: Falso[] = [];
  readyState = 0;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  enviados: string[] = [];
  constructor() { Falso.todos.push(this); }
  send(d: string) { this.enviados.push(d); }
  close() { this.readyState = 3; this.onclose?.({}); }
  abrir() { this.readyState = 1; this.onopen?.({}); }
  recibir(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const crear = () => new ConexionSala('1234', 'alumno', undefined, {
  url: 'ws://x/ws', crearSocket: () => new Falso(),
});

describe('ConexionSala', () => {
  beforeEach(() => { vi.useFakeTimers(); Falso.todos = []; });
  afterEach(() => vi.useRealTimers());

  it('manda unirse al abrir y otra vez al reconectar, con esperas crecientes', () => {
    const c = crear();
    Falso.todos[0].abrir();
    expect(JSON.parse(Falso.todos[0].enviados[0])).toEqual({ t: 'unirse', sala: '1234', rol: 'alumno' });
    expect(c.conectado).toBe(true);
    for (let i = 0; i < ESPERAS_MS.length + 1; i++) {
      const s = Falso.todos[Falso.todos.length - 1];
      s.readyState = 3; s.onclose?.({});
      const n = Falso.todos.length;
      vi.advanceTimersByTime(ESPERAS_MS[Math.min(i, ESPERAS_MS.length - 1)] - 1);
      expect(Falso.todos.length).toBe(n);
      vi.advanceTimersByTime(1);
      expect(Falso.todos.length).toBe(n + 1);
    }
    const ultimo = Falso.todos[Falso.todos.length - 1];
    ultimo.abrir();
    expect(JSON.parse(ultimo.enviados[0]).t).toBe('unirse');
    c.cerrar();
  });

  it('no reconecta tras un error fatal y lo expone', () => {
    const c = crear();
    const errores: string[] = [];
    c.alError((m) => errores.push(m));
    const s = Falso.todos[0];
    s.abrir();
    s.recibir({ t: 'error', motivo: 'PIN incorrecto' });
    s.readyState = 3; s.onclose?.({});
    vi.advanceTimersByTime(60_000);
    expect(errores).toEqual(['PIN incorrecto']);
    expect(Falso.todos.length).toBe(1);
    c.cerrar();
  });

  it('limita la pose a 20 por segundo', () => {
    let t = 1000;
    const c = new ConexionSala('1234', 'docente', '0000', {
      url: 'ws://x/ws', crearSocket: () => new Falso(), ahora: () => t,
    });
    const s = Falso.todos[0];
    s.abrir();
    const pose = {
      cabeza: { pos: [0, 0, 0] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number] },
      rayo: null,
    };
    const antes = s.enviados.length;
    for (let i = 0; i < 10; i++) { c.enviarPose(pose); t += 10; }
    expect(s.enviados.length - antes).toBe(2);
    c.cerrar();
  });

  it('un oyente que tira no impide la reconexión ni a los demás oyentes', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = crear();
    const vistos: boolean[] = [];
    c.alCambioConexion(() => { throw new Error('boom'); });
    c.alCambioConexion((v) => vistos.push(v));
    const s = Falso.todos[0];
    s.abrir();
    s.readyState = 3; s.onclose?.({});
    vi.advanceTimersByTime(500);
    expect(Falso.todos.length).toBe(2);
    expect(vistos).toEqual([true, false]);
    c.cerrar();
    err.mockRestore();
  });

  it('la última pose descartada se manda al cerrar la ventana de 50 ms', () => {
    vi.setSystemTime(10_000);
    const c = crear();
    const s = Falso.todos[0];
    s.abrir();
    const mk = (x: number) => ({
      cabeza: { pos: [x, 0, 0] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number] },
      rayo: null,
    });
    const poses = () => s.enviados.map((d) => JSON.parse(d)).filter((m) => m.t === 'pose');
    c.enviarPose(mk(1));
    vi.advanceTimersByTime(10);
    c.enviarPose(mk(2));
    expect(poses().length).toBe(1);
    vi.advanceTimersByTime(39);
    expect(poses().length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(poses().map((m) => m.cabeza.pos[0])).toEqual([1, 2]);
    vi.advanceTimersByTime(1000);
    expect(poses().length).toBe(2);
    c.cerrar();
  });
});
