// Apilado de contenedores por esquineros (ISO 1161), sin física: cada contenedor ocupa un lugar discreto
// (celda, nivel, mitad) y su pose sale siempre de la celda y de las alturas de los niveles de abajo. Así una pila de
// seis no acumula error ni tiembla, y un contenedor sobre un camión queda fijo a su cama mientras el camión se mueve.
//
// Reglas (las de un patio real, simplificadas):
// - Un 40' (o 40' HC) apoya sobre el suelo, sobre otro 40' o sobre dos 20' del mismo nivel (A y B): los esquineros
//   de las puntas del 40' caen justo sobre los de afuera de los 20' (el hueco del medio es de 76 mm).
// - Un 20' apoya sobre el suelo o sobre otro 20' de la misma mitad. Sobre un 40' no: el 40' no tiene esquineros en
//   el medio donde trabarlo.
// - Solo se levanta un contenedor que no tiene nada encima.
// - Cada celda tiene un máximo de niveles (el camión, uno).
//
// Coordenadas como en three.js: y arriba; el giro es alrededor de y y el eje x local de la celda es el largo del
// contenedor: x_mundo = cx + dx·cos(giro), z_mundo = cz − dx·sin(giro).

export type TipoContenedor = '20' | '40' | '40HC';
export type Mitad = 'C' | 'A' | 'B';

/** Medidas exteriores ISO 668 (m). */
export const MEDIDAS: Record<TipoContenedor, { largo: number; ancho: number; alto: number }> = {
  '20': { largo: 6.058, ancho: 2.438, alto: 2.591 },
  '40': { largo: 12.192, ancho: 2.438, alto: 2.591 },
  '40HC': { largo: 12.192, ancho: 2.438, alto: 2.896 },
};

/** Centro de cada esquinero respecto de las caras exteriores (ISO 1161: 178 × 162 × 118 mm). */
export const ESQUINERO = { x: 0.089, z: 0.081, y: 0.059 } as const;

/** Distancia del centro de un 20' al centro de la celda de 40' cuando van dos (A en −x, B en +x). */
export const DESFASE_20 = (MEDIDAS['40'].largo - MEDIDAS['20'].largo) / 2;

export interface Celda {
  id: string;
  /** Centro de la celda de 40' a la altura de apoyo (suelo o cama del camión). */
  x: number;
  y: number;
  z: number;
  giro: number;
  /** Máximo de niveles. */
  niveles: number;
  /** Corrimiento a lo largo de x de los 20' (los camiones tienen sus propios montajes). */
  mitades?: { A: number; B: number };
  etiqueta?: string;
}

export interface Contenedor { id: string; tipo: TipoContenedor; librea: number; codigo?: string }

export interface Lugar { celda: string; nivel: number; mitad: Mitad; invertido: boolean }

export interface Pose { x: number; y: number; z: number; giro: number }

type Nivel = Partial<Record<Mitad, string>>;

export type Verificacion = { ok: true; nivel: number } | { ok: false; motivo: string };

export interface Candidato {
  celda: string;
  mitad: Mitad;
  invertido: boolean;
  nivel: number;
  pose: Pose;
  distancia: number;
  ok: boolean;
  motivo?: string;
}

export interface OpcionesBusqueda {
  /** Radio horizontal de la zona magnética alrededor del centro de cada lugar (m). */
  radio?: number;
  /** Desvío de giro aceptado respecto de la celda (rad, módulo 180°). */
  tolerancia?: number;
}

export const RADIO_IMAN = 2.4;
export const TOLERANCIA_GIRO = (35 * Math.PI) / 180;
/** Ventaja (m) que se le da a un lugar válido frente al no válido más cercano. */
export const PREFERENCIA_VALIDO = 0.6;

const es40 = (t: TipoContenedor) => t !== '20';

