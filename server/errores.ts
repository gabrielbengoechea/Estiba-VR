import type { IncomingMessage, ServerResponse } from 'node:http';
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pinCorrecto } from './pin';
import { ipCliente } from './ip';

export interface OpcionesErrores {
  /** Tamaño máximo del cuerpo de un aviso, en bytes. */
  maxCuerpo?: number;
  /** Avisos por minuto por IP. */
  porMinuto?: number;
  /** Al pasar este tamaño, `errores.log` pasa a `errores.1.log` (se pisa el anterior). */
  maxArchivo?: number;
  /** Intentos de PIN fallidos por minuto por IP en /errores. */
  fallosPinPorMinuto?: number;
}

const CAMPOS = ['rol', 'sala', 'mensaje', 'pila', 'url', 'ua'] as const;
const MAX_CAMPO = 2000;
const MOSTRAR = 200;
const VENTANA_MS = 60_000;
const MAX_IPS = 10_000;

const esc = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Cuenta eventos por IP en la última ventana; la tabla está acotada para que no crezca sin fin. */
class LimitePorIp {
  private readonly marcas = new Map<string, number[]>();
  constructor(private readonly max: number) {}
  /** Devuelve false si esta IP ya agotó su cupo (y no cuenta el intento). */
  permitir(ip: string, ahora = Date.now()): boolean {
    if (this.marcas.size >= MAX_IPS && !this.marcas.has(ip)) {
      for (const [k, v] of this.marcas) if (!v.some((t) => ahora - t < VENTANA_MS)) this.marcas.delete(k);
      if (this.marcas.size >= MAX_IPS) return false;
    }
    const vigentes = (this.marcas.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
    if (vigentes.length >= this.max) { this.marcas.set(ip, vigentes); return false; }
    vigentes.push(ahora);
    this.marcas.set(ip, vigentes);
    return true;
  }
  agotado(ip: string, ahora = Date.now()): boolean {
    return (this.marcas.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS).length >= this.max;
  }
}

/** Registro propio de errores de los clientes: POST /api/errores y GET /errores?pin=. */
export function crearRegistroErrores(dirDatos: string, pin: string, opts: OpcionesErrores = {}) {
  const maxCuerpo = opts.maxCuerpo ?? 8 * 1024;
  const maxArchivo = opts.maxArchivo ?? 5 * 1024 * 1024;
  const avisos = new LimitePorIp(opts.porMinuto ?? 20);
  const fallosPin = new LimitePorIp(opts.fallosPinPorMinuto ?? 5);
  const actual = join(dirDatos, 'errores.log');
  const anterior = join(dirDatos, 'errores.1.log');
  let cola: Promise<void> = Promise.resolve(); // las escrituras van de a una: la rotación no se pisa

  const texto = (res: ServerResponse, codigo: number, cuerpo: string): void => {
    res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(cuerpo);
  };

  async function escribir(linea: string): Promise<void> {
    await mkdir(dirDatos, { recursive: true });
    const tam = await stat(actual).then((s) => s.size, () => 0);
    if (tam >= maxArchivo) await rename(actual, anterior);
    await appendFile(actual, linea, 'utf8');
  }

  /** Lee el cuerpo hasta `maxCuerpo` bytes; null si se pasa (y se deja de acumular). */
  function leerCuerpo(req: IncomingMessage): Promise<string | null> {
    return new Promise((ok) => {
      const declarado = Number(req.headers['content-length']);
      if (Number.isFinite(declarado) && declarado > maxCuerpo) { ok(null); return; }
      const trozos: Buffer[] = [];
      let total = 0;
      let listo = false;
      const fin = (v: string | null): void => { if (!listo) { listo = true; ok(v); } };
      req.on('data', (t: Buffer) => {
        total += t.length;
        if (total > maxCuerpo) { trozos.length = 0; fin(null); return; }
        trozos.push(t);
      });
      req.on('end', () => fin(Buffer.concat(trozos).toString('utf8')));
      req.on('error', () => fin(null));
    });
  }

  async function recibir(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = ipCliente(req) ?? 'desconocida';
    if (!avisos.permitir(ip)) { texto(res, 429, 'Demasiados avisos'); req.resume(); return; }
    const crudo = await leerCuerpo(req);
    if (crudo === null) {
      res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
      res.end('Aviso demasiado grande');
      return;
    }
    let dato: unknown;
    try { dato = JSON.parse(crudo); } catch { texto(res, 400, 'JSON inválido'); return; }
    if (typeof dato !== 'object' || dato === null || Array.isArray(dato)) { texto(res, 400, 'Se esperaba un objeto'); return; }
    const o = dato as Record<string, unknown>;
    const limpio: Record<string, string | number> = {};
    for (const c of CAMPOS) limpio[c] = typeof o[c] === 'string' ? (o[c] as string).slice(0, MAX_CAMPO) : '';
    limpio.momento = typeof o.momento === 'number' && Number.isFinite(o.momento) ? o.momento : Date.now();
    const linea = JSON.stringify(limpio) + '\n';
    cola = cola.then(() => escribir(linea)).catch(() => { /* disco lleno o sin permiso: no se cae el servidor */ });
    await cola;
    res.writeHead(204);
    res.end();
  }

  async function ultimos(): Promise<Array<Record<string, unknown>>> {
    const lista: Array<Record<string, unknown>> = [];
    for (const ruta of [actual, anterior]) {
      if (lista.length >= MOSTRAR) break;
      const crudo = await readFile(ruta, 'utf8').catch(() => '');
      const lineas = crudo.split('\n').filter(Boolean);
      for (let i = lineas.length - 1; i >= 0 && lista.length < MOSTRAR; i--) {
        try { lista.push(JSON.parse(lineas[i]!) as Record<string, unknown>); } catch { /* línea cortada: se salta */ }
      }
    }
    return lista;
  }

  async function ver(req: IncomingMessage, res: ServerResponse, pinDado: string | undefined): Promise<void> {
    const ip = ipCliente(req) ?? 'desconocida';
    if (fallosPin.agotado(ip)) { texto(res, 429, 'Demasiados intentos; esperá un minuto'); return; }
    if (!pinCorrecto(pinDado, pin)) { fallosPin.permitir(ip); texto(res, 403, 'PIN incorrecto'); return; }
    await cola;
    const filas = (await ultimos()).map((e) => {
      const s = (k: string): string => esc(String(e[k] ?? ''));
      const cuando = typeof e.momento === 'number' ? new Date(e.momento).toLocaleString('es-UY') : '';
      return `<tr><td>${esc(cuando)}</td><td>${s('rol')} ${s('sala')}</td><td><b>${s('mensaje')}</b><pre>${s('pila')}</pre></td><td>${s('url')}<br>${s('ua')}</td></tr>`;
    });
    const cuerpo = filas.length
      ? `<table><thead><tr><th>Cuándo</th><th>Rol y sala</th><th>Error</th><th>Página y dispositivo</th></tr></thead><tbody>${filas.join('')}</tbody></table>`
      : '<p>Sin errores registrados.</p>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
      + `<title>Estiba - Errores</title><style>body{font:14px sans-serif;margin:1rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;vertical-align:top;text-align:left}pre{white-space:pre-wrap;margin:4px 0 0;font-size:12px}</style></head>`
      + `<body><h1>Errores de los clientes</h1><p>Los últimos ${MOSTRAR}, los más nuevos primero.</p>${cuerpo}</body></html>`);
  }

  /** Atiende la petición si es de este registro; devuelve false si no lo es. */
  return function atender(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
    const fallo = (): void => { if (!res.headersSent) texto(res, 500, 'Error interno'); else res.end(); };
    if (url.pathname === '/api/errores') {
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return true; }
      recibir(req, res).catch(fallo);
      return true;
    }
    if (url.pathname === '/errores') {
      ver(req, res, url.searchParams.get('pin') ?? undefined).catch(fallo);
      return true;
    }
    return false;
  };
}
