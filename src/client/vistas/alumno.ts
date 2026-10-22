// Vista del alumno: entrada + vista doble sobre la escena de la sala.
import * as THREE from 'three';
import type { EstadoSala } from '../../shared/tipos';
import { configurarRenderer, crearAmbiente, habilitarSombras } from '../escena/ambiente';
import { EscenaViva } from '../escena/construirEscena';
import { Animador } from '../clase/animaciones';
import { GestorFichas } from '../clase/fichas';
import { Reproductor } from '../clase/reproductor';
import { estadoEntrada, mostrarEntrada } from './entrada';
import { mostrarError } from './errorVista';
import { VistaEstereo } from './estereo';
import { ConexionSala, type PoseServidor } from '../red';
import { MedidorFps } from './medidorFps';
import { OrientacionAlumno } from './orientacion';

const ancho = () => document.documentElement.clientWidth;
const alto = () => document.documentElement.clientHeight;

function crearReticulas(): HTMLElement {
  const capa = document.createElement('div');
  for (const izq of ['25%', '75%']) {
    const r = document.createElement('div');
    r.style.cssText =
      `position:fixed;top:50%;left:${izq};width:12px;height:12px;margin:-6px 0 0 -6px;` +
      'border:2.5px solid #fff;border-radius:50%;box-sizing:border-box;pointer-events:none';
    capa.append(r);
  }
  return capa;
}

const VERDE = '#3ddc84';
const ROJO = '#ff5252';

interface Indicadores {
  capa: HTMLElement;
  conexion(conectado: boolean): void;
  fps(valor: number): void;
}

/** Por ojo: punto de conexión y, si se pidió, número de fps. Arriba, lejos de la retícula. */
function crearIndicadores(mostrarFps: boolean): Indicadores {
  const capa = document.createElement('div');
  const puntos: HTMLElement[] = [];
  const numeros: HTMLElement[] = [];
  for (const izq of ['25%', '75%']) {
    const grupo = document.createElement('div');
    grupo.style.cssText =
      `position:fixed;top:3%;left:${izq};transform:translateX(-50%);display:flex;align-items:center;gap:12px;` +
      'pointer-events:none;font:700 40px/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000';
    const punto = document.createElement('div');
    punto.style.cssText = 'width:40px;height:40px;border-radius:50%;border:3px solid #fff;box-sizing:border-box';
    punto.style.background = ROJO;
    punto.title = 'sin conexión';
    grupo.append(punto);
    puntos.push(punto);
    if (mostrarFps) {
      const n = document.createElement('span');
      grupo.append(n);
      numeros.push(n);
    }
    capa.append(grupo);
  }
  return {
    capa,
    conexion(c) {
      for (const p of puntos) {
        p.style.background = c ? VERDE : ROJO;
        p.title = c ? 'conectado' : 'sin conexión';
      }
    },
    fps(v) {
      for (const n of numeros) n.textContent = String(v);
    },
  };
}

/** Cartel semitransparente en el tercio inferior, una copia centrada en cada ojo; la escena sigue visible. */
function mostrarMotivo(app: HTMLElement, motivo: string): void {
  app.querySelector('[data-motivo]')?.remove();
  const capa = document.createElement('div');
  capa.dataset.motivo = '1';
  capa.setAttribute('role', 'alert');
  for (const izq of ['25%', '75%']) {
    const c = document.createElement('div');
    c.style.cssText =
      `position:fixed;bottom:3%;left:${izq};transform:translateX(-50%);width:46%;box-sizing:border-box;z-index:20;` +
      'padding:10px 14px;text-align:center;font:600 40px/1.15 system-ui,sans-serif;color:#fff;' +
      'background:rgba(14,18,22,0.72);border-radius:12px;pointer-events:none';
    c.textContent = motivo;
    capa.append(c);
  }
  app.append(capa);
}

function conectarSala(app: HTMLElement, indicadores: Indicadores, alEstado: (e: EstadoSala) => void, alPose?: (p: PoseServidor) => void): ConexionSala | null {
  const sala = new URLSearchParams(location.search).get('sala') ?? '';
  try {
    const conexion = new ConexionSala(sala, 'alumno');
    conexion.alEstado(alEstado);
    if (alPose) conexion.alPose(alPose);
    conexion.alCambioConexion((c) => indicadores.conexion(c));
    conexion.alError((motivo) => {
      indicadores.conexion(false);
      mostrarMotivo(app, motivo);
    });
    return conexion;
  } catch (e) {
    console.warn('No se pudo abrir la conexión con la sala', e); // la escena sigue sin conexión
    return null;
  }
}

export function iniciarAlumno(app: HTMLElement): void {
  app.textContent = '';
  app.style.display = 'block';
  mostrarEntrada(app, () => {
    iniciarVistaDoble(app).catch((e) => {
      console.error('Falló la vista doble', e);
      mostrarError(app);
    });
  });
}

