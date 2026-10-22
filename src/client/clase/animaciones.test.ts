import { describe, expect, it } from 'vitest';
import type { Escena } from '../../shared/tipos';
import { animaciones, enganchePartes, posicionEn, segundosDesde, type Tramo } from './animaciones';

const dos: Tramo[] = [
  { desde: [0, 0, 0], hasta: [10, 0, 0], duracion: 10 },
  { desde: [10, 0, 0], hasta: [10, 20, 0], duracion: 10 },
];

describe('posicionEn', () => {
  it('t = 0 es el inicio del primer tramo', () => {
    const r = posicionEn(dos, 0);
    expect(r.pos).toEqual([0, 0, 0]);
    expect(r.tramo).toBe(0);
    expect(r.terminada).toBe(false);
  });
  it('a mitad de tramo está en el punto medio (smoothstep es simétrico)', () => {
    expect(posicionEn(dos, 5).pos).toEqual([5, 0, 0]);
  });
  it('suaviza: a un cuarto del tramo va menos de un cuarto del camino', () => {
    expect(posicionEn(dos, 2.5).pos[0]).toBeLessThan(2.5);
    expect(posicionEn(dos, 7.5).pos[0]).toBeGreaterThan(7.5);
  });
  it('t = 10 es el inicio del segundo tramo', () => {
    const r = posicionEn(dos, 10);
    expect(r.pos).toEqual([10, 0, 0]);
    expect(r.tramo).toBe(1);
  });
  it('después del final queda en el último punto y termina', () => {
    const r = posicionEn(dos, 25);
    expect(r.pos).toEqual([10, 20, 0]);
    expect(r.tramo).toBe(1);
    expect(r.terminada).toBe(true);
  });
  it('t negativo queda al inicio', () => {
    const r = posicionEn(dos, -3);
    expect(r.pos).toEqual([0, 0, 0]);
    expect(r.terminada).toBe(false);
  });
  it('sin tramos termina en el origen', () => {
    expect(posicionEn([], 1)).toEqual({ pos: [0, 0, 0], tramo: 0, terminada: true, giro: 0 });
  });
  it('un tramo de duración 0 se salta', () => {
    const t: Tramo[] = [{ desde: [0, 0, 0], hasta: [1, 0, 0], duracion: 0 }, { desde: [1, 0, 0], hasta: [3, 0, 0], duracion: 4 }];
    expect(posicionEn(t, 0).pos).toEqual([1, 0, 0]);
  });
  it('el giro se interpola entre tramos y se mantiene si no se indica', () => {
    const t: Tramo[] = [
      { desde: [0, 0, 0], hasta: [1, 0, 0], duracion: 2, giro: 2 },
      { desde: [1, 0, 0], hasta: [2, 0, 0], duracion: 2 },
    ];
    expect(posicionEn(t, 1).giro).toBeCloseTo(1);
    expect(posicionEn(t, 3).giro).toBeCloseTo(2);
  });
  it('reutiliza el objeto de salida si se le pasa', () => {
    const fuera = { pos: [9, 9, 9] as [number, number, number], tramo: 7, terminada: true, giro: 1 };
    const r = posicionEn(dos, 5, fuera);
    expect(r).toBe(fuera);
    expect(fuera.pos).toEqual([5, 0, 0]);
    expect(fuera.terminada).toBe(false);
  });
});

describe('alumno que entra tarde', () => {
  it('a los 12 s ve lo mismo que quien está desde el principio', () => {
    const inicio = 1_000_000;
    const ahoraServidor = () => inicio + 12_000;
    const tarde = posicionEn(dos, segundosDesde(inicio, ahoraServidor()));
    // El que estuvo desde el principio llegó a los 12 s pasando por todos los cuadros intermedios.
    let previo = posicionEn(dos, 0);
    for (let ms = 0; ms <= 12_000; ms += 16) previo = posicionEn(dos, segundosDesde(inicio, inicio + ms));
    const exacto = posicionEn(dos, segundosDesde(inicio, inicio + 12_000));
    expect(tarde).toEqual(exacto);
    expect(tarde.pos).toEqual(posicionEn(dos, 12).pos);
    expect(previo.tramo).toBe(tarde.tramo);
  });
  it('segundosDesde pasa de ms a s', () => {
    expect(segundosDesde(500, 12_500)).toBe(12);
  });
});

