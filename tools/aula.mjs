// Modo aula: sirve la app compilada por HTTPS en la red local, sin internet.
// Uso: npm run aula   (pide el PIN por consola si ESTIBA_PIN no está definido)
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { Writable } from 'node:stream';

function pedirPin() {
  return new Promise((resolve) => {
    const tty = Boolean(process.stdin.isTTY);
    let mudo = false;
    // En una terminal real la salida se silencia al escribir, para que el PIN no quede en pantalla.
    const salida = new Writable({ write(chunk, _enc, cb) { if (!mudo) process.stdout.write(chunk); cb(); } });
    const rl = createInterface({ input: process.stdin, output: tty ? salida : undefined, terminal: tty });
    let respuesta = '';
    rl.once('line', (l) => { respuesta = l.trim(); rl.close(); });
    rl.on('close', () => { if (tty) process.stdout.write('\n'); resolve(respuesta); });
    process.stdout.write('PIN de la clase' + (tty ? ' (no se muestra): ' : ': '));
    mudo = tty;
  });
}

let pin = process.env.ESTIBA_PIN;
if (!pin) pin = await pedirPin();
if (!pin) {
  console.error('Falta el PIN de la clase.');
  process.exit(1);
}

const hijo = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: { ...process.env, ESTIBA_PIN: pin, ESTIBA_HTTPS: '1', NODE_ENV: 'production', PORT: process.env.PORT ?? '8443' },
});
hijo.on('exit', (codigo) => process.exit(codigo ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => hijo.kill(s));
