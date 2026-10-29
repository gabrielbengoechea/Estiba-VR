// Exploración libre de la terminal, sin servidor ni docente: cada alumno recorre la escena a su ritmo.
// En el Meta Quest: tutorial ilustrado, caminata con colisiones, teletransporte y fichas con el gatillo.
// En la computadora: vista orbital o «a pie» con las mismas colisiones. Es la portada cuando no hay sala.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import type { Escena, Ficha, TipoModulo } from '../../shared/tipos';
import { CERCA, LEJOS, configurarRenderer, crearAmbiente, habilitarSombras, moduloDe } from '../escena/ambiente';
import { EscenaViva } from '../escena/construirEscena';
import { cargarFicha } from '../clase/fichas';
import { CaminataEscritorio } from '../vr/escritorio';
import { Jugador } from '../vr/jugador';
import { BOTON } from '../vr/locomocion';
import { MundoColision } from '../vr/mundo';
import { RecorridoVR, type ConfigRecorrido } from '../vr/recorrido';
import { tarjetaResumen, tarjetasControles, type Tarjeta } from '../vr/tarjetas';
import { mostrarPortada } from '../vr/tutorial';
import { menuEstiba } from './escenasEstiba';

const BASE = import.meta.env.BASE_URL;

/** Qué ficha abre cada tipo de módulo al apuntarlo. */
export const FICHA_DE_TIPO: Partial<Record<TipoModulo, string>> = {
  'grua-sts': 'grua-sts',
  'grua-rtg': 'bloque-patio',
  'bloque-patio': 'bloque-patio',
  buque: 'buque-portacontenedores',
  muelle: 'descarga',
  tractor: 'recorrido-contenedor',
  puerta: 'puerta-y-tren',
  via: 'puerta-y-tren',
  tren: 'puerta-y-tren',
};

const portada: Tarjeta = {
  portada: true,
  etiqueta: 'Estiba · Exploración libre',
  titulo: 'Bienvenido a la terminal',
  texto: 'Vas a recorrer a pie una terminal de contenedores: muelle, buque, grúas, patio y la puerta con el tren.',
  items: [
    'Caminá entre las patas de las grúas pórtico y los bloques del patio',
    'Apuntá a una grúa, al buque, al patio o al tren y apretá el gatillo para ver su ficha',
    'Con el teletransporte podés subir a la cubierta del buque',
    'Con el gatillo izquierdo abrís el menú: escenas guiadas (atraque, descarga, patio, tren), lugares y el reloj de las animaciones',
  ],
};
const pantalla: Tarjeta = {
  etiqueta: 'Sin visor',
  titulo: 'En la computadora',
  texto:
    'Arrastrá para girar la vista y hacé click en una pieza para ver su ficha.\n\nBotón «A pie»: recorré la terminal en primera persona con W A S D o flechas (Shift para correr). Esc para volver.',
};
const controles = tarjetasControles(
  'Apuntá con el control derecho a una grúa, al buque, a un bloque del patio o al tren y apretá el gatillo: aparece su ficha con los datos.\n\nApretá el gatillo en el cielo o en el agua para cerrarla.',
);
const TARJETAS: Tarjeta[] = [portada, ...controles, tarjetaResumen('ficha de lo que apuntás')];
const TARJETAS_PANTALLA: Tarjeta[] = [portada, pantalla, ...controles, tarjetaResumen('ficha de lo que apuntás')];

function boton(texto: string, titulo: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.title = titulo;
  b.setAttribute('aria-label', titulo);
  b.style.cssText =
    'font:600 15px/1 system-ui,sans-serif;padding:11px 14px;border-radius:12px;cursor:pointer;border:1px solid #3b4a5e;' +
    'background:rgba(11,22,36,.82);color:#f2f6fa;backdrop-filter:blur(6px)';
  return b;
}