/** Diferencia de ángulos en (−π, π]. */
export function difAngulo(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export interface Instantanea { contenedores: Contenedor[]; lugares: Record<string, Lugar> }

export class Apilado {
  readonly celdas = new Map<string, Celda>();
  private pilas = new Map<string, Nivel[]>();
  private conts = new Map<string, Contenedor>();
  private lugares = new Map<string, Lugar>();

  constructor(celdas: Celda[] = []) {
    for (const c of celdas) this.agregarCelda(c);
  }

  agregarCelda(c: Celda): void {
    this.celdas.set(c.id, c);
    if (!this.pilas.has(c.id)) this.pilas.set(c.id, []);
  }

  /** Cambia la posición de una celda (un camión que se mueve): los contenedores la siguen sin recalcular nada más. */
  moverCelda(id: string, x: number, y: number, z: number, giro: number): void {
    const c = this.celdas.get(id);
    if (!c) return;
    Object.assign(c, { x, y, z, giro });
  }

  contenedor(id: string): Contenedor | undefined {
    return this.conts.get(id);
  }

  get todos(): Contenedor[] {
    return [...this.conts.values()];
  }

  lugar(id: string): Lugar | undefined {
    return this.lugares.get(id);
  }

  /** Contenedores apoyados en una celda, de abajo hacia arriba. */
  pila(celda: string): { nivel: number; mitad: Mitad; id: string }[] {
    const out: { nivel: number; mitad: Mitad; id: string }[] = [];
    (this.pilas.get(celda) ?? []).forEach((n, k) => {
      for (const m of ['C', 'A', 'B'] as Mitad[]) if (n[m]) out.push({ nivel: k, mitad: m, id: n[m]! });
    });
    return out;
  }

  private altoNivel(n: Nivel): number {
    let h = 0;
    for (const m of ['C', 'A', 'B'] as Mitad[]) {
      const id = n[m];
      if (id) h = Math.max(h, MEDIDAS[this.conts.get(id)!.tipo].alto);
    }
    return h;
  }

  /** Altura de apoyo del nivel `k` de una celda. */
  alturaNivel(celda: string, k: number): number {
    const c = this.celdas.get(celda)!;
    const p = this.pilas.get(celda) ?? [];
    let y = c.y;
    for (let i = 0; i < k && i < p.length; i++) y += this.altoNivel(p[i]);
    return y;
  }

  /** Centro horizontal y giro de una mitad de la celda. */
  posicionMitad(celda: Celda, mitad: Mitad, invertido = false): Pose {
    const dx = mitad === 'C' ? 0 : (celda.mitades ?? { A: -DESFASE_20, B: DESFASE_20 })[mitad];
    const c = Math.cos(celda.giro);
    const s = Math.sin(celda.giro);
    return { x: celda.x + dx * c, y: celda.y, z: celda.z - dx * s, giro: celda.giro + (invertido ? Math.PI : 0) };
  }

  /** ¿Se puede apoyar un contenedor de este tipo en esa mitad de la celda? (sin contar al que se tiene en la mano). */
  verificar(tipo: TipoContenedor, celdaId: string, mitad: Mitad): Verificacion {
    const celda = this.celdas.get(celdaId);
    if (!celda) return { ok: false, motivo: 'Ese lugar no existe' };
    if (es40(tipo) !== (mitad === 'C')) return { ok: false, motivo: es40(tipo) ? "Un 40' ocupa la celda entera" : "Un 20' va en una mitad de la celda" };
    const p = this.pilas.get(celdaId)!;
    const n = p.length;
    const arriba = n > 0 ? p[n - 1] : undefined;
    const lleno = () => ({ ok: false as const, motivo: celda.niveles === 1 ? 'La cama del camión lleva un solo nivel' : `La pila ya tiene ${celda.niveles} niveles: es el máximo de esta celda` });

    if (es40(tipo)) {
      if (n >= celda.niveles) return lleno();
      if (arriba && !arriba.C && !(arriba.A && arriba.B)) {
        return { ok: false, motivo: "Falta un 20' abajo: el 40' necesita dos 20' (A y B) para apoyar sus cuatro esquineros" };
      }
      return { ok: true, nivel: n };
    }
    const m = mitad as 'A' | 'B';
    // ¿completa el nivel de arriba, al lado de otro 20'?
    if (arriba && !arriba.C && !arriba[m]) {
      const k = n - 1;
      const abajo = k > 0 ? p[k - 1] : undefined;
      if (!abajo) return { ok: true, nivel: k };
      if (abajo.C) return { ok: false, motivo: "Un 20' sobre un 40' no encastra: el 40' no tiene esquineros en el medio" };
      if (!abajo[m]) return { ok: false, motivo: "Falta un 20' abajo en esta mitad" };
      return { ok: true, nivel: k };
    }
    if (n >= celda.niveles) return lleno();
    if (arriba?.C) return { ok: false, motivo: "Un 20' sobre un 40' no encastra: el 40' no tiene esquineros en el medio" };
    if (arriba && !arriba[m]) return { ok: false, motivo: "Falta un 20' abajo en esta mitad" };
    return { ok: true, nivel: n };
  }

  /** ¿Se puede levantar? Solo si no tiene nada encima. */
  verificarLevantar(id: string): { ok: true } | { ok: false; motivo: string } {
    const l = this.lugares.get(id);
    if (!l) return { ok: false, motivo: 'No está apoyado' };
    const sobre = (this.pilas.get(l.celda) ?? [])[l.nivel + 1];
    if (sobre && (sobre.C || (l.mitad === 'C' ? sobre.A || sobre.B : sobre[l.mitad]))) {
      return { ok: false, motivo: 'Tiene otro contenedor encima: primero hay que sacar el de arriba' };
    }
    return { ok: true };
  }

  /** Apoya un contenedor (nuevo o levantado) en un lugar. Devuelve la verificación. */
  colocar(cont: Contenedor, celdaId: string, mitad: Mitad, invertido = false): Verificacion {
    if (this.lugares.has(cont.id)) return { ok: false, motivo: 'Ya está apoyado en otro lugar' };
    this.conts.set(cont.id, cont);
    const v = this.verificar(cont.tipo, celdaId, mitad);
    if (!v.ok) {
      this.conts.delete(cont.id);
      return v;
    }
    const p = this.pilas.get(celdaId)!;
    if (v.nivel === p.length) p.push({});
    p[v.nivel][mitad] = cont.id;
    this.lugares.set(cont.id, { celda: celdaId, nivel: v.nivel, mitad, invertido });
    return v;
  }

  /** Lo saca de la pila (queda en la mano). */
  levantar(id: string): { ok: true; desde: Lugar; contenedor: Contenedor } | { ok: false; motivo: string } {
    const v = this.verificarLevantar(id);
    if (!v.ok) return v;
    const l = this.lugares.get(id)!;
    const p = this.pilas.get(l.celda)!;
    delete p[l.nivel][l.mitad];
    while (p.length && !p[p.length - 1].C && !p[p.length - 1].A && !p[p.length - 1].B) p.pop();
    this.lugares.delete(id);
    const contenedor = this.conts.get(id)!;
    this.conts.delete(id);
    return { ok: true, desde: l, contenedor };
  }

  /** Pose del contenedor apoyado: centro de la base y giro. Sale siempre de la celda y de los niveles de abajo. */
  pose(id: string): Pose | null {
    const l = this.lugares.get(id);
    if (!l) return null;
    const celda = this.celdas.get(l.celda)!;
    const p = this.posicionMitad(celda, l.mitad, l.invertido);
    p.y = this.alturaNivel(l.celda, l.nivel);
    return p;
  }

  /**
   * Zona magnética: el lugar más cercano (en planta) donde encastraría un contenedor de `tipo` que está en (x, z) con
   * ese giro. Si el más cercano no es válido y no hay uno válido casi igual de cerca, devuelve ese con el motivo
   * (así el alumno ve por qué no encastra donde apunta); null si no hay nada dentro del radio.
   */
  buscar(tipo: TipoContenedor, x: number, z: number, giro: number, op: OpcionesBusqueda = {}): Candidato | null {
    const radio = op.radio ?? RADIO_IMAN;
    const tol = op.tolerancia ?? TOLERANCIA_GIRO;
    let mejor: Candidato | null = null;
    let mejorMal: Candidato | null = null;
    const mitades: Mitad[] = es40(tipo) ? ['C'] : ['A', 'B'];
    for (const celda of this.celdas.values()) {
      for (const mitad of mitades) {
        const invertido = Math.cos(giro - celda.giro) < 0;
        const pose = this.posicionMitad(celda, mitad, invertido);
        const d = Math.hypot(pose.x - x, pose.z - z);
        if (d > radio) continue;
        const desvio = Math.abs(difAngulo(giro, pose.giro));
        let v: Verificacion = this.verificar(tipo, celda.id, mitad);
        if (v.ok && desvio > tol) v = { ok: false, motivo: 'Girá el contenedor para alinearlo con la celda' };
        const nivel = v.ok ? v.nivel : (this.pilas.get(celda.id) ?? []).length;
        pose.y = this.alturaNivel(celda.id, nivel);
        const cand: Candidato = { celda: celda.id, mitad, invertido, nivel, pose, distancia: d, ok: v.ok, motivo: v.ok ? undefined : v.motivo };
        if (v.ok) { if (!mejor || d < mejor.distancia) mejor = cand; } else if (!mejorMal || d < mejorMal.distancia) mejorMal = cand;
      }
    }
    // Se respeta a qué apunta el alumno: un lugar válido gana solo si está casi tan cerca como el no válido.
    if (mejor && mejorMal && mejor.distancia > mejorMal.distancia + PREFERENCIA_VALIDO) return mejorMal;
    return mejor ?? mejorMal;
  }

  instantanea(): Instantanea {
    const lugares: Record<string, Lugar> = {};
    for (const [id, l] of this.lugares) lugares[id] = { ...l };
    return { contenedores: this.todos.map((c) => ({ ...c })), lugares };
  }

  /** Vuelve a un estado guardado: apila de abajo hacia arriba para respetar las reglas. */
  restaurar(e: Instantanea): void {
    for (const id of [...this.pilas.keys()]) this.pilas.set(id, []);
    this.conts.clear();
    this.lugares.clear();
    const orden = e.contenedores.filter((c) => e.lugares[c.id]).sort((a, b) => e.lugares[a.id].nivel - e.lugares[b.id].nivel);
    for (const c of orden) {
      const l = e.lugares[c.id];
      this.colocar({ ...c }, l.celda, l.mitad, l.invertido);
    }
  }
}

/** Centros de los 4 esquineros inferiores o superiores de un contenedor con esa pose (en el mundo). */
export function esquineros(tipo: TipoContenedor, pose: Pose, cara: 'abajo' | 'arriba'): [number, number, number][] {
  const m = MEDIDAS[tipo];
  const ex = m.largo / 2 - ESQUINERO.x;
  const ez = m.ancho / 2 - ESQUINERO.z;
  const y = pose.y + (cara === 'abajo' ? ESQUINERO.y : m.alto - ESQUINERO.y);
  const c = Math.cos(pose.giro);
  const s = Math.sin(pose.giro);
  const out: [number, number, number][] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * ex;
      const lz = sz * ez;
      out.push([pose.x + lx * c + lz * s, y, pose.z - lx * s + lz * c]);
    }
  }
  return out;
}
