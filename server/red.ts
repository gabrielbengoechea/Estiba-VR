interface Interfaz { family: string | number; address: string; internal: boolean }
type Interfaces = Record<string, Array<Interfaz | undefined> | undefined>;

/** IPv4 no internas de la máquina (las que ven los celulares en la misma red). */
export function ipv4DeLaRed(ifaces: Interfaces): string[] {
  const ips: string[] = [];
  for (const lista of Object.values(ifaces)) {
    for (const i of lista ?? []) {
      if (i && (i.family === 'IPv4' || i.family === 4) && !i.internal) ips.push(i.address);
    }
  }
  return ips;
}

export function urlsDeLaRed(puerto: number, ifaces: Interfaces): string[] {
  return ipv4DeLaRed(ifaces).map((ip) => `https://${ip}:${puerto}`);
}
