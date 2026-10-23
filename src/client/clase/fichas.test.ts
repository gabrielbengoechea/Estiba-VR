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
  const caja = { min: [0, 0, 0] as [number, number, number], max: [10, 30, 10] as [number, number, number] };
  it('queda del lado del ojo, afuera de la caja y a 1/3 de su altura', () => {
    const p = posicionAnclada(caja, [5, 1.7, 40]);
    expect(p[2]).toBeGreaterThanOrEqual(12);
    expect(p[1]).toBeCloseTo(10);
    expect(p[0]).toBeCloseTo(5);
  });
  it('del otro lado queda del otro lado', () => {
    expect(posicionAnclada(caja, [5, 1.7, -40])[2]).toBeLessThanOrEqual(-2);
  });
  it('con el ojo justo en el centro no da NaN', () => {
    expect(posicionAnclada(caja, [5, 1.7, 5]).every(Number.isFinite)).toBe(true);
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
    cam.position.set(60, 1.7, -30);
    g.cuadro(0.016, e);
    g.cuadro(0.016, e);
    expect(panel.position.equals(p1)).toBe(true);
    expect(panel.rotation.y).not.toBeCloseTo(giro1);
    expect(panel.rotation.x).toBe(0);
  });
});
