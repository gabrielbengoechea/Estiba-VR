// Menú del visor en la exploración libre: las mismas animaciones de la clase guiada (atraque, descarga, movimientos
// en el patio y salida por tren), pero cada alumno las lanza, pausa, acelera o repite a su ritmo desde el gatillo
// izquierdo, con una guía paso a paso que resalta la pieza de la que se habla.
import * as THREE from 'three';
import type { Clase, Escena, EstadoSala, Ficha } from '../../shared/tipos';
import { Animador, type IdAnimacion } from '../clase/animaciones';
import { cargarFicha } from '../clase/fichas';
import type { EscenaViva } from '../escena/construirEscena';
import type { ConfigMenu, EscenaGuiada, Lugar, Paso, Tiempo } from '../vr/escenas';

type Vista = { pos: [number, number, number]; mira: [number, number, number] };

const NOMBRE_VISTA: Record<string, string> = {
  general: 'Vista general (desde arriba)',
  proa: 'Proa del buque',
  'pata-sts-2': 'Pata de la grúa 2',
  'sobre-patio': 'Sobre el patio',
  cenital: 'Cenital del patio',
  puerta: 'Puerta y vías del tren',
};

/** Reloj propio de las animaciones: se puede pausar, acelerar o mover hacia atrás sin tocar el resto de la escena. */
export class RelojAnimaciones implements Tiempo {
  ms = 0;
  private vel = 1;
  private pausa = false;
  /** Animación en curso y desde cuándo (ms de este reloj). */
  animacion: { id: IdAnimacion; inicio: number } | null = null;

  avanzar(dt: number) {
    if (!this.pausa) this.ms += dt * 1000 * this.vel;
  }

  lanzar(id: IdAnimacion | undefined) {
    this.animacion = id ? { id, inicio: this.ms } : null;
    if (id) this.pausa = false;
  }

