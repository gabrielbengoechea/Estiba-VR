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
    import('./vistas/alumnoProvisorio')
      .then((m) => m.iniciarAlumno(app))
      .catch((e) => {
        console.error('No cargó la vista del alumno', e);
        mostrarError(app);
      });
  } else {
    app.textContent = rol;
  }
}
