import { connect, type AddressInfo, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { crearServidor } from './servidor';

let http: Server;
let dir: string;
const abiertos: Array<Socket | WebSocket> = [];

afterEach(async () => {
  for (const s of abiertos.splice(0)) (s instanceof WebSocket ? s.terminate() : s.destroy());
  await new Promise<void>((ok) => { http.close(() => ok()); });
  rmSync(dir, { recursive: true, force: true });
});

async function levantar(): Promise<number> {
  dir = mkdtempSync(join(tmpdir(), 'estiba-http-'));
  http = crearServidor({
    pin: '1234', dirDatos: dir, dirWeb: join(dir, 'no-existe'),
    contenidoPorDefecto: () => ({
      escena: { metrosPorCelda: 10, modulos: [], vistas: {} },
      clase: { id: 'c', titulo: 'C', escena: 'e', pasos: [] },
    }),
  });
  await new Promise<void>((ok) => http.listen(0, '127.0.0.1', ok));
  return (http.address() as AddressInfo).port;
}

function upgradeCrudo(puerto: number, destino: string): Promise<void> {
  return new Promise((ok) => {
    const s = connect(puerto, '127.0.0.1');
    abiertos.push(s);
    s.on('error', () => ok());
    s.on('close', () => ok());
    s.write(`GET ${destino} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n`
      + 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
  });
}

describe('servidor HTTP', () => {
  it('un upgrade con URL inválida no tira el servidor', async () => {
    const puerto = await levantar();
    for (const destino of ['//', '//:80', 'http://[']) await upgradeCrudo(puerto, destino);
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}/ws`);
    abiertos.push(ws);
    const msg = await new Promise<{ t: string }>((ok, mal) => {
      ws.once('open', () => ws.send(JSON.stringify({ t: 'unirse', sala: '1234', rol: 'alumno' })));
      ws.once('message', (d) => ok(JSON.parse(d.toString())));
      ws.once('error', mal);
    });
    expect(msg.t).toBe('estado');
  });

  it('responde 404 si falta dist/', async () => {
    const puerto = await levantar();
    const r = await fetch(`http://127.0.0.1:${puerto}/`);
    expect(r.status).toBe(404);
  });
});
