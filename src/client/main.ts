import type { Rol } from '../shared/tipos';
import { mostrarError } from './vistas/errorVista';

const ROLES: Rol[] = ['docente', 'alumno', 'proyector', 'editor'];

const params = new URLSearchParams(location.search);
const sala = params.get('sala') ?? '';
const rolParam = params.get('rol') as Rol | null;
const rol: Rol = rolParam && ROLES.includes(rolParam) ? rolParam : 'alumno';

const app = document.getElementById('app');
if (app) {
  app.dataset.sala = sala;
  if (rol === 'alumno') {
    // Si el módulo no carga (red, caché vieja), el alumno ve un mensaje, nunca una pantalla en blanco.
    import('./vistas/alumno')
      .then((m) => m.iniciarAlumno(app))
      .catch((e) => {
        console.error('No cargó la vista del alumno', e);
        mostrarError(app);
      });
  } else if (rol === 'proyector' || rol === 'docente') {
    // El docente con el Quest se arma en la Task 10; en la laptop es la vista de escritorio.
    const pin = params.get('pin') ?? undefined;
    import('./vistas/escritorio')
      .then((m) => {
        const vista = new m.VistaEscritorio(app, rol, sala, pin);
        // Para medir triángulos y depurar desde la consola: ?debug=1
        if (params.get('debug') === '1') (window as unknown as { __estiba: unknown }).__estiba = vista;
      })
      .catch((e) => {
        console.error('No cargó la vista de escritorio', e);
        mostrarError(app, 'No pudimos iniciar la vista 3D. Probá recargar la página.');
      });
  } else {
    app.textContent = rol;
  }
}
