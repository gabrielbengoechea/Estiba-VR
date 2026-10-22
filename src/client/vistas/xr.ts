// Sesión WebXR del docente en el Quest 3. Solo para el rol docente y solo si el navegador soporta immersive-vr.
// Usa el mismo renderer y escena que la vista de escritorio; manda pose de cabeza y rayo (20/s, lo limita ConexionSala).
import * as THREE from 'three';
import type { Vec3 } from '../../shared/tipos';
import type { ConexionSala } from '../red';
import type { EscenaViva } from '../escena/construirEscena';
import { Puntero } from '../docente/puntero';
import { BOTON_A, BOTON_B, DetectorFlanco, Gatillo, empaquetarPose, poseMundo } from '../docente/logicaXR';

const LARGO_RAYO = 6;
const IND_GATILLO = 0;

/**
 * Agrega el botón «Entrar en VR» si el visor lo soporta. Devuelve una función que la vista llama en cada cuadro
 * (no hace nada fuera de la sesión) y que manda la pose y atiende gatillo, A y B.
 */
export function iniciarXR(
  renderer: THREE.WebGLRenderer,
  escena: THREE.Scene,
  conexion: ConexionSala,
  viva: EscenaViva,
  camara: THREE.PerspectiveCamera,
): () => void {
  const puntero = new Puntero(viva, escena);
  const dolly = new THREE.Group();
  escena.add(dolly);
  const flancoA = new DetectorFlanco();
  const flancoB = new DetectorFlanco();
  const gatillo = new Gatillo();
  const fuentes = new Map<number, XRInputSource>();
  let derecho = -1;

  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const linea = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -LARGO_RAYO)]),
      new THREE.LineBasicMaterial({ color: 0x2f6fdb }),
    );
    linea.raycast = () => undefined;
    ctrl.add(linea);
    ctrl.addEventListener('connected', (ev) => {
      const fuente = (ev as unknown as { data: XRInputSource }).data;
      fuentes.set(i, fuente);
      if (fuente.handedness === 'right') derecho = i;
    });
    ctrl.addEventListener('disconnected', () => {
      fuentes.delete(i);
      if (derecho === i) derecho = -1;
    });
    dolly.add(ctrl);
  }

  const boton = document.createElement('button');
  boton.textContent = 'Entrar en VR';
  boton.style.cssText =
    'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:20;padding:18px 36px;' +
    'font:700 28px system-ui,sans-serif;color:#fff;background:#2f6fdb;border:0;border-radius:16px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.4);cursor:pointer;display:none';
  document.body.append(boton);

  let sesion: XRSession | null = null;
  const guardada = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

  const alTerminar = () => {
    sesion = null;
    dolly.remove(camara);
    camara.position.copy(guardada.pos);
    camara.quaternion.copy(guardada.quat);
    boton.textContent = 'Entrar en VR';
    boton.style.display = 'block';
  };

  boton.addEventListener('click', async () => {
    if (sesion) return;
    boton.disabled = true;
    // Se guarda antes de pedir la sesión; si falla, la cámara de escritorio no se toca.
    guardada.pos.copy(camara.position);
    guardada.quat.copy(camara.quaternion);
    let iniciada = false;
    try {
      const s = await navigator.xr!.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      sesion = s;
      iniciada = true;
      // El docente entra parado en el piso, justo debajo de donde estaba su cámara de escritorio.
      dolly.position.set(camara.position.x, 0, camara.position.z);
      dolly.add(camara);
      camara.position.set(0, 0, 0);
      camara.quaternion.identity();
      s.addEventListener('end', alTerminar);
      await renderer.xr.setSession(s);
      boton.style.display = 'none';
    } catch (err) {
      console.error('No se pudo iniciar la sesión de VR', err);
      if (iniciada) alTerminar();
      boton.textContent = 'No se pudo entrar en VR.';
    } finally {
      boton.disabled = false;
    }
  });

  navigator.xr?.isSessionSupported('immersive-vr')
    .then((ok) => { if (ok) boton.style.display = 'block'; })
    .catch(() => undefined);

  const quatCtrl = new THREE.Quaternion();
  const origen = new THREE.Vector3();
  const dir = new THREE.Vector3();

  return () => {
    if (!renderer.xr.isPresenting) return;

    // La cámara XR no tiene padre: su matriz es local al piso; se compone a mano con la del dolly.
    dolly.updateMatrixWorld();
    const cabeza = poseMundo(dolly.matrixWorld.elements, renderer.xr.getCamera().matrix.elements);

    let o: Vec3 | null = null;
    let d: Vec3 | null = null;
    const ctrl = derecho >= 0 ? renderer.xr.getController(derecho) : null;
    if (ctrl) {
      ctrl.getWorldPosition(origen);
      dir.set(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(quatCtrl));
      o = [origen.x, origen.y, origen.z];
      d = [dir.x, dir.y, dir.z];
    }
    conexion.enviarPose(empaquetarPose(cabeza.pos, cabeza.quat, o, d));

    const botones = fuentes.get(derecho)?.gamepad?.buttons;
    if (!botones) return;
    if (flancoA.actualizar(!!botones[BOTON_A]?.pressed)) conexion.enviar({ t: 'siguiente' });
    if (flancoB.actualizar(!!botones[BOTON_B]?.pressed)) conexion.enviar({ t: 'anterior' });

    const accion = gatillo.actualizar(!!botones[IND_GATILLO]?.pressed, performance.now());
    if (accion && o && d) {
      if (accion === 'resaltar') {
        conexion.enviar({ t: 'resaltar', id: puntero.intersectar(o, d)?.moduloId ?? null });
      } else {
        const p = puntero.punto(o, d);
        if (p) conexion.enviar({ t: 'mirenAca', pos: p });
      }
    }
  };
}
