// Latido del servidor: cada tanto manda un ping de protocolo a cada conexión y corta (terminate) la que no
// contestó con un pong ni mandó nada desde el ping anterior. Así un celular que se quedó sin red (o se apagó)
// no queda ocupando un lugar de la sala: el cierre dispara el `close` de la conexión y `Salas` la quita.
export const LATIDO_MS = 15_000;

export interface ClienteLatido {
  ping(): void;
  terminate(): void;
  on(evento: 'pong' | 'message', fn: () => void): unknown;
}

export interface ServidorLatido {
  clients: Iterable<ClienteLatido>;
  on(evento: 'connection', fn: (ws: ClienteLatido) => void): unknown;
  on(evento: 'close', fn: () => void): unknown;
}

/** Empieza a latir; devuelve la función que lo detiene (también se detiene solo al cerrar el servidor). */
export function iniciarLatido(wss: ServidorLatido, cadaMs: number = LATIDO_MS): () => void {
  const vivos = new WeakSet<ClienteLatido>();
  wss.on('connection', (ws) => {
    vivos.add(ws);
    ws.on('pong', () => vivos.add(ws));
    ws.on('message', () => vivos.add(ws));
  });
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!vivos.has(ws)) { ws.terminate(); continue; }
      vivos.delete(ws);
      try { ws.ping(); } catch { /* el socket ya se está cerrando */ }
    }
  }, cadaMs);
  timer.unref?.();
  const detener = (): void => clearInterval(timer);
  wss.on('close', detener);
  return detener;
}
