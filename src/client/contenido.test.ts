import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Clase, Escena, Ficha } from '../shared/tipos';
import { catalogo } from './escena/catalogo';

const publico = resolve(__dirname, '../../public');
const leer = <T>(ruta: string): T => JSON.parse(readFileSync(resolve(publico, ruta), 'utf8')) as T;

const escena = leer<Escena>('escenas/terminal-a.json');
const clase = leer<Clase>('clases/terminal-contenedores.json');
const FICHAS = ['buque-portacontenedores', 'grua-sts', 'bloque-patio', 'recorrido-contenedor', 'puerta-y-tren'];

describe('contenido por defecto', () => {
  it('la escena tiene los ids fijos, sin repetir, y solo tipos del catálogo', () => {
    const ids = escena.modulos.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['muelle-1', 'sts-1', 'sts-2', 'sts-3', 'buque-1', 'tractor-1', 'tractor-2', 'patio-a', 'patio-b', 'rtg-1', 'puerta-1', 'via-1', 'tren-1']) {
      expect(ids).toContain(id);
    }
    for (const m of escena.modulos) expect(Object.keys(catalogo)).toContain(m.tipo);
  });

  it('tiene las 6 vistas', () => {
    expect(Object.keys(escena.vistas).sort()).toEqual(['cenital', 'general', 'pata-sts-2', 'proa', 'puerta', 'sobre-patio']);
  });

  it('la clase tiene los 5 pasos en orden y todo lo que referencian existe', () => {
    expect(clase.escena).toBe('terminal-a');
    expect(clase.pasos.map((p) => p.id)).toEqual(['llegada', 'descarga', 'almacenamiento', 'movimientos', 'salida']);
    expect(clase.pasos.map((p) => p.vista)).toEqual(['proa', 'pata-sts-2', 'sobre-patio', 'cenital', 'puerta']);
    expect(clase.pasos.map((p) => p.resaltar[0])).toEqual(['buque-1', 'sts-2', 'patio-a', 'rtg-1', 'puerta-1']);
    expect(clase.pasos.map((p) => p.ficha)).toEqual(['buque-portacontenedores', 'grua-sts', 'bloque-patio', 'recorrido-contenedor', 'puerta-y-tren']);
    expect(clase.pasos.map((p) => p.animacion)).toEqual(['atraque', 'descarga-ciclo', undefined, 'recorrido', 'salida']);
    const ids = escena.modulos.map((m) => m.id);
    for (const p of clase.pasos) {
      expect(escena.vistas[p.vista]).toBeDefined();
      for (const r of p.resaltar) expect(ids).toContain(r);
    }
  });

  it('cada ficha existe, coincide con su id y está marcada como ejemplo', () => {
    for (const id of FICHAS) {
      const f = leer<Ficha>(`fichas/${id}.json`);
      expect(f.id).toBe(id);
      expect(f.titulo.length).toBeGreaterThan(0);
      expect(f.ejemplo).toBe(true);
    }
  });

  it('la ficha de la grúa tiene alcance y productividad', () => {
    const f = leer<Ficha>('fichas/grua-sts.json');
    expect(f.datos).toContainEqual({ etiqueta: 'Alcance', valor: '22 filas' });
    expect(f.datos).toContainEqual({ etiqueta: 'Productividad', valor: '25–35 movimientos/h' });
  });
});
