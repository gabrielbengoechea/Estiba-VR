import { describe, expect, it } from 'vitest';
import { Apilado, DESFASE_20, MEDIDAS, esquineros, type Celda, type Contenedor, type TipoContenedor } from './apilado';

const suelo = (id: string, x: number, z: number, giro = 0, niveles = 6): Celda => ({ id, x, y: 0, z, giro, niveles });
let n = 0;
const c = (tipo: TipoContenedor): Contenedor => ({ id: `c${++n}`, tipo, librea: n % 8 });

describe('apilado por esquineros', () => {
  it('una pila de seis 40\' queda a alturas exactas, sin acumular error', () => {
    const a = new Apilado([suelo('s1', 10.3, -4.7, 0.3)]);
    const ids: string[] = [];
    for (let k = 0; k < 6; k++) {
      const x = c('40');
      expect(a.colocar(x, 's1', 'C').ok).toBe(true);
      ids.push(x.id);
    }
    ids.forEach((id, k) => {
      const p = a.pose(id)!;
      expect(p.y).toBe([0, 1, 2, 3, 4, 5].slice(0, k).reduce((s) => s + MEDIDAS['40'].alto, 0));
      expect(p.x).toBe(10.3);
      expect(p.z).toBe(-4.7);
      expect(p.giro).toBe(0.3);
    });
    expect(a.verificar('40', 's1', 'C')).toMatchObject({ ok: false });
  });

  it('levantar y volver a apoyar mil veces deja la pila en el mismo lugar, bit a bit', () => {
    const a = new Apilado([suelo('s1', 3.21, 7.77, 1.1), suelo('s2', 30.4, 7.77, 1.1)]);
    const pila = [c('40'), c('40HC'), c('40'), c('40HC'), c('40')];
    for (const x of pila) a.colocar(x, 's1', 'C');
    const antes = pila.map((x) => a.pose(x.id));
    for (let i = 0; i < 1000; i++) {
      const top = pila[pila.length - 1];
      const r = a.levantar(top.id);
      expect(r.ok).toBe(true);
      const destino = i % 2 ? 's1' : 's2';
      a.colocar(top, destino, 'C');
      a.levantar(top.id);
      a.colocar(top, 's1', 'C');
    }
    expect(pila.map((x) => a.pose(x.id))).toEqual(antes);
  });

  it('los esquineros de abajo de cada contenedor caen sobre los de arriba del que lo sostiene', () => {
    const a = new Apilado([suelo('s1', 5, 5, 0.7)]);
    const b20a = c('20');
    const b20b = c('20');
    const top = c('40');
    a.colocar(b20a, 's1', 'A');
    a.colocar(b20b, 's1', 'B');
    expect(a.colocar(top, 's1', 'C').ok).toBe(true);
    const debajo = [...esquineros('20', a.pose(b20a.id)!, 'arriba'), ...esquineros('20', a.pose(b20b.id)!, 'arriba')];
    for (const [x, y, z] of esquineros('40', a.pose(top.id)!, 'abajo')) {
      const cerca = debajo.map(([u, v, w]) => Math.hypot(u - x, w - z) + Math.abs(v - y)).sort((p, q) => p - q)[0];
      // en planta coinciden; en altura los centros están a 2 × 59 mm (medio esquinero de cada uno)
      expect(cerca).toBeCloseTo(2 * 0.059, 9);
    }
    expect(DESFASE_20).toBeCloseTo(3.067, 3);
  });

  it('reglas: 20\' sobre 40\' no; 40\' sobre un solo 20\' no; 40\' sobre dos 20\' sí', () => {
    const a = new Apilado([suelo('s1', 0, 0), suelo('s2', 0, 10)]);
    a.colocar(c('40'), 's1', 'C');
    expect(a.verificar('20', 's1', 'A')).toMatchObject({ ok: false, motivo: expect.stringMatching(/no encastra/) });
    a.colocar(c('20'), 's2', 'A');
    expect(a.verificar('40', 's2', 'C')).toMatchObject({ ok: false, motivo: expect.stringMatching(/dos 20/) });
    expect(a.verificar('20', 's2', 'B')).toEqual({ ok: true, nivel: 0 });
    expect(a.verificar('20', 's2', 'A')).toEqual({ ok: true, nivel: 1 });
    a.colocar(c('20'), 's2', 'B');
    expect(a.verificar('40', 's2', 'C')).toEqual({ ok: true, nivel: 1 });
    expect(a.verificar('40', 's2', 'A')).toMatchObject({ ok: false });
  });

  it('un 20\' completa el nivel solo si tiene apoyo abajo en su mitad', () => {
    const a = new Apilado([suelo('s', 0, 0)]);
    a.colocar(c('20'), 's', 'B');
    a.colocar(c('20'), 's', 'B'); // nivel 1, mitad B
    expect(a.verificar('20', 's', 'A')).toMatchObject({ ok: false, motivo: expect.stringMatching(/Falta un 20/) });
  });

  it('no se levanta lo que tiene algo encima', () => {
    const a = new Apilado([suelo('s', 0, 0)]);
    const abajo = c('20');
    const otro = c('20');
    const arriba = c('40');
    a.colocar(abajo, 's', 'A');
    a.colocar(otro, 's', 'B');
    a.colocar(arriba, 's', 'C');
    expect(a.levantar(abajo.id)).toMatchObject({ ok: false });
    expect(a.levantar(arriba.id).ok).toBe(true);
    expect(a.levantar(abajo.id).ok).toBe(true);
    expect(a.pila('s').map((p) => p.id)).toEqual([otro.id]);
  });

  it('la cama del camión lleva un solo nivel, y sus 20\' van en sus montajes', () => {
    const cam: Celda = { id: 'cam', x: 50, y: 1.38, z: 0, giro: Math.PI, niveles: 1, mitades: { A: 3.07, B: -3.18 } };
    const a = new Apilado([cam]);
    const x = c('20');
    a.colocar(x, 'cam', 'A');
    expect(a.pose(x.id)).toMatchObject({ y: 1.38 });
    expect(a.pose(x.id)!.x).toBeCloseTo(50 - 3.07, 9);
    expect(a.verificar('20', 'cam', 'A')).toMatchObject({ ok: false, motivo: expect.stringMatching(/camión/) });
    expect(a.verificar('20', 'cam', 'B')).toEqual({ ok: true, nivel: 0 });
    // el camión se va: el contenedor lo sigue sin moverse respecto de la cama
    a.moverCelda('cam', 80, 1.38, -20, Math.PI / 2);
    const p = a.pose(x.id)!;
    expect(Math.hypot(p.x - 80, p.z + 20)).toBeCloseTo(3.07, 9);
  });

  it('la zona magnética elige el lugar válido más cercano y respeta el sentido de las puertas', () => {
    const a = new Apilado([suelo('s1', 0, 0), suelo('s2', 0, 2.8)]);
    a.colocar(c('40'), 's2', 'C');
    const k = a.buscar('40', 0.4, 1.9, Math.PI + 0.2)!;
    expect(k).toMatchObject({ celda: 's2', ok: true, nivel: 1, invertido: true });
    expect(k.pose.y).toBe(MEDIDAS['40'].alto);
    expect(k.pose.giro).toBeCloseTo(Math.PI, 12);
    const lejos = a.buscar('40', 20, 20, 0);
    expect(lejos).toBeNull();
    const torcido = a.buscar('40', 0, 0, Math.PI / 2);
    expect(torcido).toMatchObject({ ok: false, motivo: expect.stringMatching(/Girá/) });
    const veinte = a.buscar('20', -2.6, 0.1, 0)!;
    expect(veinte).toMatchObject({ celda: 's1', mitad: 'A', ok: true });
  });

  it('si no hay lugar válido avisa por qué', () => {
    const a = new Apilado([suelo('s', 0, 0, 0, 2)]);
    a.colocar(c('40'), 's', 'C');
    a.colocar(c('40'), 's', 'C');
    expect(a.buscar('40', 0, 0, 0)).toMatchObject({ ok: false, motivo: expect.stringMatching(/máximo/) });
  });

  it('instantánea y restauración', () => {
    const a = new Apilado([suelo('s', 0, 0), suelo('t', 0, 3)]);
    const x = c('20');
    const y = c('20');
    const z = c('40HC');
    a.colocar(x, 's', 'A');
    a.colocar(y, 's', 'B');
    a.colocar(z, 's', 'C', true);
    const foto = a.instantanea();
    a.levantar(z.id);
    a.colocar(z, 't', 'C');
    a.restaurar(foto);
    expect(a.lugar(z.id)).toEqual({ celda: 's', nivel: 1, mitad: 'C', invertido: true });
    expect(a.pose(z.id)!.y).toBe(MEDIDAS['20'].alto);
  });
});

describe('preferencia por lo apuntado', () => {
  it('si apunta a una pila donde no encastra, avisa en vez de saltar a la de al lado', () => {
    const a = new Apilado([suelo('b1', 0, 0), suelo('c1', 0, -2.8)]);
    a.colocar(c('20'), 'b1', 'A');
    // apunta a b1 (corrido 0,9 m hacia c1): c1 está a 1,9 m y es válida, b1 a 0,9 m y no
    expect(a.buscar('40', 0, -0.9, 0)).toMatchObject({ celda: 'b1', ok: false });
    // a mitad de camino, gana la válida
    expect(a.buscar('40', 0, -1.3, 0)).toMatchObject({ celda: 'c1', ok: true });
  });
});
