import * as THREE from 'three';

/** Vista doble para el visor: una mitad de pantalla por ojo. */
export class VistaEstereo {
  separacionOjos = 0.064;
  private estereo = new THREE.StereoCamera();

  constructor(private renderer: THREE.WebGLRenderer) {}

  render(escena: THREE.Scene, cabeza: THREE.Camera): void {
    const camara = cabeza as THREE.PerspectiveCamera;
    const ancho = this.renderer.domElement.clientWidth;
    const alto = this.renderer.domElement.clientHeight;

    camara.fov = 80;
    const aspecto = ancho / 2 / alto;
    if (camara.aspect !== aspecto) camara.aspect = aspecto;
    camara.updateProjectionMatrix();
    camara.updateMatrixWorld();

    this.estereo.eyeSep = this.separacionOjos;
    this.estereo.update(camara);

    const r = this.renderer;
    r.setScissorTest(true);
    r.setViewport(0, 0, ancho / 2, alto);
    r.setScissor(0, 0, ancho / 2, alto);
    r.render(escena, this.estereo.cameraL);
    r.setViewport(ancho / 2, 0, ancho / 2, alto);
    r.setScissor(ancho / 2, 0, ancho / 2, alto);
    r.render(escena, this.estereo.cameraR);
    r.setScissorTest(false);
  }
}
