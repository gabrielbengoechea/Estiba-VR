import type { Quat } from '../../shared/tipos';

const GRAD = Math.PI / 180;

function multiplicar(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/**
 * Convierte los ángulos del sensor (grados) en la orientación de la cámara.
 * Misma convención que DeviceOrientationControls de three: Euler YXZ con
 * (beta, alpha, -gamma), luego -90° en X y luego -orientPantalla en Z.
 */
export function orientacionAQuat(alpha: number, beta: number, gamma: number, orientPantalla: number): Quat {
  const x = beta * GRAD;
  const y = alpha * GRAD;
  const z = -gamma * GRAD;
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  const euler: Quat = [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
  const menos90EnX: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  const a = (-orientPantalla * GRAD) / 2;
  const pantalla: Quat = [0, 0, Math.sin(a), Math.cos(a)];
  return multiplicar(multiplicar(euler, menos90EnX), pantalla);
}

/** Rotación alrededor de Y, en radianes. */
export function guiñada(q: Quat): number {
  const [x, y, z, w] = q;
  return Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
}

function anguloEntre(a: Quat, b: Quat): number {
  const punto = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, punto))) / GRAD;
}

/** Verdadero si en los últimos `ventanaMs` ninguna muestra se aparta de la última más que `umbralGrados`. */
export function estaQuieto(muestras: { t: number; q: Quat }[], ventanaMs: number, umbralGrados: number): boolean {
  if (muestras.length === 0) return false;
  const ultima = muestras[muestras.length - 1];
  const desde = ultima.t - ventanaMs;
  if (muestras[0].t > desde) return false; // todavía no hay historia suficiente
  return muestras.every((m) => m.t < desde || anguloEntre(m.q, ultima.q) <= umbralGrados);
}

type PermisoMovimiento = 'concedido' | 'denegado';
type DeviceOrientationConPermiso = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

let permisoConcedido = false;

/** Pide el permiso de movimiento (iOS lo exige; debe llamarse dentro de un toque). Solo se recuerda el «sí». */
export async function pedirPermisoMovimiento(): Promise<PermisoMovimiento> {
  if (permisoConcedido) return 'concedido';
  const evento = typeof DeviceOrientationEvent === 'undefined' ? null : (DeviceOrientationEvent as DeviceOrientationConPermiso);
  if (evento && typeof evento.requestPermission === 'function') {
    try {
      if ((await evento.requestPermission()) !== 'granted') return 'denegado';
    } catch {
      return 'denegado';
    }
  }
  permisoConcedido = true;
  return 'concedido';
}

const IDENTIDAD: Quat = [0, 0, 0, 1];

function anguloPantalla(): number {
  return screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
}

export class OrientacionAlumno {
  private crudo: Quat = IDENTIDAD;
  private desfase = 0;
  private muestras: { t: number; q: Quat }[] = [];
  private recentradoAuto = false;
  private escuchando = false;

  private alMover = (e: DeviceOrientationEvent): void => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return; // escritorio sin giroscopio
    this.crudo = orientacionAQuat(e.alpha, e.beta, e.gamma, anguloPantalla());
    const t = performance.now();
    this.muestras.push({ t, q: this.crudo });
    while (this.muestras.length > 1 && t - this.muestras[0].t > 4000) this.muestras.shift();
    if (!this.recentradoAuto && estaQuieto(this.muestras, 2000, 3)) {
      this.recentradoAuto = true;
      this.recentrar();
    }
  };

  async pedirPermiso(): Promise<PermisoMovimiento> {
    const permiso = await pedirPermisoMovimiento();
    if (permiso === 'concedido' && !this.escuchando && typeof window !== 'undefined') {
      this.escuchando = true;
      window.addEventListener('deviceorientation', this.alMover);
    }
    return permiso;
  }

  /** Orientación de la cabeza con el desfase de guiñada de `recentrar()` aplicado. */
  quat(): Quat {
    const a = -this.desfase / 2;
    return multiplicar([0, Math.sin(a), 0, Math.cos(a)], this.crudo);
  }

  /** Lo que mira ahora el alumno pasa a ser «de frente». */
  recentrar(): void {
    this.desfase = guiñada(this.crudo);
  }
}
