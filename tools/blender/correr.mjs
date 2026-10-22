// Corre Blender en segundo plano para generar los modelos .glb.
// Ruta de Blender configurable con la variable de entorno BLENDER.
import { spawnSync } from 'node:child_process';

const blender = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const r = spawnSync(blender, ['--background', '--factory-startup', '--python', 'tools/blender/gen_modelos.py', '--', 'public/modelos'], { stdio: 'inherit' });
if (r.error) {
  console.error(`No se pudo ejecutar Blender (${blender}). Definí la variable BLENDER con la ruta correcta.`);
  process.exit(1);
}
process.exit(r.status ?? 1);
