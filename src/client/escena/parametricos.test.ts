import { describe, it, expect } from 'vitest';
import { contarContenedores, bloquePatio } from './parametricos';
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
