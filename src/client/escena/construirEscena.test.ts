import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { diferenciaEscena, EscenaViva } from './construirEscena';
import type { Escena, Modulo } from '../../shared/tipos';

const a: Modulo = { id: 'a', tipo: 'muelle', celda: [0, 0], rot: 0 };
const b: Modulo = { id: 'b', tipo: 'bloque-patio', celda: [2, 3], rot: 90, params: { filas: 4 } };
const escena = (modulos: Modulo[]): Escena => ({ metrosPorCelda: 10, modulos, vistas: {} });

describe('diferenciaEscena', () => {
  it('de null a dos módulos crea los dos', () => {
    const d = diferenciaEscena(null, escena([a, b]));
    expect(d.crear.map((m) => m.id)).toEqual(['a', 'b']);
    expect(d.actualizar).toEqual([]);
    expect(d.borrar).toEqual([]);
  });
  it('mover un módulo solo lo actualiza a él', () => {
    const d = diferenciaEscena(escena([a, b]), escena([a, { ...b, celda: [5, 3] }]));
    expect(d.actualizar.map((m) => m.id)).toEqual(['b']);
    expect(d.crear).toEqual([]);
    expect(d.borrar).toEqual([]);
  });
  it('cambiar rot o params actualiza', () => {
    expect(diferenciaEscena(escena([a]), escena([{ ...a, rot: 180 }])).actualizar).toHaveLength(1);
    expect(diferenciaEscena(escena([b]), escena([{ ...b, params: { filas: 5 } }])).actualizar).toHaveLength(1);
  });
  it('quitar un módulo lo lista en borrar', () => {
    const d = diferenciaEscena(escena([a, b]), escena([a]));
    expect(d.borrar).toEqual(['b']);
    expect(d.crear).toEqual([]);
    expect(d.actualizar).toEqual([]);
  });
  it('la misma escena no produce cambios', () => {
    const d = diferenciaEscena(escena([a, b]), escena([{ ...a }, { ...b, params: { ...b.params } }]));
    expect(d).toEqual({ crear: [], actualizar: [], borrar: [] });
  });
});

describe('EscenaViva', () => {
  const falso = (fallar: Set<string> = new Set()) => {
    const cat = {} as Record<string, { crear: (p?: Record<string, number>) => Promise<THREE.Object3D> }>;
    for (const t of ['muelle', 'grua-sts', 'buque', 'tractor', 'bloque-patio', 'grua-rtg', 'puerta', 'via', 'tren', 'deposito']) {
      cat[t] = {
        crear: async () => {
          if (fallar.has(t)) throw new Error('glb roto');
          const g = new THREE.Group();
          g.add(new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1));
          return g;
        },
      };
    }
    return cat as never;
  };

  it('al quitar un módulo libera el buffer de sus InstancedMesh', async () => {
    const v = new EscenaViva(falso());
    await v.aplicar(escena([a]));
    const im = v.objeto('a')!.children[0] as THREE.InstancedMesh;
    const dispose = vi.fn();
    im.addEventListener('dispose', dispose);
    await v.aplicar(escena([]));
    expect(dispose).toHaveBeenCalled();
    expect(v.objeto('a')).toBeUndefined();
  });

  it('el tren se coloca 0,4 m más arriba y el resto a y = 0', async () => {
    const v = new EscenaViva(falso());
    await v.aplicar(escena([a, { id: 't', tipo: 'tren', celda: [1, 1], rot: 0 }]));
    expect(v.objeto('t')!.position.y).toBeCloseTo(0.4, 5);
    expect(v.objeto('a')!.position.y).toBe(0);
    await v.aplicar(escena([a, { id: 't', tipo: 'tren', celda: [3, 1], rot: 0 }]));
    expect(v.objeto('t')!.position.y).toBeCloseTo(0.4, 5);
  });

  it('un crear que falla no bloquea al resto y el siguiente aplicar lo reintenta', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fallar = new Set<string>(['bloque-patio']);
    const v = new EscenaViva(falso(fallar));
    await v.aplicar(escena([a, b]));
    expect(v.objeto('a')).toBeDefined();
    expect(v.objeto('b')).toBeUndefined();
    expect(err).toHaveBeenCalled();
    fallar.clear();
    await v.aplicar(escena([a, b]));
    expect(v.objeto('b')).toBeDefined();
    expect(v.raiz.children).toHaveLength(2);
    err.mockRestore();
  });
});
