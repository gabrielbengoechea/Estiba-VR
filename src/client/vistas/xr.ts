// Sesión WebXR del docente en el Quest 3. Solo para el rol docente y solo si el navegador soporta immersive-vr.
// Usa el mismo renderer y escena que la vista de escritorio; manda pose de cabeza y rayo (20/s, lo limita ConexionSala).
// Además del puntero lleva el menú de muñeca (control izquierdo) y el cambio a la maqueta AR (immersive-ar).
import * as THREE from 'three';
import type { EstadoSala, Vec3 } from '../../shared/tipos';
import type { ConexionSala } from '../red';
import type { EscenaViva } from '../escena/construirEscena';
import { Puntero } from '../docente/puntero';
import { BOTON_A, BOTON_B, DetectorFlanco, Gatillo, empaquetarPose, poseMundo } from '../docente/logicaXR';
import { accionDeBoton, enrutarGatillo } from '../docente/logicaMenu';
import { MenuMuneca } from '../docente/menuMuneca';
import { iniciarAR, soportaAR } from './ar';

const LARGO_RAYO = 6;
const IND_GATILLO = 0;

type ModoSesion = 'vr' | 'ar';

/**
 * Agrega el botón «Entrar en VR» (y «Maqueta en la mesa (AR)» si el visor lo soporta). Devuelve una función que la vista
 * llama en cada cuadro (no hace nada fuera de la sesión) y que manda la pose y atiende gatillo, A, B y el menú de muñeca.
 */
