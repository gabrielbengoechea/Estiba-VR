import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Clase, Escena } from '../src/shared/tipos';
import { crearServidor } from './servidor';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirPublico = join(raiz, 'public');
const puerto = Number(process.env.PORT) || 8787;
const produccion = process.env.NODE_ENV === 'production';

let pin = process.env.ESTIBA_PIN;
if (!pin) {
  if (produccion) {
    console.error('Falta la variable de entorno ESTIBA_PIN: en producción el PIN es obligatorio.');
    process.exit(1);
  }
  pin = '0000';
  console.warn('Aviso: ESTIBA_PIN no está definido; se usa el PIN de desarrollo 0000. No lo uses en una clase real.');
}

function leerJson<T>(ruta: string): T {
  return JSON.parse(readFileSync(ruta, 'utf8')) as T;
}

// Se lee en cada sala nueva para que un cambio en los JSON se vea sin reiniciar el servidor.
const http = crearServidor({
  pin,
  dirWeb: join(raiz, 'dist'),
  dirDatos: process.env.ESTIBA_DATOS ?? join(raiz, 'data'),
  contenidoPorDefecto: () => ({
    escena: leerJson<Escena>(join(dirPublico, 'escenas', 'terminal-a.json')),
    clase: leerJson<Clase>(join(dirPublico, 'clases', 'terminal-contenedores.json')),
  }),
});

http.listen(puerto, () => {
  console.log(`Estiba escuchando en el puerto ${puerto} (WebSocket en /ws)`);
});
