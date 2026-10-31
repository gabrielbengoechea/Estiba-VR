import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { MEDIDAS } from '../../shared/apilado';
import { fijarPaquete } from '../escena/kit';
import { ORIGEN_PRACTICA, PatioPractica } from './practica';

/** Paquetes de mentira con los nombres y medidas del kit (sin texturas): alcanzan para la lógica y los rayos. */
function caja(nombre: string, l: number, h: number, w: number, y0 = 0): THREE.Mesh {
  const g = new THREE.BoxGeometry(l, h, w);
  g.translate(0, y0 + h / 2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
  m.name = nombre;
  return m;
}

function nodoEn(nombre: string, x: number, y: number, z = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = nombre;
  o.position.set(x, y, z);
  return o;
}

beforeAll(() => {
  const cont = new THREE.Group();
  for (const t of ['20', '40', '40HC'] as const) {
    const r = new THREE.Group();
    r.name = `Container_${t}`;
    const m = MEDIDAS[t];
    r.add(caja(`Container_${t}_LOD0`, m.largo, m.alto, m.ancho), caja(`Container_${t}_LOD1`, m.largo, m.alto, m.ancho), caja(`UCX_Container_${t}`, m.largo, m.alto, m.ancho));
    cont.add(r);
  }
  fijarPaquete('contenedores', cont);
  const ind = new THREE.Group();
  const tractor = new THREE.Group();
  tractor.name = 'Truck_Tractor';
  tractor.add(caja('Truck_Tractor_Blanco_LOD0', 7, 3.8, 2.5), caja('Truck_Tractor_Rojo_LOD0', 7, 3.8, 2.5), nodoEn('Hitch', 0.3, 1.25));
  const trailer = new THREE.Group();
  trailer.name = 'Trailer_Skeletal40';
  trailer.add(caja('Trailer_Skeletal40_LOD0', 12.4, 1.38, 2.5), nodoEn('Mount_40', -5.1, 1.38), nodoEn('Mount_20A', -2.03, 1.38), nodoEn('Mount_20B', -8.28, 1.38));
  ind.add(tractor, trailer);
  fijarPaquete('industrial', ind);
});

/** Rayo vertical que baja sobre (x, z). */
const desde = (x: number, z: number) => new THREE.Ray(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));

describe('práctica de estiba', () => {
  it('arma el patio con 11 contenedores en sus celdas y las cajas de colisión', async () => {
    const p = await new PatioPractica().cargar();
    const e = p.estado();
    expect(e.pilas.find((x) => x.celda === 'A1')!.ids).toEqual(['P01', 'P02', 'P03']);
    expect(Object.keys(e.poses)).toHaveLength(11);
    const inst = p.colisiones.children[0] as THREE.InstancedMesh;
    expect(inst.count).toBe(11);
  });

  it('toma el de arriba, lo lleva a otra celda y lo deja en la pose exacta', async () => {
    const p = await new PatioPractica().cargar();
    let cambios = 0;
    p.alCambiar = () => cambios++;
    const a1 = p.apilado.celdas.get('A1')!;
    expect(p.apuntado(desde(a1.x, a1.z))).toBe('P03');
    expect(p.tomar('P03')).toBe(true);
    const c1 = p.apilado.celdas.get('C1')!;
    p.mover(desde(c1.x + 0.7, c1.z - 0.4), 0);
    expect(p.estado().candidato).toMatchObject({ celda: 'C1', ok: true, nivel: 0 });
    const aviso = p.soltar()!;
    expect(aviso.ok).toBe(true);
    // P03 estaba con las puertas al revés: conserva el sentido
    expect(p.apilado.pose('P03')).toEqual({ x: c1.x, y: 0, z: c1.z, giro: Math.PI });
    expect(cambios).toBeGreaterThanOrEqual(2);
    // la animación termina exactamente en la pose de Apilado
    for (let i = 0; i < 400; i++) p.actualizar(1 / 60);
    const obj = p.raiz.getObjectByName('contenedor-P03')!;
    expect(obj.position.toArray()).toEqual([c1.x, 0, c1.z]);
  });

  it('no deja tomar uno que tiene otro encima', async () => {
    const p = await new PatioPractica().cargar();
    const avisos: string[] = [];
    p.avisar = (a) => avisos.push(a.texto);
    expect(p.tomar('P01')).toBe(false);
    expect(avisos[0]).toMatch(/encima/);
  });

  it("un 40' sobre una pila de 20' sueltos no encastra y vuelve a su lugar", async () => {
    const p = await new PatioPractica().cargar();
    const antes = p.apilado.pose('P10');
    p.tomar('P10');
    const b1 = p.apilado.celdas.get('B1')!; // dos 20' en la mitad A, nada en la B
    p.mover(desde(b1.x, b1.z), 0);
    expect(p.estado().candidato).toMatchObject({ celda: 'B1', ok: false });
    const a = p.soltar()!;
    expect(a.ok).toBe(false);
    expect(a.texto).toMatch(/Volvió a su lugar/);
    expect(p.apilado.pose('P10')).toEqual(antes);
  });

  it('un 20\' en la cama del camión queda en su montaje', async () => {
    const p = await new PatioPractica().cargar();
    expect(p.tomar('P08')).toBe(true); // 20' de arriba de B1
    const cam = p.apilado.celdas.get('CAM1')!;
    const mA = cam.x + cam.mitades!.A;
    p.mover(desde(mA + 0.3, cam.z), 0);
    expect(p.estado().candidato).toMatchObject({ celda: 'CAM1', mitad: 'A', ok: true });
    p.soltar();
    expect(p.apilado.pose('P08')).toMatchObject({ x: mA, y: cam.y, z: cam.z });
    expect(cam.y).toBeCloseTo(1.38, 6);
  });

  it('reiniciar vuelve todo a como estaba', async () => {
    const p = await new PatioPractica().cargar();
    const antes = p.estado().poses;
    p.tomar('P03');
    const c1 = p.apilado.celdas.get('C1')!;
    p.mover(desde(c1.x, c1.z), 0);
    p.soltar();
    p.reiniciar();
    expect(p.estado().poses).toEqual(antes);
    expect(ORIGEN_PRACTICA.x).toBeGreaterThan(230);
  });
});
