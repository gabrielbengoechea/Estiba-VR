import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Reproductor } from './reproductor';

describe('resaltado de la pieza', () => {
  it('es solo contorno: sin relleno y con prueba de profundidad', () => {
    const escena = new THREE.Scene();
    new Reproductor({ escena, viva: { raiz: new THREE.Group() } as never, camara: new THREE.PerspectiveCamera() });
    const lineas = escena.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    expect(lineas).toHaveLength(1);
    expect((lineas[0].material as THREE.LineBasicMaterial).depthTest).toBe(true);
    const rellenos = escena.children.filter((c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.BoxGeometry && (c.material as THREE.MeshBasicMaterial).opacity < 0.5);
    expect(rellenos).toHaveLength(0);
  });
});