describe('enganchePartes', () => {
  const t: Tramo[] = [
    { desde: [0, 0, 0], hasta: [0, 0, 0], duracion: 4 },
    { desde: [0, 0, 0], hasta: [10, 0, 0], duracion: 10, enganche: 'tractor' },
    { desde: [10, 0, 0], hasta: [10, 0, 0], duracion: 4 },
  ];
  it('entra suavemente durante el tramo anterior, acompaña y sale durante el siguiente', () => {
    const o = { k: 0, pos: [0, 0, 0] as [number, number, number], giro: 0 };
    expect(enganchePartes(t, 'tractor', 0, o).k).toBe(0);
    expect(enganchePartes(t, 'tractor', 2, o).k).toBeCloseTo(0.5);
    expect(enganchePartes(t, 'tractor', 4, o).k).toBe(1);
    expect(enganchePartes(t, 'tractor', 9, o).pos).toEqual([5, 0, 0]);
    expect(enganchePartes(t, 'tractor', 16, o).k).toBeCloseTo(0.5);
    expect(enganchePartes(t, 'tractor', 16, o).pos).toEqual([10, 0, 0]);
    expect(enganchePartes(t, 'tractor', 18, o).k).toBe(0);
  });
  it('otro tipo de enganche no se ve afectado', () => {
    const o = { k: 0, pos: [0, 0, 0] as [number, number, number], giro: 0 };
    expect(enganchePartes(t, 'spreader-sts', 9, o).k).toBe(0);
  });
});

describe('animaciones', () => {
  const escena: Escena = {
    metrosPorCelda: 10,
    vistas: {},
    modulos: [
      { id: 'buque-1', tipo: 'buque', celda: [6, 2], rot: 0 },
      { id: 'sts-2', tipo: 'grua-sts', celda: [17, 0], rot: 0 },
      { id: 'tractor-1', tipo: 'tractor', celda: [14, -1], rot: 0 },
      { id: 'tractor-2', tipo: 'tractor', celda: [14, -4], rot: 0 },
      { id: 'patio-a', tipo: 'bloque-patio', celda: [8, -5], rot: 0 },
      { id: 'rtg-1', tipo: 'grua-rtg', celda: [12, -6], rot: 0 },
      { id: 'puerta-1', tipo: 'puerta', celda: [30, -10], rot: 0 },
      { id: 'tren-1', tipo: 'tren', celda: [27, -14], rot: 0 },
    ],
  };
  const total = (ts: Tramo[]) => ts.reduce((s, x) => s + x.duracion, 0);

  it('descarga-ciclo dura unos 40 s, es continua y usa los tres enganches', () => {
    const ts = animaciones['descarga-ciclo'](escena);
    expect(total(ts)).toBeGreaterThanOrEqual(36);
    expect(total(ts)).toBeLessThanOrEqual(44);
    for (let i = 1; i < ts.length; i++) expect(ts[i].desde).toEqual(ts[i - 1].hasta);
    const tipos = new Set(ts.map((x) => x.enganche));
    expect(tipos).toContain('spreader-sts');
    expect(tipos).toContain('tractor');
    expect(tipos).toContain('spreader-rtg');
  });
  it('descarga-ciclo arranca bajo la grúa sts-2 y termina en el bloque de patio', () => {
    const ts = animaciones['descarga-ciclo'](escena);
    expect(ts[0].desde[0]).toBeCloseTo(170, 0);
    const fin = ts[ts.length - 1].hasta;
    expect(fin[0]).toBeGreaterThan(80);
    expect(fin[0]).toBeLessThan(211);
    expect(fin[2]).toBeLessThan(-50);
    expect(fin[2]).toBeGreaterThan(-67);
  });
  it('las cuatro animaciones existen y no son vacías', () => {
    for (const id of ['atraque', 'descarga-ciclo', 'recorrido', 'salida'] as const) {
      expect(animaciones[id](escena).length).toBeGreaterThan(0);
    }
  });
  it('si falta un módulo no lanza', () => {
    const vacia: Escena = { metrosPorCelda: 10, vistas: {}, modulos: [] };
    for (const id of ['atraque', 'descarga-ciclo', 'recorrido', 'salida'] as const) {
      expect(() => animaciones[id](vacia)).not.toThrow();
    }
  });
});
