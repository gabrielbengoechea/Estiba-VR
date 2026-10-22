export interface MuestraReloj { tc: number; ts: number; tr: number }

/** Desfase servidor − cliente en ms: usa la muestra de menor ida y vuelta, con latencia simétrica. */
export function estimarDesfase(muestras: MuestraReloj[]): number {
  let mejor: MuestraReloj | null = null;
  for (const m of muestras) {
    if (!mejor || m.tr - m.tc < mejor.tr - mejor.tc) mejor = m;
  }
  return mejor ? mejor.ts - (mejor.tc + mejor.tr) / 2 : 0;
}

const PINGS_INICIALES = 5;
const INTERVALO_MS = 10_000;
const MAX_MUESTRAS = 20;

/** Reloj sincronizado con el servidor mediante ping/pong. */
export class Reloj {
  private muestras: MuestraReloj[] = [];
  private desfase = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private enviarPing: (tc: number) => void,
    private ahoraLocal: () => number = () => Date.now(),
  ) {}

  ahoraServidor(): number {
    return this.ahoraLocal() + this.desfase;
  }

  /** Al conectar: 5 pings seguidos y luego uno cada 10 s. */
  iniciar(): void {
    this.detener();
    for (let i = 0; i < PINGS_INICIALES; i++) this.enviarPing(this.ahoraLocal());
    this.timer = setInterval(() => this.enviarPing(this.ahoraLocal()), INTERVALO_MS);
  }

  detener(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  recibirPong(tc: number, ts: number): void {
    this.muestras.push({ tc, ts, tr: this.ahoraLocal() });
    if (this.muestras.length > MAX_MUESTRAS) this.muestras.shift();
    this.desfase = estimarDesfase(this.muestras);
  }
}
