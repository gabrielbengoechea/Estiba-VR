import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarLatido, LATIDO_MS, type ServidorLatido } from './latido';

class FalsoWs extends EventEmitter {
  ping = vi.fn();
  terminate = vi.fn();
}
class FalsoWss extends EventEmitter {
  clients = new Set<FalsoWs>();
  conectar(): FalsoWs {
    const ws = new FalsoWs();
    this.clients.add(ws);
    this.emit('connection', ws);
    return ws;
  }
}
const comoServidor = (w: FalsoWss) => w as unknown as ServidorLatido;

describe('latido del servidor', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('manda un ping cada 15 s a quien está vivo', () => {
    const wss = new FalsoWss();
    iniciarLatido(comoServidor(wss));
    const ws = wss.conectar();
    vi.advanceTimersByTime(LATIDO_MS);
    expect(ws.ping).toHaveBeenCalledTimes(1);
    ws.emit('pong');
    vi.advanceTimersByTime(LATIDO_MS);
    expect(ws.ping).toHaveBeenCalledTimes(2);
    expect(ws.terminate).not.toHaveBeenCalled();
  });

  it('corta la conexión que no contestó al ping anterior', () => {
    const wss = new FalsoWss();
    iniciarLatido(comoServidor(wss));
    const ws = wss.conectar();
    vi.advanceTimersByTime(LATIDO_MS); // ping
    vi.advanceTimersByTime(LATIDO_MS - 1);
    expect(ws.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); // no hubo pong
    expect(ws.terminate).toHaveBeenCalledTimes(1);
  });

  it('cualquier mensaje del cliente cuenta como señal de vida', () => {
    const wss = new FalsoWss();
    iniciarLatido(comoServidor(wss));
    const ws = wss.conectar();
    vi.advanceTimersByTime(LATIDO_MS);
    ws.emit('message');
    vi.advanceTimersByTime(LATIDO_MS);
    expect(ws.terminate).not.toHaveBeenCalled();
  });

  it('una conexión muerta no afecta a las demás y al detener ya no late', () => {
    const wss = new FalsoWss();
    const detener = iniciarLatido(comoServidor(wss));
    const muerta = wss.conectar();
    const viva = wss.conectar();
    vi.advanceTimersByTime(LATIDO_MS);
    viva.emit('pong');
    vi.advanceTimersByTime(LATIDO_MS);
    expect(muerta.terminate).toHaveBeenCalled();
    expect(viva.terminate).not.toHaveBeenCalled();
    detener();
    const antes = viva.ping.mock.calls.length;
    vi.advanceTimersByTime(LATIDO_MS * 3);
    expect(viva.ping.mock.calls.length).toBe(antes);
  });

  it('un ping que lanza no tira el servidor', () => {
    const wss = new FalsoWss();
    iniciarLatido(comoServidor(wss));
    const ws = wss.conectar();
    ws.ping.mockImplementation(() => { throw new Error('cerrando'); });
    expect(() => vi.advanceTimersByTime(LATIDO_MS)).not.toThrow();
  });
});
