// Maqueta en la mesa (AR): la terminal entera a escala 1:400 sobre una mesa real, vista con passthrough.
// Es la misma escena: solo se escala y se mueve la raíz de la terminal y se esconden agua, cielo, niebla y suelo.
// El proyector sigue mostrando la vista normal (la última pose que mandó el docente): no se le manda nada en AR.
import * as THREE from 'three';
import type { Vec3 } from '../../shared/tipos';
import type { EscenaViva } from '../escena/construirEscena';
import { colocacionMaqueta, ESCALA_MAQUETA } from '../docente/logicaMenu';

export async function soportaAR(): Promise<boolean> {
  try { return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar')); } catch { return false; }
}

export interface Maqueta {
  readonly activa: boolean;
  /** Esconde el ambiente y coloca la terminal frente a la cabeza (posición y dirección en el mundo). */
  entrar(cabezaPos: Vec3, adelante: Vec3): void;
  /** Devuelve la escena a como estaba. */
  salir(): void;
  /** Punto del mundo (sobre la maqueta) → coordenadas reales de la terminal. */
  aTerminal(p: Vec3): Vec3;
}

const OCULTOS = ['agua', 'suelo'];

export function iniciarAR(viva: EscenaViva, escena: THREE.Scene): Maqueta {
  let activa = false;
  let fondo: THREE.Scene['background'] = null;
  let niebla: THREE.Scene['fog'] = null;
  const ocultados: THREE.Object3D[] = [];

  return {
    get activa() { return activa; },
    entrar(cabezaPos, adelante) {
      if (!activa) {
        activa = true;
        fondo = escena.background;
        niebla = escena.fog;
        escena.background = null; // passthrough: transparente
        escena.fog = null;
        for (const n of OCULTOS) {
          const o = escena.getObjectByName(n);
          if (o?.visible) { o.visible = false; ocultados.push(o); }
        }
      }
      const { escala, posicion } = colocacionMaqueta(cabezaPos, adelante);
      viva.raiz.scale.setScalar(escala);
      viva.raiz.position.set(...posicion);
    },
    salir() {
      if (!activa) return;
      activa = false;
      escena.background = fondo;
      escena.fog = niebla;
      for (const o of ocultados) o.visible = true;
      ocultados.length = 0;
      viva.raiz.scale.setScalar(1);
      viva.raiz.position.set(0, 0, 0);
    },
    aTerminal(p) {
      const r = viva.raiz.position;
      return [(p[0] - r.x) / ESCALA_MAQUETA, (p[1] - r.y) / ESCALA_MAQUETA, (p[2] - r.z) / ESCALA_MAQUETA];
    },
  };
}
