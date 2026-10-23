import WebSocket from 'ws';
import { pathToFileURL } from 'node:url';

export interface OpcionesCarga {
  url: string;
  sala: string;
  pin: string;
  alumnos: number;
  segundos: number;
  /** Segundos entre un comando de paso y el siguiente. */
  pasosCada: number;
}

export interface Resultado {
  conectados: number;
  desconexiones: number;
  latenciaP50: number;
  latenciaP95: number;
  estadosPerdidos: number;
}

type Rol = 'docente' | 'alumno';

const POSES_POR_SEGUNDO = 20;
const ESPERA_FINAL_MS = 400;
const ESPERA_CONEXION_MS = 10_000;

interface EstadoMin { version: number; paso: number; pasos: number }

function leerEstado(datos: WebSocket.RawData): EstadoMin | null {
  try {
    const m = JSON.parse(datos.toString());
    if (m?.t !== 'estado') return null;
    return { version: m.e.version, paso: m.e.paso, pasos: m.e.clase.pasos.length };
  } catch { return null; }
}

function percentil(orden: number[], p: number): number {
  if (orden.length === 0) return 0;
  return orden[Math.min(orden.length - 1, Math.ceil(p * orden.length) - 1)];
}

const dormir = (ms: number) => new Promise<void>((ok) => { setTimeout(ok, ms); });

export async function ejecutarCarga(o: OpcionesCarga): Promise<Resultado> {
  const wss = o.url.startsWith('wss:');
  let terminando = false;
  let desconexiones = 0;
  const todos: WebSocket[] = [];
  const latencias: number[] = [];
  const envio = new Map<number, number>(); // versión esperada -> instante de envío

  const conectar = (rol: Rol, alRecibir: (e: EstadoMin) => void): Promise<WebSocket | null> =>
    new Promise((ok) => {
      const ws = new WebSocket(o.url, wss ? { rejectUnauthorized: false } : undefined);
      todos.push(ws);
      let listo = false;
      const fin = setTimeout(() => ok(null), ESPERA_CONEXION_MS);
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'unirse', sala: o.sala, rol, ...(rol === 'docente' ? { pin: o.pin } : {}) }));
      });
      ws.on('message', (d) => {
        const e = leerEstado(d);
        if (!e) return;
        alRecibir(e);
        if (!listo) { listo = true; clearTimeout(fin); ok(ws); }
      });
      ws.on('error', () => { /* el cierre se cuenta en 'close' */ });
      ws.on('close', () => {
        if (!terminando) desconexiones++;
        if (!listo) { clearTimeout(fin); ok(null); }
      });
    });

  const cerrarTodo = () => { terminando = true; for (const w of todos) w.terminate(); };

  // Docente: lleva la cuenta de la versión y del paso que ve.
  const docente = { version: -1, paso: 0, pasos: 0, pendiente: false };
  const ws0 = await conectar('docente', (e) => {
    docente.version = e.version; docente.paso = e.paso; docente.pasos = e.pasos; docente.pendiente = false;
  });
  if (!ws0) { cerrarTodo(); throw new Error('El docente no pudo entrar a la sala (¿URL o PIN incorrectos?)'); }
  if (docente.pasos < 2) { cerrarTodo(); throw new Error('La sala necesita al menos 2 pasos para la prueba'); }

  const vistos: number[] = new Array(o.alumnos).fill(-1);
  const alumnosWs = await Promise.all(Array.from({ length: o.alumnos }, (_, i) =>
    conectar('alumno', (e) => {
      vistos[i] = e.version;
      const t0 = envio.get(e.version);
      if (t0 !== undefined) latencias.push(performance.now() - t0);
    })));
  const conectados = alumnosWs.filter((w) => w !== null).length;

  const poses = setInterval(() => {
    if (ws0.readyState !== WebSocket.OPEN) return;
    ws0.send(JSON.stringify({
      t: 'pose', cabeza: { pos: [Math.random(), 1.7, 0], quat: [0, 0, 0, 1] }, rayo: null,
    }));
  }, 1000 / POSES_POR_SEGUNDO);

  // Alterna siguiente/anterior según el paso visto, para que cada comando tenga efecto.
  const pasos = setInterval(() => {
    if (ws0.readyState !== WebSocket.OPEN || docente.pendiente) return;
    const t = docente.paso + 1 < docente.pasos ? 'siguiente' : 'anterior';
    docente.pendiente = true;
    envio.set(docente.version + 1, performance.now());
    ws0.send(JSON.stringify({ t: 'comando', c: { t } }));
  }, Math.max(10, o.pasosCada * 1000));

  await dormir(o.segundos * 1000);
  clearInterval(pasos);
  clearInterval(poses);
  await dormir(ESPERA_FINAL_MS);

  const orden = latencias.slice().sort((a, b) => a - b);
  const resultado: Resultado = {
    conectados,
    desconexiones,
    latenciaP50: Math.round(percentil(orden, 0.5)),
    latenciaP95: Math.round(percentil(orden, 0.95)),
    // Alumnos que nunca vieron la última versión que el docente observó.
    estadosPerdidos: vistos.filter((v) => v < docente.version).length,
  };
  cerrarTodo();
  return resultado;
}

function leerArgs(argv: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const sig = argv[i + 1];
    r[argv[i].slice(2)] = sig === undefined || sig.startsWith('--') ? 'true' : (i++, sig);
  }
  return r;
}

async function main(): Promise<void> {
  const a = leerArgs(process.argv.slice(2));
  const opts: OpcionesCarga = {
    url: a.url ?? 'ws://localhost:8080/ws',
    sala: a.sala ?? '1234',
    pin: a.pin ?? process.env.ESTIBA_PIN ?? '1234',
    alumnos: Number(a.alumnos ?? 30),
    segundos: Number(a.segundos ?? 60),
    pasosCada: Number(a.pasos ?? 2),
  };
  console.log(`Prueba de carga: ${opts.alumnos} alumnos, ${opts.segundos} s, ${opts.url}`);
  const r = await ejecutarCarga(opts);
  console.log(JSON.stringify(r, null, 2));
  const mal = r.desconexiones > 0 || r.estadosPerdidos > 0 || r.latenciaP95 > 500 || r.conectados < opts.alumnos;
  console.log(mal ? 'RESULTADO: NO APTO' : 'RESULTADO: OK');
  process.exit(mal ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
