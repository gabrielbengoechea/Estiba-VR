export const MENSAJE_ERROR_3D =
  'No pudimos iniciar la vista 3D en este celular. Probá recargar la página o usar otro navegador.';

/** Reemplaza el contenido del contenedor por un mensaje claro: nunca una pantalla en blanco. */
export function mostrarError(contenedor: HTMLElement, mensaje: string = MENSAJE_ERROR_3D): void {
  contenedor.textContent = '';
  const caja = document.createElement('div');
  caja.setAttribute('role', 'alert');
  caja.style.cssText =
    'position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;' +
    'padding:24px;text-align:center;font:600 28px system-ui,sans-serif;background:#0e1216;color:#eef0f2';
  caja.textContent = mensaje;
  contenedor.append(caja);
}
