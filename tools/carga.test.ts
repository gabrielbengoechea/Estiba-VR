import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
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
});
