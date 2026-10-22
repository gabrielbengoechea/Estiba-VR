// Menú de muñeca del docente: 5 botones 3D pegados al control izquierdo. Se eligen con el rayo del control derecho.
import * as THREE from 'three';
import { Text } from 'troika-three-text';
import fuenteSemi from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url';
import { BOTONES, IND_MAQUETA, IND_MIREN_ACA } from './logicaMenu';

const ANCHO = 0.2;
const ALTO = 0.042;
const SEPARACION = 0.006;
const TAM_TEXTO = 0.019;
const COLOR_BASE = 0x1b2a3d;
const COLOR_ARMADO = 0xd98a1f;
const COLOR_AR = 0x2a7a4b;

export class MenuMuneca {
  readonly grupo = new THREE.Group();
  private botones: THREE.Mesh[] = [];
  private textos: Text[] = [];
  private rayo = new THREE.Raycaster();
  private _o = new THREE.Vector3();
  private _d = new THREE.Vector3();
  private armado = false;
  private enAR = false;

  constructor() {
    BOTONES.forEach((etiqueta, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(ANCHO, ALTO),
        new THREE.MeshBasicMaterial({ color: COLOR_BASE, side: THREE.DoubleSide }),
      );
      m.position.y = ((BOTONES.length - 1) / 2 - i) * (ALTO + SEPARACION);
      const t = new Text();
      t.font = fuenteSemi; // fuente propia: troika no baja nada de un CDN
      t.text = etiqueta;
      t.fontSize = TAM_TEXTO;
      t.color = 0xffffff;
      t.anchorX = 'center';
      t.anchorY = 'middle';
      t.maxWidth = ANCHO - 0.012;
      t.position.z = 0.001;
      t.raycast = () => undefined;
      t.sync();
      m.add(t);
      this.grupo.add(m);
      this.botones.push(m);
      this.textos.push(t);
    });
    // Sobre la mano, inclinado hacia la cara: el plano mira hacia arriba y atrás.
    this.grupo.position.set(0, 0.11, -0.02);
    this.grupo.rotation.x = -1.15;
  }

  /** Índice del botón que golpea el rayo (origen y dirección en el mundo), o null. */
  golpe(origen: THREE.Vector3, dir: THREE.Vector3): number | null {
    this.grupo.updateWorldMatrix(true, true);
    this._o.copy(origen);
    this._d.copy(dir).normalize();
    this.rayo.set(this._o, this._d);
    this.rayo.far = 3;
    const g = this.rayo.intersectObjects(this.botones, false)[0];
    return g ? this.botones.indexOf(g.object as THREE.Mesh) : null;
  }

  ponerArmado(v: boolean): void {
    this.armado = v;
    this.pintar();
  }

  /** En AR el quinto botón pasa a volver a VR. */
  ponerAR(v: boolean): void {
    this.enAR = v;
    const t = this.textos[IND_MAQUETA];
    t.text = v ? 'Volver a VR' : BOTONES[IND_MAQUETA];
    t.sync();
    this.pintar();
  }

  private pintar(): void {
    (this.botones[IND_MIREN_ACA].material as THREE.MeshBasicMaterial).color.setHex(this.armado ? COLOR_ARMADO : COLOR_BASE);
    (this.botones[IND_MAQUETA].material as THREE.MeshBasicMaterial).color.setHex(this.enAR ? COLOR_AR : COLOR_BASE);
  }
}