async function iniciarVistaDoble(app: HTMLElement): Promise<void> {
  const orientacion = new OrientacionAlumno();
  await orientacion.pedirPermiso(); // ya concedido en la entrada: solo engancha el sensor

  const renderer = new THREE.WebGLRenderer({ antialias: true }); // lanza si no hay WebGL
  configurarRenderer(renderer);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(ancho(), alto(), false);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  app.append(renderer.domElement);

  const escena = new THREE.Scene();
  crearAmbiente(escena, { mapaSombra: 1024 }); // celular: mapa de sombra más chico
  // La sombra se calcula una vez por cuadro (no una por ojo); ver el bucle.
  renderer.shadowMap.autoUpdate = false;
  const viva = new EscenaViva();
  escena.add(viva.raiz);
  const cabeza = new THREE.PerspectiveCamera(80, ancho() / 2 / alto(), 0.1, 3000);
  let escenaJson = '';
  const vista = new VistaEstereo(renderer);

  // El reproductor mueve la cámara (con fundido), compone el giroscopio y dibuja resaltado, aro, flecha y etiquetas.
  const fichas = new GestorFichas(escena, viva, cabeza, 'visor');
  // Sin conexión no hay reloj del servidor: el reloj local sirve (no hay animación que sincronizar).
  let ahoraServidor = () => Date.now();
  const animador = new Animador(escena, viva, () => ahoraServidor(), () => fichas.explotando);
  const reproductor = new Reproductor({
    escena, viva, camara: cabeza, alumno: { app, orientacion },
    alCambiarFicha: (id) => fichas.abrir(id),
    alCuadro: (dt, e) => { fichas.cuadro(dt, e); animador.cuadro(dt, e); },
  });

  // Para depurar desde la consola: ?debug=1
  if (new URLSearchParams(location.search).get('debug') === '1') {
    (window as unknown as { __estiba: unknown }).__estiba = { reproductor, camara: cabeza, viva, fichas };
  }

  const reticulas = crearReticulas();
  app.append(reticulas);

  const mostrarFps = new URLSearchParams(location.search).get('fps') === '1';
  const indicadores = crearIndicadores(mostrarFps);
  app.append(indicadores.capa);
  const conexion = conectarSala(app, indicadores, (e) => {
    const json = JSON.stringify(e.escena);
    if (json !== escenaJson) {
      escenaJson = json;
      viva.aplicar(e.escena).then(() => habilitarSombras(viva.raiz)).catch((err) => console.error('No se pudo aplicar la escena', err));
    }
    reproductor.aplicar(e);
  }, (p) => reproductor.recibirPose(p));
  if (conexion) ahoraServidor = () => conexion.reloj.ahoraServidor();
  const medidor = new MedidorFps();
  let ultimoNumero = -Infinity;

  // Mensaje claro (nunca pantalla negra) si el celular está en vertical.
  const aviso = document.createElement('div');
  aviso.style.cssText =
    'position:fixed;inset:0;z-index:5;display:none;align-items:center;justify-content:center;' +
    'padding:24px;text-align:center;font:600 28px system-ui,sans-serif;background:#0e1216;color:#eef0f2';
  app.append(aviso);

  const ajustar = () => {
    renderer.setSize(ancho(), alto(), false);
    const estado = estadoEntrada('concedido', alto() > ancho());
    aviso.textContent = estado.mensaje;
    aviso.style.display = estado.listo ? 'none' : 'flex';
    reticulas.style.display = estado.listo ? 'block' : 'none';
    indicadores.capa.style.display = estado.listo ? 'block' : 'none';
  };
  addEventListener('resize', ajustar);
  ajustar();

  // Tocar la pantalla (o el botón del Cardboard) recentra.
  const simular = new URLSearchParams(location.search).get('simular') === '1';
  if (simular) simularGiroscopio(orientacion);
  else addEventListener('pointerdown', () => orientacion.recentrar());

  let tAnterior = -1;
  renderer.setAnimationLoop((t: number) => {
    try {
      const dt = tAnterior < 0 ? 0 : Math.min((t - tAnterior) / 1000, 0.1);
      tAnterior = t;
      if (mostrarFps) {
        medidor.cuadro(t);
        if (t - ultimoNumero >= 500) {
          ultimoNumero = t;
          indicadores.fps(medidor.fps());
        }
      }
      reproductor.cuadro(dt);
      renderer.shadowMap.needsUpdate = true; // lo consume el primer ojo; el segundo reutiliza el mapa
      vista.render(escena, cabeza);
    } catch (e) {
      renderer.setAnimationLoop(null);
      console.error('Falló el dibujado', e);
      mostrarError(app);
    }
  });
}

/**
 * Solo para probar en escritorio (`?simular=1`): arrastrar con el mouse hace de giroscopio y la tecla R recentra.
 * Manda eventos `deviceorientation` reales, así que se usa el mismo camino que un celular.
 */
function simularGiroscopio(orientacion: OrientacionAlumno): void {
  let alpha = 0;
  let beta = 90; // celular parado, mirando al frente
  const mandar = () =>
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha, beta, gamma: 0 }));
  mandar();
  addEventListener('pointermove', (ev) => {
    if (ev.buttons !== 1) return;
    alpha = (alpha - ev.movementX * 0.3 + 360) % 360;
    beta = Math.min(170, Math.max(10, beta - ev.movementY * 0.3));
    mandar();
  });
  addEventListener('keydown', (ev) => {
    if (ev.key === 'r' || ev.key === 'R') orientacion.recentrar();
  });
}
