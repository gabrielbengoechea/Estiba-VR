import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DetectorFlanco, Gatillo, HOLD_MS, empaquetarPose, poseMundo } from './logicaXR';

describe('DetectorFlanco', () => {
  it('dispara una vez al pasar de false a true y no repite mientras se mantiene', () => {
    const d = new DetectorFlanco();
    expect(d.actualizar(false)).toBe(false);
    expect(d.actualizar(true)).toBe(true);
    expect(d.actualizar(true)).toBe(false);
    expect(d.actualizar(true)).toBe(false);
    expect(d.actualizar(false)).toBe(false);
    expect(d.actualizar(true)).toBe(true);
  });
  it('si arranca apretado dispara (primer true)', () => {
    expect(new DetectorFlanco().actualizar(true)).toBe(true);
  });
});

describe('Gatillo', () => {
  it('el hold es de 1 segundo', () => expect(HOLD_MS).toBe(1000));
  it('un toque corto resalta al soltar', () => {
    const g = new Gatillo();
    expect(g.actualizar(true, 0)).toBeNull();
    expect(g.actualizar(true, 400)).toBeNull();
    expect(g.actualizar(false, 500)).toBe('resaltar');
    expect(g.actualizar(false, 600)).toBeNull();
  });
  it('mantener 1 s manda mirenAca una sola vez y soltar después no resalta', () => {
    const g = new Gatillo();
    g.actualizar(true, 0);
    expect(g.actualizar(true, 999)).toBeNull();
    expect(g.actualizar(true, 1000)).toBe('mirenAca');
    expect(g.actualizar(true, 1500)).toBeNull();
    expect(g.actualizar(false, 1600)).toBeNull();
  });
  it('se puede repetir después de soltar', () => {
    const g = new Gatillo();
    g.actualizar(true, 0);
    g.actualizar(false, 100);
    g.actualizar(true, 200);
    expect(g.actualizar(false, 300)).toBe('resaltar');
  });
});

describe('empaquetarPose', () => {
  it('copia cabeza y normaliza la dirección del rayo', () => {
    const p = empaquetarPose([1, 2, 3], [0, 0, 0, 1], [4, 5, 6], [0, 0, -5]);
    expect(p.cabeza).toEqual({ pos: [1, 2, 3], quat: [0, 0, 0, 1] });
    expect(p.rayo).toEqual({ origen: [4, 5, 6], dir: [0, 0, -1] });
  });
  it('sin control o con dirección nula manda rayo null', () => {
    expect(empaquetarPose([0, 0, 0], [0, 0, 0, 1], null, null).rayo).toBeNull();
    expect(empaquetarPose([0, 0, 0], [0, 0, 0, 1], [0, 0, 0], [0, 0, 0]).rayo).toBeNull();
  });
});

describe('poseMundo', () => {
  it('compone el dolly (100,0,-40, giro 90° en Y) con la cámara local (0,1.6,0)', () => {
    const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const dolly = new THREE.Matrix4().compose(new THREE.Vector3(100, 0, -40), dq, new THREE.Vector3(1, 1, 1));
    const cam = new THREE.Matrix4().makeTranslation(0, 1.6, 0);
    const r = poseMundo(dolly.elements, cam.elements);
    expect(r.pos[0]).toBeCloseTo(100);
    expect(r.pos[1]).toBeCloseTo(1.6);
    expect(r.pos[2]).toBeCloseTo(-40);
    expect(r.quat[0]).toBeCloseTo(dq.x);
    expect(r.quat[1]).toBeCloseTo(dq.y);
    expect(r.quat[2]).toBeCloseTo(dq.z);
    expect(r.quat[3]).toBeCloseTo(dq.w);
  });
});
