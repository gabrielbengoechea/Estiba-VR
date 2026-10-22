interface PedidoConIp {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string | undefined };
}

/**
 * IP del cliente para el límite de intentos de PIN.
 * Detrás del proxy de Render todos llegan con la IP del proxy, así que con
 * ESTIBA_DETRAS_DE_PROXY=1 se toma la primera entrada de X-Forwarded-For.
 * Sin esa variable se ignora la cabecera, porque cualquiera puede falsificarla.
 */
export function ipCliente(req: PedidoConIp, env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.ESTIBA_DETRAS_DE_PROXY === '1') {
    const crudo = req.headers['x-forwarded-for'];
    const valor = Array.isArray(crudo) ? crudo[0] : crudo;
    const primera = valor?.split(',')[0]?.trim();
    if (primera) return primera;
  }
  return req.socket.remoteAddress;
}
