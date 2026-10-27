/**
 * Dirección del servidor de Estiba cuando la página se sirve desde otro lado (p. ej. Vercel), sin barra final.
 * Viene de `VITE_ESTIBA_SERVIDOR` al compilar; vacía (o inválida) significa el mismo origen que la página.
 */
export function baseServidor(valor: string | undefined = import.meta.env.VITE_ESTIBA_SERVIDOR): string {
  const v = valor?.trim();
  if (!v) return '';
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

/** URL del WebSocket para una base de servidor dada (https → wss). */
export function urlWebSocket(base: string): string {
  return `${base.replace(/^http/, 'ws')}/ws`;
}
