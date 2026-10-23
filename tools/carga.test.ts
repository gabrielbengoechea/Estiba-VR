import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearServidor } from '../server/servidor';
import { ejecutarCarga } from './carga';

let http: Server;
let dir: string;
let puerto: number;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'estiba-carga-'));
  const paso = (id: string) => ({ id, titulo: id, vista: 'v', resaltar: [] });
  http = crearServidor({
    pin: '1234', dirDatos: dir, dirWeb: join(dir, 'no-existe'),
    contenidoPorDefecto: () => ({
      escena: { metrosPorCelda: 10, modulos: [], vistas: {} },
      clase: { id: 'c', titulo: 'C', escena: 'e', pasos: [paso('a'), paso('b'), paso('c')] },
    }),
  });
  await new Promise<void>((ok) => http.listen(0, '127.0.0.1', ok));
  puerto = (http.address() as AddressInfo).port;
});

afterAll(async () => {
  http.closeAllConnections();
  await new Promise<void>((ok) => { http.close(() => ok()); });
  rmSync(dir, { recursive: true, force: true });
});

describe('prueba de carga', () => {
  it('30 alumnos reciben todos los estados sin desconexiones', async () => {
    const r = await ejecutarCarga({
      url: `ws://127.0.0.1:${puerto}/ws`, sala: '1234', pin: '1234', alumnos: 30, segundos: 3, pasosCada: 0.5,
    });
    expect(r.conectados).toBe(30);
    expect(r.desconexiones).toBe(0);
    expect(r.estadosPerdidos).toBe(0);
    expect(r.latenciaP95).toBeLessThan(500);
  }, 20_000);

  it('un comando sin estado resultante se cuenta como sin respuesta y no frena el envío', async () => {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((ok) => wss.once('listening', ok));
    const estado = { t: 'estado', ts: 0, e: { version: 1, paso: 0, clase: { pasos: [{}, {}] } } };
    wss.on('connection', (ws) => ws.on('message', (d) => {
      if (JSON.parse(d.toString()).t === 'unirse') ws.send(JSON.stringify(estado));
    }));
    const { port } = wss.address() as AddressInfo;
    const r = await ejecutarCarga({
      url: `ws://127.0.0.1:${port}/ws`, sala: '1234', pin: 'x', alumnos: 2, segundos: 1, pasosCada: 0.1, esperaComandoMs: 200,
    });
    for (const c of wss.clients) c.terminate();
    await new Promise<void>((ok) => { wss.close(() => ok()); });
    expect(r.comandosSinRespuesta).toBeGreaterThan(1);
    expect(r.muestras).toBe(0);
  }, 10_000);
});
