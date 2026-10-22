const VENTANA_MS = 1000;

/** Promedio de cuadros por segundo sobre el último segundo. */
export class MedidorFps {
  private tiempos: number[] = [];

  cuadro(ahoraMs: number): void {
    this.tiempos.push(ahoraMs);
    const limite = ahoraMs - VENTANA_MS;
    let i = 0;
    while (i < this.tiempos.length && this.tiempos[i] <= limite) i++;
    if (i > 0) this.tiempos.splice(0, i);
  }

  fps(): number {
    return this.tiempos.length;
  }
}
