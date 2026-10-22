// Lógica pura del docente en VR (sin three ni WebXR), para poder probarla sin visor.
import type { Vec3 } from '../../shared/tipos';

/** Mantener el gatillo este tiempo sobre un punto manda «Miren acá». */
export const HOLD_MS = 1000;
/** Índices de `gamepad.buttons` del control derecho del Quest: A y B. */
export const BOTON_A = 4;
export const BOTON_B = 5;

/** Detecta el paso de no apretado a apretado: un botón mantenido no se repite. */
export class DetectorFlanco {
  private previo = false;
  actualizar(apretado: boolean): boolean {
    const flanco = apretado && !this.previo;
    this.previo = apretado;
    return flanco;
  }
}

export type AccionGatillo = 'resaltar' | 'mirenAca' | null;

/** Toque corto → 'resaltar' al soltar; mantenido HOLD_MS → 'mirenAca' (una vez, apenas se cumple). */
export class Gatillo {
  private desde: number | null = null;
  private disparado = false;
  actualizar(apretado: boolean, ahoraMs: number): AccionGatillo {
    if (apretado) {
      if (this.desde === null) { this.desde = ahoraMs; this.disparado = false; return null; }
      if (!this.disparado && ahoraMs - this.desde >= HOLD_MS) { this.disparado = true; return 'mirenAca'; }
      return null;
    }
    const estaba = this.desde !== null;
    const largo = this.disparado;
    this.desde = null;
    this.disparado = false;
    return estaba && !largo ? 'resaltar' : null;
  }
}

export interface PoseXR {
  cabeza: { pos: Vec3; quat: [number, number, number, number] };
  rayo: { origen: Vec3; dir: Vec3 } | null;
}

export function empaquetarPose(
  cabezaPos: Vec3,
  cabezaQuat: [number, number, number, number],
  rayoOrigen: Vec3 | null,
  rayoDir: Vec3 | null,
): PoseXR {
  let rayo: PoseXR['rayo'] = null;
  if (rayoOrigen && rayoDir) {
    const n = Math.hypot(rayoDir[0], rayoDir[1], rayoDir[2]);
    if (n > 1e-9) rayo = { origen: [...rayoOrigen], dir: [rayoDir[0] / n, rayoDir[1] / n, rayoDir[2] / n] };
  }
  return { cabeza: { pos: [...cabezaPos], quat: [...cabezaQuat] }, rayo };
}
