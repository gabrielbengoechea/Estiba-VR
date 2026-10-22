interface PedidoConIp {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string | undefined };
}

/**
 * IP del cliente para el límite de intentos de PIN.
 * Detrás del proxy de Render todos llegan con la IP del proxy. Con
 * ESTIBA_DETRAS_DE_PROXY=1 se toma la entrada N-ésima DESDE LA DERECHA de
 * X-Forwarded-For (N = ESTIBA_PROXIES, entero >= 1, por defecto 1): cada proxy
 * AGREGA al final la IP que ve, así que las entradas de la izquierda las puede
 * falsificar cualquier cliente y no sirven. Si hay menos de N entradas o la
 * elegida está vacía, se usa la IP del socket. Sin la variable se ignora la cabecera.
 */
export function ipCliente(req: PedidoConIp, env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.ESTIBA_DETRAS_DE_PROXY === '1') {
    const crudo = req.headers['x-forwarded-for'];
    const valor = Array.isArray(crudo) ? crudo.join(',') : crudo;
    const dado = /^\d+$/.test(env.ESTIBA_PROXIES ?? '') ? Number(env.ESTIBA_PROXIES) : 1;
    const n = dado >= 1 ? dado : 1;
    const partes = (valor ?? '').split(',');
    const elegida = partes[partes.length - n]?.trim();
    if (elegida) return elegida;
  }
  return req.socket.remoteAddress;
}
