import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Ficha } from '../../shared/tipos';
import type { EstadoSala } from '../../shared/tipos';
import { contenidoPanel, ESCALA_VISOR, GestorFichas, MEDIDAS, posicionAnclada, pxAparentes, TAMANO_VISOR_M } from './fichas';

const f: Ficha = {
  id: 'x', titulo: 'Grúa', texto: 'Un párrafo largo.',
  datos: [1, 2, 3, 4].map((n) => ({ etiqueta: `E${n}`, valor: `V${n}` })), ejemplo: true,
};

describe('contenidoPanel', () => {
  it('visor: título, hasta 3 datos y nota; sin el texto', () => {
    const l = contenidoPanel(f, 'visor');
    expect(l.map((x) => x.tipo)).toEqual(['titulo', 'dato', 'dato', 'dato', 'nota']);
    expect(l.some((x) => x.texto === f.texto)).toBe(false);
    expect(l[1].texto).toBe('E1: V1');
  });
  it('escritorio: incluye el texto entre el título y los datos', () => {
    expect(contenidoPanel(f, 'escritorio').map((x) => x.tipo)).toEqual(['titulo', 'texto', 'dato', 'dato', 'dato', 'nota']);
  });
  it('sin ejemplo no hay nota', () => {
    expect(contenidoPanel({ ...f, ejemplo: false, datos: [] }, 'visor')).toEqual([{ tipo: 'titulo', texto: 'Grúa' }]);
  });
});

describe('tamaño en el visor', () => {
  it('cada línea de datos mide al menos 40 px en un ojo de 390 px de alto', () => {
    expect(pxAparentes(MEDIDAS.visor.texto, ESCALA_VISOR)).toBeGreaterThanOrEqual(40);
    expect(pxAparentes(MEDIDAS.visor.titulo, ESCALA_VISOR)).toBeGreaterThanOrEqual(40);
  });
});

describe('posicionAnclada', () => {
  type V = [number, number, number];
  const caja = { min: [0, 0, 0] as V, max: [10, 30, 10] as V };
  it('una caja a 100 m deja el panel a 20 m del ojo, en el camino hacia la caja', () => {
    const ojo: V = [5, 1.7, 110];
    const p = posicionAnclada(caja, ojo);
    expect(Math.hypot(p[0] - ojo[0], p[2] - ojo[2])).toBeCloseTo(20);
    expect(p[2]).toBeLessThan(110);
    expect(p[1]).toBeCloseTo(2.7);
  });
  it('una grúa cercana deja el panel a 6 m o más y fuera de la caja', () => {
    const ojo: V = [5, 1.7, 14];
    const p = posicionAnclada(caja, ojo);
    expect(Math.hypot(p[0] - ojo[0], p[2] - ojo[2])).toBeGreaterThanOrEqual(6 - 1e-6);
    expect(p[2] <= 0 || p[2] >= 10 || p[0] <= 0 || p[0] >= 10).toBe(true);
  });
  it('con el ojo dentro de la caja el panel queda fuera de la caja', () => {
    const p = posicionAnclada(caja, [1, 1.7, 1]);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(p.every((v, i) => v > caja.min[i] && v < caja.max[i])).toBe(false);
  });
  it('con el ojo justo en el centro no da NaN', () => {
    expect(posicionAnclada(caja, [5, 1.7, 5]).every(Number.isFinite)).toBe(true);
  });
  it('la altura se limita al alto de la caja', () => {
    expect(posicionAnclada({ min: [0, 5, 0], max: [10, 8, 10] }, [5, 1.7, 40])[1]).toBeCloseTo(5);
  });
});

describe('GestorFichas en el visor', () => {
  it('el panel no se traslada aunque la cámara cambie; solo gira', () => {
    const escena = new THREE.Scene();
    const modulo = new THREE.Mesh(new THREE.BoxGeometry(10, 30, 10));
    modulo.position.set(5, 15, 5);
    escena.add(modulo);
    const viva = { objeto: () => modulo, raiz: new THREE.Group() } as never;
    const cam = new THREE.PerspectiveCamera();
    const g = new GestorFichas(escena, viva, cam, 'visor');
    const panel = new THREE.Group();
    panel.userData.alto = 3;
    (g as unknown as { panel: THREE.Group }).panel = panel;
    const e = { resaltado: 'm', escena: { modulos: [{ id: 'm', tipo: 'otro' }] } } as unknown as EstadoSala;
    cam.position.set(5, 1.7, 40);
    g.cuadro(0.016, e);
    const p1 = panel.position.clone();
    const giro1 = panel.rotation.y;
    expect(panel.scale.x).toBeCloseTo(TAMANO_VISOR_M / MEDIDAS.visor.ancho);
    cam.position.set(8, 1.7, 41);
    g.cuadro(0.016, e);
    g.cuadro(0.016, e);
    expect(panel.position.equals(p1)).toBe(true);
    expect(panel.rotation.y).not.toBeCloseTo(giro1);
    expect(panel.rotation.x).toBe(0);
  });

  function montar() {
    const escena = new THREE.Scene();
    const modulo = new THREE.Mesh(new THREE.BoxGeometry(10, 30, 10));
    modulo.position.set(5, 15, 5);
    escena.add(modulo);
    const raiz = new THREE.Group();
    const cam = new THREE.PerspectiveCamera();
    const g = new GestorFichas(escena, { objeto: () => modulo, raiz } as never, cam, 'visor');
    const panel = new THREE.Group();
    panel.userData.alto = 3;
    (g as unknown as { panel: THREE.Group }).panel = panel;
    const estado = (id: string) => ({ resaltado: id, escena: { modulos: [{ id, tipo: 'otro' }] } }) as unknown as EstadoSala;
    return { g, cam, panel, estado, raiz };
  }
  it('se reancla si cambia la pieza resaltada o el ojo se mueve más de 5 m, y no por menos', () => {
    const { g, cam, panel, estado } = montar();
    cam.position.set(5, 1.7, 60);
    g.cuadro(0.016, estado('a'));
    const p1 = panel.position.clone();
    cam.position.set(7, 1.7, 60);
    g.cuadro(0.016, estado('a'));
    expect(panel.position.equals(p1)).toBe(true);
    cam.position.set(40, 1.7, 60);
    g.cuadro(0.016, estado('a'));
    expect(panel.position.equals(p1)).toBe(false);
    const p2 = panel.position.clone();
    g.cuadro(0.016, estado('b'));
    g.cuadro(0.016, estado('b'));
    expect(panel.position.distanceTo(p2)).toBeLessThan(1e-9); // mismo ojo y misma caja: mismo punto
  });
  it('si al principio no hay pieza, ancla cuando aparece', () => {
    const { g, cam, panel, estado } = montar();
    cam.position.set(5, 1.7, 60);
    g.cuadro(0.016, null);
    expect(panel.visible).toBe(true);
    g.cuadro(0.016, estado('a'));
    expect(Math.hypot(panel.position.x - 5, panel.position.z - 60)).toBeCloseTo(20);
  });
  it('el ícono se oculta con el panel en la maqueta AR', () => {
    const { g, cam, estado, raiz } = montar();
    const icono = new THREE.Group();
    (g as unknown as { icono: THREE.Group }).icono = icono;
    cam.position.set(5, 1.7, 60);
    g.cuadro(0.016, estado('a'));
    expect(icono.visible).toBe(true);
    raiz.scale.setScalar(0.1);
    g.cuadro(0.016, estado('a'));
    expect(icono.visible).toBe(false);
  });
});