export function iniciarXR(
  renderer: THREE.WebGLRenderer,
  escena: THREE.Scene,
  conexion: ConexionSala,
  viva: EscenaViva,
  camara: THREE.PerspectiveCamera,
  obtenerEstado: () => EstadoSala | null,
): () => void {
  const puntero = new Puntero(viva, escena);
  const dolly = new THREE.Group();
  escena.add(dolly);
  const flancoA = new DetectorFlanco();
  const flancoB = new DetectorFlanco();
  const gatillo = new Gatillo();
  const fuentes = new Map<number, XRInputSource>();
  let derecho = -1;
  let izquierdo = -1;
  const menu = new MenuMuneca();
  const maqueta = iniciarAR(viva, escena);
  let armado = false; // «Miren acá» armado: el próximo gatillo marca el punto
  let modoSesion: ModoSesion | null = null;
  let colocarPendiente = false; // AR: falta colocar la maqueta con la primera pose de cabeza

  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
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
      if (fuente.handedness === 'left') { izquierdo = i; grip.add(menu.grupo); }
    });
    // Los botones del menú se activan con `select`: ese evento da la activación de usuario que requestSession exige
    // (el gatillo leído del gamepad en el bucle no la da). El gatillo leído solo se ocupa de resaltar/marcar.
    ctrl.addEventListener('select', () => { if (i === derecho) alSelect(ctrl); });
    ctrl.addEventListener('disconnected', () => {
      fuentes.delete(i);
      if (derecho === i) derecho = -1;
      if (izquierdo === i) { izquierdo = -1; grip.remove(menu.grupo); }
    });
    dolly.add(ctrl, grip);
  }

  const selOrigen = new THREE.Vector3();
  const selDir = new THREE.Vector3();
  const selQuat = new THREE.Quaternion();
  const alSelect = (ctrl: THREE.Object3D) => {
    if (!renderer.xr.isPresenting) return;
    ctrl.getWorldPosition(selOrigen);
    selDir.set(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(selQuat));
    const indice = menu.golpe(selOrigen, selDir);
    if (indice === null) return;
    dolly.updateMatrixWorld();
    const cabeza = poseMundo(dolly.matrixWorld.elements, renderer.xr.getCamera().matrix.elements);
    const e = obtenerEstado();
    const act = accionDeBoton(indice, {
      cabeza, animacion: e?.clase.pasos[e.paso]?.animacion, enAR: modoSesion === 'ar', arSoportado, mirenAcaActivo: !!e?.mirenAca,
    });
    if (act?.tipo === 'comando') {
      conexion.enviar(act.c);
      if (act.c.t === 'mirenAca') { armado = false; menu.ponerArmado(false); }
    }
    else if (act?.tipo === 'armarMirenAca') { armado = !armado; menu.ponerArmado(armado); }
    else if (act?.tipo === 'alternarAR') void cambiarA(modoSesion === 'ar' ? 'vr' : 'ar');
  };

  const estiloBoton =
    'position:fixed;left:50%;transform:translateX(-50%);z-index:20;padding:18px 36px;' +
    'font:700 28px system-ui,sans-serif;color:#fff;background:#2f6fdb;border:0;border-radius:16px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.4);cursor:pointer;display:none';
  const boton = document.createElement('button');
  boton.textContent = 'Entrar en VR';
  boton.style.cssText = `${estiloBoton};bottom:48px`;
  const botonAR = document.createElement('button');
  botonAR.textContent = 'Maqueta en la mesa (AR)';
  botonAR.style.cssText = `${estiloBoton};bottom:132px;background:#2a7a4b`;
  document.body.append(boton, botonAR);

  let sesion: XRSession | null = null;
  let arSoportado = false;
  let cambiando = false;
  const guardada = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

  const alTerminar = () => {
    sesion = null;
    modoSesion = null;
    colocarPendiente = false;
    maqueta.salir();
    menu.ponerAR(false);
    armado = false;
    menu.ponerArmado(false);
    dolly.remove(camara);
    camara.position.copy(guardada.pos);
    camara.quaternion.copy(guardada.quat);
    boton.textContent = 'Entrar en VR';
    boton.style.display = 'block';
    botonAR.style.display = arSoportado ? 'block' : 'none';
  };

  /** Abre una sesión VR o AR. Necesita un gesto del usuario (clic en el botón o gatillo sobre el menú). */
  const abrir = async (modo: ModoSesion) => {
    if (sesion) return;
    const quien = modo === 'vr' ? boton : botonAR;
    quien.disabled = true;
    // Se guarda antes de pedir la sesión; si falla, la cámara de escritorio no se toca.
    guardada.pos.copy(camara.position);
    guardada.quat.copy(camara.quaternion);
    let iniciada = false;
    try {
      const s = await navigator.xr!.requestSession(modo === 'vr' ? 'immersive-vr' : 'immersive-ar', { optionalFeatures: ['local-floor'] });
      sesion = s;
      modoSesion = modo;
      iniciada = true;
      if (modo === 'vr') {
        // El docente entra parado en el piso, justo debajo de donde estaba su cámara de escritorio.
        dolly.position.set(camara.position.x, 0, camara.position.z);
      } else {
        // En AR el origen es el piso real: la maqueta se calcula en esas coordenadas.
        dolly.position.set(0, 0, 0);
        colocarPendiente = true;
      }
      menu.ponerAR(modo === 'ar');
      dolly.add(camara);
      camara.position.set(0, 0, 0);
      camara.quaternion.identity();
      s.addEventListener('end', alTerminar);
      await renderer.xr.setSession(s);
      boton.style.display = 'none';
      botonAR.style.display = 'none';
    } catch (err) {
      console.error(`No se pudo iniciar la sesión de ${modo === 'vr' ? 'VR' : 'AR'}`, err);
      if (iniciada) alTerminar();
      quien.textContent = modo === 'vr' ? 'No se pudo entrar en VR.' : 'No se pudo entrar en AR.';
    } finally {
      quien.disabled = false;
    }
  };

  boton.addEventListener('click', () => { void abrir('vr'); });
  botonAR.addEventListener('click', () => { void abrir('ar'); });

  /** Cierra la sesión actual y abre la del otro modo (VR ↔ AR). */
  const cambiarA = async (modo: ModoSesion) => {
    const actual = sesion;
    // Sin soporte de AR no se cierra la sesión VR (el docente no se queda afuera).
    if (cambiando || !actual || (modo === 'ar' && !arSoportado)) return;
    cambiando = true;
    try {
      await new Promise<void>((res) => {
        actual.addEventListener('end', () => res(), { once: true });
        void actual.end();
      });
      await abrir(modo);
    } finally {
      cambiando = false;
    }
  };

  navigator.xr?.isSessionSupported('immersive-vr')
    .then((ok) => { if (ok) boton.style.display = 'block'; })
    .catch(() => undefined);
  void soportaAR().then((ok) => { arSoportado = ok; menu.ponerARSoportado(ok); if (ok && !sesion) botonAR.style.display = 'block'; });

  const quatCtrl = new THREE.Quaternion();
  const origen = new THREE.Vector3();
  const dir = new THREE.Vector3();

  return () => {
    if (!renderer.xr.isPresenting) return;

    // La cámara XR no tiene padre: su matriz es local al piso; se compone a mano con la del dolly.
    dolly.updateMatrixWorld();
    const cabeza = poseMundo(dolly.matrixWorld.elements, renderer.xr.getCamera().matrix.elements);

    if (colocarPendiente && cabeza.pos[1] > 0.3) { // ya hay pose de cabeza (los ojos no están a ras del piso)
      colocarPendiente = false;
      dir.set(0, 0, -1).applyQuaternion(quatCtrl.set(...cabeza.quat));
      maqueta.entrar(cabeza.pos, [dir.x, dir.y, dir.z]);
    }

    let o: Vec3 | null = null;
    let d: Vec3 | null = null;
    const ctrl = derecho >= 0 ? renderer.xr.getController(derecho) : null;
    if (ctrl) {
      ctrl.getWorldPosition(origen);
      dir.set(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(quatCtrl));
      o = [origen.x, origen.y, origen.z];
      d = [dir.x, dir.y, dir.z];
    }
    if (modoSesion !== 'ar') {
      conexion.enviarPose(empaquetarPose(cabeza.pos, cabeza.quat, o, d));
    } else if (maqueta.activa) {
      // En AR la pose se pasa a coordenadas de la terminal: el proyector ve desde el punto de vista equivalente.
      conexion.enviarPose(empaquetarPose(maqueta.aTerminal(cabeza.pos), cabeza.quat, o && maqueta.aTerminal(o), d));
    }

    const botones = fuentes.get(derecho)?.gamepad?.buttons;
    if (!botones) return;
    if (flancoA.actualizar(!!botones[BOTON_A]?.pressed)) conexion.enviar({ t: 'siguiente' });
    if (flancoB.actualizar(!!botones[BOTON_B]?.pressed)) conexion.enviar({ t: 'anterior' });

    const accion = gatillo.actualizar(!!botones[IND_GATILLO]?.pressed, performance.now());
    if (accion && o && d) {
      // `origen` y `dir` siguen valiendo el rayo derecho. Un botón del menú consume el gatillo.
      const ruta = enrutarGatillo(accion, menu.golpe(origen, dir), armado);
      if (ruta.tipo === 'boton') {
        // Lo activa el evento `select` (ver arriba); acá solo se consume para que no resalte ni marque.
      } else if (ruta.tipo === 'resaltar') {
        conexion.enviar({ t: 'resaltar', id: puntero.intersectar(o, d)?.moduloId ?? null });
      } else if (ruta.tipo === 'marcar') {
        const p = puntero.punto(o, d); // null si no hay nada visible: no se manda y «Miren acá» sigue armado
        if (p) {
          conexion.enviar({ t: 'mirenAca', pos: maqueta.activa ? maqueta.aTerminal(p) : p });
          armado = false;
          menu.ponerArmado(false);
        }
      }
    }
  };
}
