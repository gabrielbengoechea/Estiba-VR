// Puntero del docente: lanza un rayo desde el control contra los módulos de la escena.
import * as THREE from 'three';
import type { Vec3 } from '../../shared/tipos';
import { moduloDe } from '../escena/ambiente';
import type { EscenaViva } from '../escena/construirEscena';

export class Puntero {
  private rayo = new THREE.Raycaster();

  constructor(private viva: EscenaViva, private escena: THREE.Scene) {
    this.rayo.far = 3000;
  }

  private lanzar(origen: Vec3, dir: Vec3, raiz: THREE.Object3D) {
    this.rayo.set(new THREE.Vector3(...origen), new THREE.Vector3(...dir).normalize());
    // Raycaster no mira `visible`: lo oculto (agua y suelo en AR) no se puede golpear.
    return this.rayo.intersectObjects(raiz.children, true).find((h) => visible(h.object));
  }

  /** Módulo que golpea el rayo (o null si apunta al vacío, al agua o al suelo). */
  intersectar(origen: Vec3, dir: Vec3): { moduloId: string; punto: Vec3 } | null {
    const g = this.lanzar(origen, dir, this.viva.raiz);
    const id = g ? moduloDe(g.object) : null;
    return g && id ? { moduloId: id, punto: [g.point.x, g.point.y, g.point.z] } : null;
  }

  /** Primer punto de cualquier superficie de la escena (para «Miren acá»). Las ayudas visuales no se pueden golpear. */
  punto(origen: Vec3, dir: Vec3): Vec3 | null {
    const g = this.lanzar(origen, dir, this.escena);
    return g ? [g.point.x, g.point.y, g.point.z] : null;
  }
}

function visible(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}
