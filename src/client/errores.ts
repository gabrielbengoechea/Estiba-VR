import type { Rol } from '../shared/tipos';

const MAX_CAMPO = 2000;
const MAX_POR_MINUTO = 10;

interface Destino {
  addEventListener(tipo: string, f: (e: never) => void): void;
}

export interface DepsErrores {
  destino?: Destino;
  enviar?: (cuerpo: string) => void;
  ahora?: () => number;
  url?: string;
  ua?: string;
}

const recortar = (t: unknown): string => String(t ?? '').slice(0, MAX_CAMPO);

function enviarAlServidor(cuerpo: string): void {
  try {
    void fetch('/api/errores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo, keepalive: true })
      .catch(() => { /* si el aviso falla, no hay nada más que hacer */ });
  } catch { /* idem */ }
}

/**
 * Manda los errores no atrapados de esta página al servidor de Estiba (/api/errores).
 * Máximo 10 por minuto por página; nunca lanza ni muestra nada al usuario.
 */
export function instalarRegistroErrores(rol: Rol, sala: string, deps: DepsErrores = {}): void {
  const destino = deps.destino ?? window;
  const enviar = deps.enviar ?? enviarAlServidor;
  const ahora = deps.ahora ?? Date.now;
  let marcas: number[] = [];

  const informar = (mensaje: unknown, pila: unknown): void => {
    try {
      const t = ahora();
      marcas = marcas.filter((m) => t - m < 60_000);
      if (marcas.length >= MAX_POR_MINUTO) return;
      marcas.push(t);
      enviar(JSON.stringify({
        rol: recortar(rol), sala: recortar(sala), mensaje: recortar(mensaje), pila: recortar(pila),
        url: recortar(deps.url ?? location.href), ua: recortar(deps.ua ?? navigator.userAgent), momento: t,
      }));
    } catch { /* informar nunca debe causar otro error */ }
  };

  destino.addEventListener('error', (e: { message?: unknown; error?: { stack?: unknown } }) => {
    informar(e.message, e.error?.stack);
  });
  destino.addEventListener('unhandledrejection', (e: { reason?: { message?: unknown; stack?: unknown } | string }) => {
    const r = e.reason;
    if (r && typeof r === 'object') informar(r.message ?? r, r.stack);
    else informar(r, '');
  });
}