/** Arma la vista de exploración dentro de `app`. */
export async function iniciarExplorar(app: HTMLElement): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  configurarRenderer(renderer);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(1);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';

  const escena = new THREE.Scene();
  crearAmbiente(escena);
  const viva = new EscenaViva();
  escena.add(viva.raiz);
  const sol = escena.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight);

  // La cámara va dentro de un «rig»: en el visor se mueve el rig (teletransporte, giro) y la cabeza dentro de él.
  const rig = new THREE.Group();
  const camara = new THREE.PerspectiveCamera(55, 1, CERCA, LEJOS);
  rig.add(camara);
  escena.add(rig);

  app.textContent = '';
  app.style.display = 'block';
  app.append(renderer.domElement);
  const ajustar = () => {
    const w = app.clientWidth || innerWidth;
    const h = app.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  };
  ajustar();
  addEventListener('resize', ajustar);

  // Escena de la terminal (la misma que usa la clase guiada)
  const datos = (await fetch(`${BASE}escenas/terminal-a.json`).then((r) => r.json())) as Escena & {
    vistas?: Record<string, { pos: [number, number, number]; mira: [number, number, number] }>;
  };
  await viva.aplicar(datos);
  habilitarSombras(viva.raiz);
  const tipoDe = new Map(datos.modulos.map((m) => [m.id, m.tipo]));

  type Vista = { pos: [number, number, number]; mira: [number, number, number] };
  const general: Vista = datos.vistas?.general ?? { pos: [215, 230, 135], mira: [215, 0, -75] };
  camara.position.set(...general.pos);
  const orbita = new OrbitControls(camara, renderer.domElement);
  orbita.target.set(...general.mira);
  orbita.enableDamping = true;
  orbita.maxPolarAngle = 1.5;
  orbita.update();

  // Punto de partida: a nivel del piso junto a la pata de una grúa, mirando hacia el buque.
  const pata: Vista = datos.vistas?.['pata-sts-2'] ?? { pos: [205, 1.7, -24], mira: [172, 24, 2] };
  const inicio = new THREE.Vector3(pata.pos[0], 0, pata.pos[2]);
  const yaw = Math.atan2(-(pata.mira[0] - pata.pos[0]), -(pata.mira[2] - pata.pos[2]));
  const caja = new THREE.Box3().setFromObject(viva.raiz).expandByScalar(40);
  caja.min.y = -10;
  caja.max.y = Math.max(caja.max.y, 90);
  const suelo = escena.getObjectByName('suelo');
  // Menú del control izquierdo: escenas guiadas con las animaciones de la clase, lugares y reloj de las animaciones.
  const extra = await menuEstiba({ base: BASE, escena: datos, viva, raizEscena: escena });
  const config: ConfigRecorrido = {
    tarjetas: TARJETAS,
    inicio: { pos: inicio, yaw },
    limites: caja,
    // El agua queda afuera: si alguien cae del muelle, vuelve al último lugar firme.
    colisionables: () => [viva.raiz, ...(suelo ? [suelo] : [])],
    velocidad: 2.6,
    menu: extra.menu,
  };

  // ---------- Visor ----------
  const recorrido = new RecorridoVR(renderer, escena, rig, camara, config);
  const fabrica = new XRControllerModelFactory();
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const linea = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -6)]),
      new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.8 }),
    );
    linea.raycast = () => undefined;
    ctrl.add(linea);
    const agarre = renderer.xr.getControllerGrip(i);
    agarre.add(fabrica.createControllerModel(agarre));
    rig.add(ctrl, agarre);
  }
  const rayo = new THREE.Raycaster();
  const fichaAbierta = { id: '' };

  async function mostrarFicha(idFicha: string | null) {
    fichaAbierta.id = idFicha ?? '';
    if (!idFicha) {
      recorrido.ficha.ocultar();
      panelFicha.hidden = true;
      return;
    }
    const f = await cargarFicha(idFicha);
    if (!f || fichaAbierta.id !== idFicha) return;
    const lineas = [f.texto, ...f.datos.map((d) => `${d.etiqueta}\t${d.valor}`)];
    if (renderer.xr.isPresenting) recorrido.ficha.mostrar(camara, f.titulo, partir(lineas), 'Ficha');
    else mostrarFichaHtml(f);
  }

  /** El texto largo de la ficha se parte en renglones para el panel del visor. */
  function partir(lineas: string[]): string[] {
    const out: string[] = [];
    for (const l of lineas) {
      if (l.includes('\t') || l.length < 58) { out.push(l); continue; }
      let r = '';
      for (const p of l.split(' ')) {
        if ((r + ' ' + p).length > 58) { out.push(r); r = p; } else r = r ? `${r} ${p}` : p;
      }
      if (r) out.push(r);
    }
    return out;
  }

  function seleccionar(hit: THREE.Intersection | undefined) {
    const id = hit ? moduloDe(hit.object) : null;
    const tipo = id ? tipoDe.get(id) : undefined;
    void mostrarFicha(tipo ? FICHA_DE_TIPO[tipo] ?? null : null);
  }

  let sombrasAntes = true;
  renderer.xr.addEventListener('sessionstart', () => {
    orbita.enabled = false;
    modoAPie(false);
    // En el Quest 2: sin sombras dinámicas para sostener 72 cuadros por segundo.
    sombrasAntes = !!sol?.castShadow;
    if (sol) sol.castShadow = false;
    camara.near = 0.08;
    const sesion = renderer.xr.getSession();
    if (sesion?.supportedFrameRates?.includes(72)) void sesion.updateTargetFrameRate?.(72).catch(() => undefined);
    recorrido.iniciar();
    barra.hidden = true;
  });
  renderer.xr.addEventListener('sessionend', () => {
    recorrido.terminar();
    void mostrarFicha(null);
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    camara.near = CERCA;
    camara.position.set(...general.pos);
    camara.quaternion.identity();
    orbita.enabled = true;
    orbita.update();
    if (sol) sol.castShadow = sombrasAntes;
    barra.hidden = false;
  });

  // ---------- A pie en la pantalla ----------
  let caminata: CaminataEscritorio | null = null;
  let mundoAPie: MundoColision | null = null;
  function modoAPie(activo: boolean) {
    if (activo && !caminata) {
      if (!mundoAPie) mundoAPie = new MundoColision().construir(config.colisionables(), { limites: config.limites });
      const j = new Jugador(mundoAPie);
      j.ubicar(inicio);
      caminata = new CaminataEscritorio(j, camara, renderer.domElement);
      caminata.yaw = yaw;
      caminata.velocidad = 2.6;
      caminata.conectar();
      orbita.enabled = false;
      camara.near = 0.08;
      camara.fov = 70;
      camara.updateProjectionMatrix();
    } else if (!activo && caminata) {
      caminata.desconectar();
      caminata = null;
      camara.near = CERCA;
      camara.fov = 55;
      camara.position.set(...general.pos);
      camara.updateProjectionMatrix();
      orbita.enabled = true;
      orbita.target.set(...general.mira);
      orbita.update();
    }
    btnPie.setAttribute('aria-pressed', String(activo));
    btnPie.style.borderColor = activo ? '#ffb547' : '#3b4a5e';
    aviso.hidden = !activo;
  }
  addEventListener('keydown', (e) => e.key === 'Escape' && caminata && modoAPie(false));

  // Click (sin arrastrar) en una pieza: ficha
  let abajo: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (abajo = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!abajo || Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    rayo.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camara);
    seleccionar(rayo.intersectObject(viva.raiz, true)[0]);
  });

  // ---------- Interfaz ----------
  const barra = document.createElement('div');
  barra.style.cssText =
    'position:fixed;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;z-index:10';
  const soportaVR = await (navigator.xr?.isSessionSupported('immersive-vr').catch(() => false) ?? Promise.resolve(false));
  const entrarVR = async () => {
    try {
      const sesion = await navigator.xr!.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await renderer.xr.setSession(sesion);
    } catch (e) {
      console.error('No se pudo entrar en VR', e);
    }
  };
  if (soportaVR) {
    const b = boton('Entrar en VR', 'Entrar en VR (Meta Quest)');
    b.style.background = '#ffb547';
    b.style.color = '#1b1204';
    b.style.borderColor = '#ffb547';
    b.onclick = () => void entrarVR();
    barra.append(b);
  }
  const btnPie = boton('A pie', 'Recorrer a pie');
  btnPie.onclick = () => modoAPie(!caminata);
  const btnAyuda = boton('?', 'Ver el tutorial');
  btnAyuda.onclick = () => abrirPortada();
  barra.append(btnPie, btnAyuda);

  const aviso = document.createElement('div');
  aviso.hidden = true;
  aviso.style.cssText =
    'position:fixed;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom));z-index:10;max-width:calc(100% - 32px);' +
    'padding:10px 14px;border-radius:12px;background:rgba(11,22,36,.85);color:#f2f6fa;font:14px/1.35 system-ui,sans-serif;text-align:center';
  aviso.innerHTML = '<b>A pie:</b> W A S D o flechas para caminar · Shift para correr · arrastrá para mirar · Esc para salir';

  const panelFicha = document.createElement('aside');
  panelFicha.hidden = true;
  panelFicha.style.cssText =
    'position:fixed;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));z-index:10;width:min(360px,calc(100% - 24px));' +
    'padding:16px 18px;border-radius:14px;background:rgba(11,22,36,.9);color:#f2f6fa;font:14px/1.45 system-ui,sans-serif;border:1px solid rgba(255,181,71,.6)';
  function mostrarFichaHtml(f: Ficha) {
    panelFicha.textContent = '';
    const h = document.createElement('h2');
    h.textContent = f.titulo;
    h.style.cssText = 'margin:0 0 6px;font-size:20px';
    const p = document.createElement('p');
    p.textContent = f.texto;
    p.style.margin = '0 0 10px';
    const dl = document.createElement('dl');
    dl.style.cssText = 'margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px';
    for (const d of f.datos) {
      const dt = document.createElement('dt');
      dt.textContent = d.etiqueta;
      dt.style.color = '#9fb3c8';
      const dd = document.createElement('dd');
      dd.textContent = d.valor;
      dd.style.cssText = 'margin:0;text-align:right;font-weight:600';
      dl.append(dt, dd);
    }
    const cerrar = boton('Cerrar', 'Cerrar la ficha');
    cerrar.style.marginTop = '12px';
    cerrar.onclick = () => void mostrarFicha(null);
    panelFicha.append(h, p, dl, cerrar);
    panelFicha.hidden = false;
  }
  document.body.append(barra, aviso, panelFicha);

  const abrirPortada = () =>
    mostrarPortada({ titulo: 'Estiba', tarjetas: TARJETAS_PANTALLA, entrarVR: soportaVR ? () => void entrarVR() : undefined, textoPantalla: 'Explorar en la pantalla' });
  abrirPortada();

  if (new URLSearchParams(location.search).get('debug') === '1') Object.assign(window, { __vr: { recorrido, escena, camara, rig, modoAPie, extra, get caminata() { return caminata; } } });

  // ---------- Bucle ----------
  const reloj = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(reloj.getDelta(), 0.1);
    if (renderer.xr.isPresenting) {
      const mandos = recorrido.actualizar(dt);
      if (!recorrido.enTutorial) {
        // Solo el gatillo derecho selecciona (el izquierdo abre el menú), y no cuando apretó un botón del menú o la guía.
        const der = mandos.find((m) => m.mano === 'right');
        if (der?.flanco[BOTON.gatillo] && !recorrido.gatilloConsumido) {
          const r = recorrido.rayo('right');
          if (r) {
            rayo.set(r.origin, r.direction);
            rayo.far = 80;
            seleccionar(rayo.intersectObject(viva.raiz, true)[0]);
          }
        }
      }
    } else if (caminata) caminata.actualizar(dt);
    else orbita.update();
    extra.cuadro(dt);
    renderer.render(escena, camara);
  });
}
