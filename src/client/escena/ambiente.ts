import * as THREE from 'three';

/** Nivel del agua respecto del tope del muelle (y = 0). */
export const NIVEL_AGUA = -1.4;

/** Sombras suaves y tono de cine, como en spike/index.html. Lo llama cada vista al crear su renderer. */
export function configurarRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
}

/** Agua, cielo, niebla, luces y sombras, más el pavimento de la terminal detrás del muelle. */
export function crearAmbiente(escena: THREE.Scene): void {
  const cielo = '#cfdde8';
  escena.background = new THREE.Color(cielo);
  escena.fog = new THREE.Fog(cielo, 380, 1200);

  escena.add(new THREE.HemisphereLight('#eef4ff', '#857a6c', 1.5));

  const sol = new THREE.DirectionalLight('#fff2dc', 2.8);
  sol.position.set(30, 230, 150); // el objetivo es el centro de la terminal (210, 0, -60)
  sol.target.position.set(210, 0, -60);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -300, right: 300, top: 260, bottom: -260, near: 10, far: 700 });
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.3;
  escena.add(sol, sol.target);

  const agua = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: '#3d6c8c', roughness: 0.3, metalness: 0.1 }),
  );
  agua.rotation.x = -Math.PI / 2;
  agua.position.set(200, NIVEL_AGUA, -60);
  agua.receiveShadow = true;
  agua.name = 'agua';
  escena.add(agua);

  // Pavimento de la terminal: empieza donde termina el muelle (20 m de fondo) y se pierde en la niebla.
  // Una cuadrícula tenue de 20 m da referencia de escala y de profundidad.
  const lado = new THREE.MeshStandardMaterial({ color: '#7d848b', roughness: 0.95 });
  const tapa = new THREE.MeshStandardMaterial({ map: texturaCuadricula(1600 / 20, 1180 / 20), color: '#ffffff', roughness: 0.95 });
  const suelo = new THREE.Mesh(new THREE.BoxGeometry(1600, 1.5, 1180), [lado, lado, tapa, lado, lado, lado]);
  suelo.position.set(200, -0.05 - 0.75, -20 - 590);
  suelo.receiveShadow = true;
  suelo.name = 'suelo';
  escena.add(suelo);
}

function texturaCuadricula(repX: number, repY: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null; // sin DOM (pruebas): queda el color liso
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#7d848b';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#6c737a';
    g.fillRect(0, 0, 64, 2);
    g.fillRect(0, 0, 2, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = 4;
  return t;
}

/** Hace que todo lo que cuelga de `raiz` proyecte y reciba sombras. Se llama después de cada `aplicar`. */
export function habilitarSombras(raiz: THREE.Object3D): void {
  raiz.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

/** Sube por los padres hasta el módulo al que pertenece un objeto golpeado por un rayo. */
export function moduloDe(obj: THREE.Object3D | null): string | null {
  for (let o = obj; o; o = o.parent) {
    const id = o.userData.moduloId;
    if (typeof id === 'string') return id;
  }
  return null;
}
