import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { Clase, Escena } from '../src/shared/tipos';
import { Salas } from './salas';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirWeb = join(raiz, 'dist');
const dirPublico = join(raiz, 'public');
const puerto = Number(process.env.PORT) || 8787;
const produccion = process.env.NODE_ENV === 'production';

let pin = process.env.ESTIBA_PIN;
if (!pin) {
  if (produccion) {
    console.error('Falta la variable de entorno ESTIBA_PIN: en producción el PIN es obligatorio.');
    process.exit(1);
  }
  pin = '0000';
  console.warn('Aviso: ESTIBA_PIN no está definido; se usa el PIN de desarrollo 0000. No lo uses en una clase real.');
}

function leerJson<T>(ruta: string): T {
  return JSON.parse(readFileSync(ruta, 'utf8')) as T;
}

// Se lee en cada sala nueva para que un cambio en los JSON se vea sin reiniciar el servidor.
const salas = new Salas({
  pin,
  dirDatos: process.env.ESTIBA_DATOS ?? join(raiz, 'data'),
  contenidoPorDefecto: () => ({
    escena: leerJson<Escena>(join(dirPublico, 'escenas', 'terminal-a.json')),
    clase: leerJson<Clase>(join(dirPublico, 'clases', 'terminal-contenedores.json')),
  }),
});

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

const http = createServer((req, res) => {
  const noEncontrado = (): void => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); };
  let ruta: string;
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
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
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
wss.on('connection', (ws) => salas.conectar(ws));

http.on('upgrade', (req, socket, head) => {
  const ruta = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (ruta !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

http.listen(puerto, () => {
  console.log(`Estiba escuchando en el puerto ${puerto} (WebSocket en /ws)`);
});
