import { createServer as crearHttp, type Server, type RequestListener } from 'node:http';
import { createServer as crearHttps } from 'node:https';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { Salas, type OpcionesSalas } from './salas';
import { ipCliente } from './ip';
import { urlsDeLaRed } from './red';
import { iniciarLatido, LATIDO_MS } from './latido';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const ALIAS: Record<string, string> = { '/': '/index.html', '/editor': '/editor.html' };

/** Servidor HTTP (o HTTPS si hay `tls`) que sirve `dirWeb`, con WebSocket en /ws. No empieza a escuchar: lo hace quien lo llama. */
export function crearServidor(opts: OpcionesSalas & { dirWeb: string; latidoMs?: number; tls?: { key: string; cert: string } }): Server {
  const salas = new Salas(opts);
  const dirWeb = normalize(opts.dirWeb);

  const atender: RequestListener = (req, res) => {
    const noEncontrado = (): void => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); };
    let ruta: string;
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/red' && opts.tls) {
        const puerto = (http.address() as { port?: number } | null)?.port ?? 0;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ urls: urlsDeLaRed(puerto, networkInterfaces()) }));
        return;
      }
      ruta = ALIAS[url.pathname] ?? decodeURIComponent(url.pathname);
    } catch {
      noEncontrado();
      return;
    }
    const archivo = normalize(join(dirWeb, ruta));
    if (archivo !== dirWeb && !archivo.startsWith(dirWeb + sep)) { noEncontrado(); return; }
    readFile(archivo).then((datos) => {
      res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream' });
      res.end(datos);
    }, noEncontrado); // incluye dist/ inexistente (desarrollo): 404 sin caerse
  };
  const http: Server = opts.tls ? crearHttps(opts.tls, atender) : crearHttp(atender);

  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  wss.on('connection', (ws, req) => salas.conectar(ws, ipCliente(req)));
  iniciarLatido(wss, opts.latidoMs ?? LATIDO_MS);

  http.on('upgrade', (req, socket, head) => {
    socket.on('error', () => { /* cliente que se fue: nada que hacer */ });
    let ruta: string;
    try {
      ruta = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (ruta !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  http.on('close', () => wss.close());
  return http;
}
