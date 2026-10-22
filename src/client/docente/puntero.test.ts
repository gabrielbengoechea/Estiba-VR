import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { EscenaViva } from '../escena/construirEscena';
import { Puntero } from './puntero';

describe('Puntero.punto', () => {
  it('ignora lo que no es visible (suelo oculto en AR) y no inventa un punto', () => {
    const escena = new THREE.Scene();
    const suelo = new THREE.Mesh(new THREE.BoxGeometry(100, 1, 100), new THREE.MeshBasicMaterial());
    escena.add(suelo);
    escena.updateMatrixWorld(true);
    const p = new Puntero({ raiz: new THREE.Group() } as unknown as EscenaViva, escena);
    expect(p.punto([0, 5, 0], [0, -1, 0])).not.toBeNull();
    suelo.visible = false;
    expect(p.punto([0, 5, 0], [0, -1, 0])).toBeNull();
  });
  it('un ancestro oculto también oculta a sus hijos', () => {
    const escena = new THREE.Scene();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10), new THREE.MeshBasicMaterial()));
    escena.add(g);
    g.visible = false;
    escena.updateMatrixWorld(true);
    const p = new Puntero({ raiz: new THREE.Group() } as unknown as EscenaViva, escena);
    expect(p.punto([0, 5, 0], [0, -1, 0])).toBeNull();
  });
});
