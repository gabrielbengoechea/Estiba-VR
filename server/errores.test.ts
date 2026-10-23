import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { crearServidor } from './servidor';

let http: Server;
let dir: string;
afterEach(async () => {
  await new Promise<void>((ok) => { http.close(() => ok()); });
  rmSync(dir, { recursive: true, force: true });
});

async function levantar(errores?: { maxArchivo?: number; porMinuto?: number }): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'estiba-err-'));
  http = crearServidor({
    pin: '1234', dirDatos: dir, dirWeb: join(dir, 'no-existe'), errores,
    contenidoPorDefecto: () => ({
      escena: { metrosPorCelda: 10, modulos: [], vistas: {} },
      clase: { id: 'c', titulo: 'C', escena: 'e', pasos: [] },
    }),
  });
  await new Promise<void>((ok) => http.listen(0, '127.0.0.1', ok));
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
}

const err = (mensaje: string) => ({ rol: 'alumno', sala: '1234', mensaje, pila: 'pila', url: 'http://x/', ua: 'UA', momento: 1 });
const publicar = (base: string, cuerpo: unknown) =>
  fetch(`${base}/api/errores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });
const lineas = (): string[] => readFileSync(join(dir, 'errores.log'), 'utf8').split('\n').filter(Boolean);

describe('registro de errores', () => {
  it('un POST válido escribe una línea JSON y responde 204', async () => {
    const base = await levantar();
    const r = await publicar(base, err('se rompió'));
    expect(r.status).toBe(204);
    const l = lineas();
    expect(l).toHaveLength(1);
    expect(JSON.parse(l[0]!).mensaje).toBe('se rompió');
  });

  it('un cuerpo de 9 KB responde 413 y no escribe', async () => {
    const base = await levantar();
    const r = await publicar(base, err('x'.repeat(9 * 1024)));
    expect(r.status).toBe(413);
    expect(existsSync(join(dir, 'errores.log'))).toBe(false);
  });

  it('un cuerpo grande sin Content-Length (chunked) también responde 413', async () => {
    const base = await levantar();
    const flujo = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"a":"' + 'x'.repeat(9000) + '"}')); c.close(); } });
    const r = await fetch(`${base}/api/errores`, { method: 'POST', body: flujo, duplex: 'half' } as RequestInit);
    expect(r.status).toBe(413);
    expect(existsSync(join(dir, 'errores.log'))).toBe(false);
  });

  it('JSON inválido o que no es un objeto responde 400 y no escribe', async () => {
    const base = await levantar();
    expect((await publicar(base, '{no es json')).status).toBe(400);
    expect((await publicar(base, '[1,2]')).status).toBe(400);
    expect(existsSync(join(dir, 'errores.log'))).toBe(false);
  });

  it('el error 21 de la misma IP en un minuto responde 429 y no se escribe', async () => {
    const base = await levantar();
    for (let i = 0; i < 20; i++) expect((await publicar(base, err(`e${i}`))).status).toBe(204);
    expect((await publicar(base, err('e20'))).status).toBe(429);
    expect(lineas()).toHaveLength(20);
  });

  it('los campos se recortan a 2000 caracteres y solo se guardan los conocidos', async () => {
    const base = await levantar();
    await publicar(base, { ...err('m'.repeat(3000)), basura: 'no' });
    const o = JSON.parse(lineas()[0]!);
    expect(o.mensaje).toHaveLength(2000);
    expect(o.basura).toBeUndefined();
  });

  it('al pasar el límite el archivo se rota a errores.1.log (uno solo) y empieza otro', async () => {
    const base = await levantar({ maxArchivo: 300 });
    for (let i = 0; i < 6; i++) await publicar(base, err(`e${i}`));
    expect(existsSync(join(dir, 'errores.1.log'))).toBe(true);
    expect(existsSync(join(dir, 'errores.2.log'))).toBe(false);
    expect(readFileSync(join(dir, 'errores.log'), 'utf8').length).toBeLessThan(600);
    const total = lineas().length + readFileSync(join(dir, 'errores.1.log'), 'utf8').split('\n').filter(Boolean).length;
    expect(total).toBeLessThanOrEqual(6);
    expect(total).toBeGreaterThan(1);
  });

  it('GET /errores sin PIN o con PIN malo responde 403 y no muestra nada', async () => {
    const base = await levantar();
    await publicar(base, err('secreto'));
    for (const q of ['', '?pin=0000']) {
      const r = await fetch(`${base}/errores${q}`);
      expect(r.status).toBe(403);
      expect(await r.text()).not.toContain('secreto');
    }
  });

  it('GET /errores con PIN correcto responde 200, más nuevos primero, y escapa el HTML', async () => {
    const base = await levantar();
    await publicar(base, err('viejo-aviso'));
    await publicar(base, err('<script>alert(1)</script>'));
    const r = await fetch(`${base}/errores?pin=1234`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    const html = await r.text();
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html.indexOf('&lt;script&gt;')).toBeLessThan(html.indexOf('viejo-aviso'));
  });

  it('GET /errores sin ningún error responde 200 con aviso', async () => {
    const base = await levantar();
    const r = await fetch(`${base}/errores?pin=1234`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('Sin errores');
  });

  it('frena el adivinar el PIN: tras 5 fallos seguidos responde 429 aun con el PIN correcto', async () => {
    const base = await levantar();
    for (let i = 0; i < 5; i++) expect((await fetch(`${base}/errores?pin=000${i}`)).status).toBe(403);
    expect((await fetch(`${base}/errores?pin=1234`)).status).toBe(429);
  });
});