  reloj() {
    if (!this.animacion) return 'Sin animación';
    const s = Math.max(0, (this.ms - this.animacion.inicio) / 1000);
    return `${NOMBRE_ANIMACION[this.animacion.id]} · ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }
  detalle() {
    return this.animacion ? `Velocidad ×${String(this.vel).replace('.', ',')}${this.pausa ? ' · en pausa' : ''}` : 'Elegí una escena en la pestaña Escenas';
  }
  pausado() {
    return this.pausa;
  }
  alternarPausa() {
    this.pausa = !this.pausa;
  }
  velocidades = [
    { etiqueta: '×0,25', valor: 0.25 },
    { etiqueta: '×0,5', valor: 0.5 },
    { etiqueta: '×1', valor: 1 },
    { etiqueta: '×2', valor: 2 },
    { etiqueta: '×4', valor: 4 },
  ];
  velocidad() {
    return this.vel;
  }
  fijarVelocidad(v: number) {
    this.vel = v;
  }
  saltos = [
    { etiqueta: 'Desde el inicio', horas: -1e6 },
    { etiqueta: '−10 s', horas: -10 },
    { etiqueta: '+10 s', horas: 10 },
  ];
  /** Acá los saltos son en segundos de la animación (no horas). */
  saltar(s: number) {
    if (!this.animacion) return;
    // Mover el inicio hacia el otro lado equivale a mover el instante de la animación.
    this.animacion.inicio = Math.min(this.ms, this.animacion.inicio - s * 1000);
  }
}

const NOMBRE_ANIMACION: Record<IdAnimacion, string> = {
  atraque: 'Atraque',
  'descarga-ciclo': 'Descarga',
  recorrido: 'Patio',
  salida: 'Salida',
};

/** Caja que late alrededor de la pieza de la que habla la guía. */
export class Resaltador {
  readonly borde: THREE.LineSegments;
  private caja = new THREE.Box3();
  private id: string | null = null;
  private t = 0;

  constructor(private viva: EscenaViva) {
    this.borde = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, depthTest: false }),
    );
    this.borde.renderOrder = 999;
    this.borde.visible = false;
    this.borde.raycast = () => undefined;
    this.borde.userData.sinColision = true;
  }

  resaltar(id: string | null) {
    this.id = id;
    if (!id) this.borde.visible = false;
  }

  actualizar(dt: number) {
    this.t += dt;
    const obj = this.id ? this.viva.objeto(this.id) : undefined;
    if (!obj) {
      this.borde.visible = false;
      return;
    }
    obj.updateWorldMatrix(true, true);
    this.caja.setFromObject(obj);
    if (this.caja.isEmpty()) return;
    this.caja.getCenter(this.borde.position);
    this.caja.getSize(this.borde.scale).addScalar(0.6);
    (this.borde.material as THREE.LineBasicMaterial).opacity = 0.6 + 0.4 * Math.sin(this.t * 4);
    this.borde.visible = true;
  }
}

/** Lugar desde una vista de la clase (pos = ojos): las vistas en altura llevan plataforma de observación. */
function lugarDeVista(id: string, v: Vista, resumen?: string): Lugar {
  const pies = new THREE.Vector3(v.pos[0], Math.max(0, v.pos[1] - 1.6), v.pos[2]);
  return {
    titulo: NOMBRE_VISTA[id] ?? id,
    resumen,
    pos: pies,
    yaw: Math.atan2(-(v.mira[0] - v.pos[0]), -(v.mira[2] - v.pos[2])),
    alto: pies.y > 0.6,
  };
}

function textoFicha(f: Ficha | undefined, titulo: string): string {
  if (!f) return titulo;
  const datos = f.datos.map((d) => `${d.etiqueta}: ${d.valor}`).join(' · ');
  return datos ? `${f.texto} ${datos}.` : f.texto;
}

/**
 * Arma el menú a partir de la clase guiada (public/clases/*.json): una escena con la clase completa y una por cada
 * animación, con el texto de sus fichas. Devuelve también el reloj y el resaltador, que la vista actualiza cada cuadro.
 */
export async function menuEstiba(opciones: {
  base: string;
  escena: Escena & { vistas?: Record<string, Vista> };
  viva: EscenaViva;
  raizEscena: THREE.Scene;
}): Promise<{ menu: ConfigMenu; reloj: RelojAnimaciones; resaltador: Resaltador; animador: Animador; cuadro: (dt: number) => void }> {
  const { base, escena, viva, raizEscena } = opciones;
  const vistas = escena.vistas ?? {};
  const reloj = new RelojAnimaciones();
  const resaltador = new Resaltador(viva);
  raizEscena.add(resaltador.borde);
  const animador = new Animador(raizEscena, viva, () => reloj.ms);

  const clase = (await fetch(`${base}clases/terminal-contenedores.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as Clase | null;
  const pasosClase = clase?.pasos ?? [];
  const fichas = new Map<string, Ficha>();
  await Promise.all(
    [...new Set(pasosClase.map((p) => p.ficha).filter((f): f is string => !!f))].map(async (id) => {
      const f = await cargarFicha(id);
      if (f) fichas.set(id, f);
    }),
  );

  const lugarPaso = (vista: string) => (vistas[vista] ? lugarDeVista(vista, vistas[vista]) : undefined);

  // Clase completa: los mismos pasos que da el docente, en orden.
  const pasosCompletos: Paso[] = pasosClase.map((p) => ({
    titulo: p.titulo,
    texto: textoFicha(p.ficha ? fichas.get(p.ficha) : undefined, p.titulo),
    lugar: lugarPaso(p.vista),
    al: () => {
      resaltador.resaltar(p.resaltar[0] ?? null);
      reloj.lanzar(p.animacion as IdAnimacion | undefined);
    },
  }));
  const escenas: EscenaGuiada[] = [];
  if (pasosCompletos.length) {
    const primero = pasosClase[0];
    escenas.push({
      id: 'clase',
      titulo: clase!.titulo,
      resumen: `La clase completa, en ${pasosCompletos.length} pasos`,
      preparar: () => lugarPaso(primero.vista) ?? lugarDeVista('general', vistas.general ?? { pos: [215, 230, 135], mira: [215, 0, -75] }),
      pasos: pasosCompletos,
    });
  }

  // Una escena por animación: la mirás, la repetís y la mirás desde otro lado.
  const OTRA_VISTA: Partial<Record<IdAnimacion, string>> = { atraque: 'pata-sts-2', 'descarga-ciclo': 'sobre-patio', recorrido: 'sobre-patio', salida: 'cenital' };
  for (const p of pasosClase) {
    if (!p.animacion) continue;
    const id = p.animacion as IdAnimacion;
    const f = p.ficha ? fichas.get(p.ficha) : undefined;
    const otra = OTRA_VISTA[id];
    const repetir = () => {
      resaltador.resaltar(p.resaltar[0] ?? null);
      reloj.lanzar(id);
    };
    escenas.push({
      id: `anim-${p.id}`,
      titulo: p.titulo,
      resumen: f?.texto.split('.')[0] ?? p.titulo,
      preparar: () => lugarPaso(p.vista) ?? lugarDeVista('general', vistas.general),
      pasos: [
        { titulo: p.titulo, texto: f?.texto ?? p.titulo, al: repetir },
        ...(f?.datos.length ? [{ titulo: 'Datos', texto: f.datos.map((d) => `${d.etiqueta}: ${d.valor}.`).join(' ') }] : []),
        ...(otra && vistas[otra]
          ? [{ titulo: 'Desde otro lugar', texto: 'La misma animación, desde otro punto de vista. Con el menú (gatillo izquierdo) podés pausarla, ir más lento o volver al inicio.', lugar: lugarDeVista(otra, vistas[otra]), al: repetir }]
          : []),
      ],
    });
  }

  const lugares = Object.entries(vistas).map(([id, v]) => lugarDeVista(id, v));
  const menu: ConfigMenu = {
    tiempo: reloj,
    escenas,
    lugares,
    opciones: [
      {
        id: 'detener',
        texto: () => 'Detener la animación',
        accion: () => {
          reloj.lanzar(undefined);
          resaltador.resaltar(null);
        },
      },
    ],
  };

  // Estado mínimo que entiende el Animador (el mismo formato que manda la sala en la clase guiada).
  const estado = { escena, animacion: null as { id: string; inicio: number } | null } as unknown as EstadoSala;
  const cuadro = (dt: number) => {
    reloj.avanzar(dt);
    (estado as { animacion: unknown }).animacion = reloj.animacion;
    animador.cuadro(dt, estado);
    resaltador.actualizar(dt);
  };
  return { menu, reloj, resaltador, animador, cuadro };
}
