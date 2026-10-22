import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { crearAmbiente, habilitarSombras, moduloDe } from './ambiente';

describe('crearAmbiente', () => {
  it('agrega agua, suelo, luces y niebla', () => {
    const e = new THREE.Scene();
    crearAmbiente(e);
    expect(e.getObjectByName('agua')).toBeDefined();
    expect(e.getObjectByName('suelo')).toBeDefined();
    expect(e.children.some((o) => o instanceof THREE.DirectionalLight && o.castShadow)).toBe(true);
    expect(e.fog).not.toBeNull();
  });
});

describe('moduloDe', () => {
  it('sube por los padres hasta el módulo', () => {
    const raiz = new THREE.Group();
    raiz.userData.moduloId = 'sts-1';
    const hijo = new THREE.Group();
    const malla = new THREE.Mesh();
    hijo.add(malla);
    raiz.add(hijo);
    expect(moduloDe(malla)).toBe('sts-1');
    expect(moduloDe(new THREE.Mesh())).toBeNull();
    expect(moduloDe(null)).toBeNull();
  });
});

describe('habilitarSombras', () => {
  it('activa proyectar y recibir en todas las mallas', () => {
    const g = new THREE.Group();
    const m = new THREE.Mesh();
    const sub = new THREE.Group();
    sub.add(m);
    g.add(sub);
    habilitarSombras(g);
    expect(m.castShadow && m.receiveShadow).toBe(true);
  });
});
