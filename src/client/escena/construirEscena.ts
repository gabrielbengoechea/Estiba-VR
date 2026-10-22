import * as THREE from 'three';
import type { Escena, Modulo } from '../../shared/tipos';
import { celdaAMundo } from '../../shared/grilla';
import { catalogo as catalogoReal, type EntradaCatalogo } from './catalogo';
import type { TipoModulo } from '../../shared/tipos';

export type CatalogoCrear = Record<TipoModulo, Pick<EntradaCatalogo, 'crear'>>;

export interface Diferencia { crear: Modulo[]; actualizar: Modulo[]; borrar: string[] }

function claveParams(p?: Record<string, number>): string {
  return JSON.stringify(Object.entries(p ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function cambio(a: Modulo, b: Modulo): boolean {
  return a.tipo !== b.tipo || a.celda[0] !== b.celda[0] || a.celda[1] !== b.celda[1]
    || a.rot !== b.rot || claveParams(a.params) !== claveParams(b.params);
}

/** Qué hay que crear, actualizar o borrar para pasar de `antes` a `despues`. */
export function diferenciaEscena(antes: Escena | null, despues: Escena): Diferencia {
  const previos = new Map((antes?.modulos ?? []).map((m) => [m.id, m]));
  const dif: Diferencia = { crear: [], actualizar: [], borrar: [] };
  const vistos = new Set<string>();
  for (const m of despues.modulos) {
    vistos.add(m.id);
    const p = previos.get(m.id);
    if (!p) dif.crear.push(m);
    else if (cambio(p, m)) dif.actualizar.push(m);
  }
  for (const id of previos.keys()) if (!vistos.has(id)) dif.borrar.push(id);
  return dif;
}

/** Escena de three.js que se mantiene al día aplicando solo las diferencias. */
export class EscenaViva {
  readonly raiz = new THREE.Group();
  private objetos = new Map<string, THREE.Object3D>();
  private actual: Escena | null = null;
  private cola: Promise<void> = Promise.resolve();

  constructor(private catalogo: CatalogoCrear = catalogoReal) {}

  /** Las llamadas se encolan, así que dos `aplicar` seguidos nunca se pisan. */
  aplicar(e: Escena): Promise<void> {
    const tarea = this.cola.then(() => this.aplicarYa(e));
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }

  objeto(id: string): THREE.Object3D | undefined {
    return this.objetos.get(id);
  }

  private async aplicarYa(e: Escena): Promise<void> {
    const m = e.metrosPorCelda;
    const mCambio = this.actual !== null && this.actual.metrosPorCelda !== m;
    if (mCambio) for (const id of [...this.objetos.keys()]) this.quitar(id);
    const antes = mCambio ? null : this.actual;
    const dif = diferenciaEscena(antes, e);
    const previos = new Map((antes?.modulos ?? []).map((x) => [x.id, x]));

    for (const id of dif.borrar) this.quitar(id);

    const aCrear = [...dif.crear];
    for (const mod of dif.actualizar) {
      const p = previos.get(mod.id);
      const obj = this.objetos.get(mod.id);
      if (p && obj && p.tipo === mod.tipo && claveParams(p.params) === claveParams(mod.params)) {
        this.colocar(obj, mod, m); // solo cambian celda o rot
      } else {
        aCrear.push(mod); // cambian los parámetros: se recrea
      }
    }

    const resultados = await Promise.allSettled(aCrear.map(async (mod) => {
      const obj = await this.catalogo[mod.tipo].crear(mod.params, m);
      return [mod, obj] as const;
    }));
    const fallidos = new Set<string>();
    resultados.forEach((r, i) => {
      if (r.status === 'rejected') {
        fallidos.add(aCrear[i].id);
        console.error(`No se pudo crear el módulo ${aCrear[i].id}`, r.reason);
        return;
      }
      const [mod, obj] = r.value;
      this.quitar(mod.id);
      this.colocar(obj, mod, m);
      this.objetos.set(mod.id, obj);
      this.raiz.add(obj);
    });
    // Lo que falló queda fuera de `actual` (o con su versión previa) para que el próximo aplicar lo reintente.
    const modulos: Modulo[] = [];
    for (const mod of e.modulos) {
      if (!fallidos.has(mod.id)) modulos.push(mod);
      else if (previos.has(mod.id) && this.objetos.has(mod.id)) modulos.push(previos.get(mod.id)!);
    }
    this.actual = { ...e, modulos };
  }

  private colocar(obj: THREE.Object3D, mod: Modulo, m: number): void {
    const [x, y, z] = celdaAMundo(mod.celda, m);
    obj.position.set(x, y, z);
    obj.rotation.set(0, THREE.MathUtils.degToRad(mod.rot), 0);
    obj.userData.moduloId = mod.id;
  }

  private quitar(id: string): void {
    const obj = this.objetos.get(id);
    if (obj) {
      this.raiz.remove(obj);
      // Cada InstancedMesh tiene su propio buffer; la geometría y los materiales son compartidos y no se tocan.
      obj.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    }
    this.objetos.delete(id);
  }
}
