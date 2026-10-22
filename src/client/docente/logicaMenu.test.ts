import { describe, expect, it } from 'vitest';
import {
  ALTURA_MAQUETA, BOTONES, CENTRO_TERMINAL, DISTANCIA_MAQUETA, ESCALA_MAQUETA,
  accionDeBoton, colocacionMaqueta, comandoTraer, enrutarGatillo,
} from './logicaMenu';

const ctx = {
  cabeza: { pos: [10, 1.6, 5] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number] },
  animacion: 'a1' as string | undefined,
  enAR: false,
};

describe('botones', () => {
  it('son 5, en el orden pedido', () => {
    expect(BOTONES).toEqual(['Traer a todos acá', 'Miren acá', 'Reproducir animación', 'Recentrar a todos', 'Maqueta en la mesa']);
  });
});

describe('accionDeBoton', () => {
  it('0 trae a todos a la cabeza del docente', () => {
    expect(accionDeBoton(0, ctx)).toEqual({ tipo: 'comando', c: { t: 'traer', pos: [10, 1.7, 5], mira: [10, 1.7, -5] } });
  });
  it('1 arma «Miren acá»', () => expect(accionDeBoton(1, ctx)).toEqual({ tipo: 'armarMirenAca' }));
  it('2 anima con la del paso actual; sin animación no hace nada', () => {
    expect(accionDeBoton(2, ctx)).toEqual({ tipo: 'comando', c: { t: 'animar', id: 'a1' } });
    expect(accionDeBoton(2, { ...ctx, animacion: undefined })).toBeNull();
  });
  it('3 recentra', () => expect(accionDeBoton(3, ctx)).toEqual({ tipo: 'comando', c: { t: 'recentrar' } }));
  it('4 alterna la maqueta', () => expect(accionDeBoton(4, ctx)).toEqual({ tipo: 'alternarAR' }));
  it('índice inválido → null', () => expect(accionDeBoton(7, ctx)).toBeNull());
  it('en AR «Traer» no hace nada (la cabeza está en la mesa, no en la terminal)', () => {
    expect(accionDeBoton(0, { ...ctx, enAR: true })).toBeNull();
  });
});

describe('enrutarGatillo', () => {
  it('sobre un botón lo consume (toque corto activa, mantener no hace nada)', () => {
    expect(enrutarGatillo('resaltar', 2, false)).toEqual({ tipo: 'boton', indice: 2 });
    expect(enrutarGatillo('mirenAca', 2, false)).toEqual({ tipo: 'nada' });
  });
  it('sobre un botón gana aunque «Miren acá» esté armado', () => {
    expect(enrutarGatillo('resaltar', 1, true)).toEqual({ tipo: 'boton', indice: 1 });
  });
  it('sin botón: toque corto resalta, mantenido marca', () => {
    expect(enrutarGatillo('resaltar', null, false)).toEqual({ tipo: 'resaltar' });
    expect(enrutarGatillo('mirenAca', null, false)).toEqual({ tipo: 'marcar' });
  });
  it('armado: el siguiente gatillo (corto o largo) marca el punto', () => {
    expect(enrutarGatillo('resaltar', null, true)).toEqual({ tipo: 'marcar' });
    expect(enrutarGatillo('mirenAca', null, true)).toEqual({ tipo: 'marcar' });
  });
  it('sin acción no hace nada', () => expect(enrutarGatillo(null, 3, true)).toEqual({ tipo: 'nada' }));
});

describe('comandoTraer', () => {
  it('pos a 1,7 m del piso bajo la cabeza; mira adelante en el plano horizontal', () => {
    // giro de 90° a la izquierda: adelante pasa de -z a -x
    const s = Math.SQRT1_2;
    const c = comandoTraer([3, 1.2, 4], [0, s, 0, s]);
    expect(c.pos).toEqual([3, 1.7, 4]);
    expect(c.mira[0]).toBeCloseTo(3 - 10);
    expect(c.mira[1]).toBe(1.7);
    expect(c.mira[2]).toBeCloseTo(4);
  });
  it('ignora la inclinación de la cabeza (mirando al piso)', () => {
    const a = -Math.PI / 4;
    const c = comandoTraer([0, 1.6, 0], [Math.sin(a), 0, 0, Math.cos(a)]);
    expect(c.mira[1]).toBe(1.7);
    expect(Math.hypot(c.mira[0], c.mira[2])).toBeGreaterThan(1);
  });
});

describe('colocacionMaqueta', () => {
  it('escala 1:400', () => expect(ESCALA_MAQUETA).toBe(1 / 400));
  it('el centro de la terminal queda 1 m al frente (horizontal) y a 0,8 m de altura', () => {
    const { escala, posicion } = colocacionMaqueta([2, 1.6, 3], [0, 0.3, -1]);
    expect(escala).toBe(1 / 400);
    expect(CENTRO_TERMINAL[0] * escala + posicion[0]).toBeCloseTo(2);
    expect(CENTRO_TERMINAL[2] * escala + posicion[2]).toBeCloseTo(3 - DISTANCIA_MAQUETA);
    expect(CENTRO_TERMINAL[1] * escala + posicion[1]).toBeCloseTo(ALTURA_MAQUETA);
    expect(ALTURA_MAQUETA).toBe(0.8);
    expect(DISTANCIA_MAQUETA).toBe(1);
  });
  it('mirando recto hacia abajo usa -z como adelante', () => {
    const { posicion, escala } = colocacionMaqueta([0, 1.6, 0], [0, -1, 0]);
    expect(CENTRO_TERMINAL[2] * escala + posicion[2]).toBeCloseTo(-1);
  });
});
