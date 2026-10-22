// Vista provisoria del alumno: entrada + vista doble sobre una escena de prueba
// con los modelos de /modelos/prueba/. Las tareas siguientes la reemplazan por la escena real.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { estadoEntrada, mostrarEntrada } from './entrada';
import { mostrarError } from './errorVista';
import { VistaEstereo } from './estereo';
import { OrientacionAlumno } from './orientacion';

function crearEscena(): THREE.Scene {
  const escena = new THREE.Scene();
  escena.background = new THREE.Color('#cfdde8');
  escena.fog = new THREE.Fog('#cfdde8', 380, 1200);

  escena.add(new THREE.HemisphereLight('#eef4ff', '#857a6c', 1.5));
  const sol = new THREE.DirectionalLight('#fff2dc', 2.8);
  sol.position.set(-170, 230, 150);
  escena.add(sol);

  const material = (color: string, rugosidad = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rugosidad });
  const caja = (ancho: number, alto: number, largo: number, color: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, largo), material(color));
    m.position.set(x, y, z);
    escena.add(m);
  };

  const agua = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ color: '#3d6c8c', roughness: 0.3, metalness: 0.1 }),
  );
  agua.rotation.x = -Math.PI / 2;
  escena.add(agua);
  caja(700, 3, 263, '#b9bdc1', 0, 1.5, -128.5); // muelle
  caja(150, 0.05, 40, '#8d939a', 0, 3.02, -66); // pavimento del patio
  caja(700, 0.06, 0.5, '#e2b21a', 0, 3.03, 2.4); // borde del muelle

  const cargador = new GLTFLoader();
  const cargar = (archivo: string) =>
    new Promise<THREE.Object3D>((ok, fallo) =>
      cargador.load(`/modelos/prueba/${archivo}`, (g) => ok(g.scene), undefined, fallo),
    );
  const poner = (obj: THREE.Object3D, x: number, y: number, z: number) => {
    obj.position.set(x, y, z);
    escena.add(obj);
  };
  Promise.all(['sts.glb', 'patio.glb', 'buque.glb', 'tractor.glb'].map(cargar))
    .then(([sts, patio, buque, tractor]) => {
      for (const x of [-70, 0, 70]) poner(x === -70 ? sts : sts.clone(), x, 3, 0);
      poner(buque, -100, 0, 22);
      poner(patio, -65, 3, -58);
      poner(tractor, -3, 3, -15);
      poner(tractor.clone(), 25, 3, -54.5);
    })
    .catch((e) => console.warn('No se pudieron cargar los modelos de prueba', e));
  return escena;
}

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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(ancho(), alto(), false);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  app.append(renderer.domElement);

  const escena = crearEscena();
  const cabeza = new THREE.PerspectiveCamera(80, ancho() / 2 / alto(), 0.1, 3000);
  cabeza.position.set(36, 4.7, -14);
  const vista = new VistaEstereo(renderer);

  const reticulas = crearReticulas();
  app.append(reticulas);

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
  };
  addEventListener('resize', ajustar);
  ajustar();

  // Tocar la pantalla (o el botón del Cardboard) recentra.
  addEventListener('pointerdown', () => orientacion.recentrar());

  renderer.setAnimationLoop(() => {
    try {
      const [x, y, z, w] = orientacion.quat();
      cabeza.quaternion.set(x, y, z, w);
      vista.render(escena, cabeza);
    } catch (e) {
      renderer.setAnimationLoop(null);
      console.error('Falló el dibujado', e);
      mostrarError(app);
    }
  });
}
