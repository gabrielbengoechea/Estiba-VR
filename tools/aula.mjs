// Modo aula: sirve la app compilada por HTTPS en la red local, sin internet.
// Uso: npm run aula   (pide el PIN por consola si ESTIBA_PIN no está definido)
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { Writable } from 'node:stream';

function pedirPin() {
  return new Promise((resolve) => {
    let mudo = false;
    // La salida se silencia mientras se escribe, para que el PIN no quede en pantalla.
    const salida = new Writable({ write(chunk, _enc, cb) { if (!mudo) process.stdout.write(chunk); cb(); } });
    const rl = createInterface({ input: process.stdin, output: salida, terminal: true });
    rl.question('PIN de la clase (no se muestra): ', (r) => { rl.close(); process.stdout.write('\n'); resolve(r.trim()); });
    mudo = true;
  });
}

let pin = process.env.ESTIBA_PIN;
if (!pin) pin = await pedirPin();
if (!pin) {
  console.error('Hace falta un PIN para el modo aula.');
  process.exit(1);
}

const hijo = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: { ...process.env, ESTIBA_PIN: pin, ESTIBA_HTTPS: '1', NODE_ENV: 'production', PORT: process.env.PORT ?? '8443' },
});
hijo.on('exit', (codigo) => process.exit(codigo ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => hijo.kill(s));
