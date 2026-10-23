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
  return ipv4Ordenadas(ifaces).map((ip) => `https://${ip}:${puerto}`);
}

const VIRTUAL = /vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback|tailscale|zerotier/i;

function rango(ip: string): number {
  if (/^192\.168\./.test(ip)) return 0;
  if (/^10\./.test(ip)) return 1;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 2;
  return 3;
}

/** IPv4 de la red ordenadas por probabilidad de ser la del Wi-Fi del aula: sin adaptadores virtuales primero, luego 192.168, 10 y 172.16-31. */
export function ipv4Ordenadas(ifaces: Interfaces): string[] {
  const lista: Array<{ ip: string; virtual: boolean; n: number }> = [];
  for (const [nombre, direcciones] of Object.entries(ifaces)) {
    for (const ip of ipv4DeLaRed({ [nombre]: direcciones })) lista.push({ ip, virtual: VIRTUAL.test(nombre), n: lista.length });
  }
  lista.sort((a, b) => Number(a.virtual) - Number(b.virtual) || rango(a.ip) - rango(b.ip) || a.n - b.n);
  return lista.map((x) => x.ip);
}
