import { describe, it, expect } from 'vitest';
import { contarContenedores, bloquePatio, muelle } from './parametricos';
import * as THREE from 'three';

describe('contarContenedores', () => {
  it('ocupación total llena filas × bahías × altura', () => {
    expect(contarContenedores({ filas: 6, bahias: 20, altura: 4, ocupacion: 1, semilla: 1 })).toBe(480);
  });
  it('ocupación 0 no genera contenedores', () => {
    expect(contarContenedores({ filas: 6, bahias: 20, altura: 4, ocupacion: 0, semilla: 1 })).toBe(0);
  });
  it('misma semilla, mismo resultado', () => {
    const p = { filas: 6, bahias: 20, altura: 4, ocupacion: 0.7, semilla: 7 };
    expect(contarContenedores(p)).toBe(contarContenedores({ ...p }));
  });
  it('usa los valores por defecto', () => {
    expect(contarContenedores({})).toBe(contarContenedores({ filas: 6, bahias: 20, altura: 4, ocupacion: 0.7, semilla: 7 }));
  });
  it('la geometría coincide con el conteo', () => {
    const p = { filas: 3, bahias: 5, altura: 3, ocupacion: 0.6, semilla: 3 };
    let n = 0;
    bloquePatio(p).traverse((o) => { if (o instanceof THREE.InstancedMesh && o.userData.contenedores) n += o.count; });
    expect(n).toBe(contarContenedores(p));
  });
});

describe('huella y geometría coinciden', () => {
  for (const m of [5, 10]) {
    it(`muelle y vía con ${m} m por celda`, async () => {
      const { catalogo } = await import('./catalogo');
      for (const tipo of ['muelle', 'via'] as const) {
        const obj = await catalogo[tipo].crear(undefined, m);
        const caja = new THREE.Box3().setFromObject(obj);
        const [c, f] = catalogo[tipo].huella(undefined, m);
        expect(caja.max.x - caja.min.x).toBeCloseTo(c * m, 5);
        const prof = caja.max.z - caja.min.z;
        expect(prof).toBeLessThanOrEqual(f * m + 1e-6);
        if (tipo === 'muelle') expect(prof).toBeCloseTo(f * m, 5);
        else expect(prof).toBeGreaterThan((f - 1) * m);
      }
    });
  }
});

describe('sin superficies coplanares', () => {
  it('la defensa del cantil no comparte el plano superior de la losa', () => {
    const topes: { zMin: number; zMax: number; y: number }[] = [];
    muelle().traverse((o) => {
      if (o instanceof THREE.Mesh && o.scale.y >= 1.4) {
        topes.push({ zMin: o.position.z - o.scale.z / 2, zMax: o.position.z + o.scale.z / 2, y: o.position.y + o.scale.y / 2 });
      }
    });
    expect(topes.length).toBe(2);
    const [a, b] = topes;
    const solapan = Math.min(a.zMax, b.zMax) - Math.max(a.zMin, b.zMin) > 1e-6;
    const mismoPlano = Math.abs(a.y - b.y) < 0.02;
    expect(solapan && mismoPlano).toBe(false);
  });
  it('las líneas pintadas usan polygonOffset', () => {
    const g = bloquePatio({ filas: 2, bahias: 2 });
    const lineas = g.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh && !o.userData.contenedores);
    expect(lineas.length).toBe(2);
    for (const l of lineas) {
      const m = l.material as THREE.MeshStandardMaterial;
      expect(m.polygonOffset).toBe(true);
      expect(m.polygonOffsetFactor).toBe(-1);
    }
  });
});
