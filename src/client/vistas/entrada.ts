import { pedirPermisoMovimiento } from './orientacion';

export function estadoEntrada(
  permiso: 'concedido' | 'denegado' | 'pendiente',
  vertical: boolean,
): { listo: boolean; mensaje: string | null } {
  if (permiso === 'denegado') {
    return {
      listo: false,
      mensaje: 'Sin permiso de movimiento no podemos seguir tu cabeza. Tocá «Entrar» de nuevo y elegí «Permitir».',
    };
  }
  if (permiso === 'pendiente') {
    return { listo: false, mensaje: 'Tocá «Entrar a la clase» para empezar.' };
  }
  if (vertical) return { listo: false, mensaje: 'Girá el celular y ponelo en el visor.' };
  return { listo: true, mensaje: null };
}

/** Sentinel del Wake Lock: se guarda para poder volver a pedirlo (el sistema lo suelta al ocultarse la página). */
let sentinel: WakeLockSentinel | null = null;

async function pedirWakeLock(): Promise<void> {
  try {
    sentinel = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch { sentinel = null; /* no es imprescindible */ }
}

/** Intenta pantalla completa, orientación horizontal y que la pantalla no se apague; tolera que falle cualquiera. */
async function prepararPantalla(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.();
  } catch { /* no es imprescindible */ }
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch { /* no es imprescindible */ }
  await pedirWakeLock();
  // Al volver a la pestaña el Wake Lock ya se liberó: se pide de nuevo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void pedirWakeLock();
  });
}

export function mostrarEntrada(contenedor: HTMLElement, alEntrar: () => void): void {
  const pantalla = document.createElement('div');
  pantalla.style.cssText =
    'position:fixed;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:24px;padding:24px;text-align:center;background:#0e1216;' +
    'color:#eef0f2;font-family:system-ui,sans-serif';

  const titulo = document.createElement('h1');
  titulo.textContent = 'Estiba';
  titulo.style.margin = '0';

  const boton = document.createElement('button');
  boton.textContent = 'Entrar a la clase';
  boton.style.cssText =
    'font:700 28px system-ui,sans-serif;padding:20px 40px;border:0;border-radius:12px;' +
    'background:#e2b21a;color:#13202c;cursor:pointer';

  const aviso = document.createElement('p');
  aviso.style.cssText = 'margin:0;max-width:30em;font-size:20px;min-height:1.5em';
  aviso.textContent = estadoEntrada('pendiente', false).mensaje;

  pantalla.append(titulo, boton, aviso);
  contenedor.append(pantalla);

  boton.addEventListener('click', async () => {
    boton.disabled = true;
    const permiso = await pedirPermisoMovimiento(); // el pedido nace dentro del toque (iOS)
    boton.disabled = false;
    if (permiso === 'denegado') {
      aviso.textContent = estadoEntrada('denegado', false).mensaje;
      return;
    }
    void prepararPantalla();
    pantalla.remove();
    alEntrar();
  });
}
