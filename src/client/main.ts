import type { Rol } from '../shared/tipos';

const ROLES: Rol[] = ['docente', 'alumno', 'proyector', 'editor'];

const params = new URLSearchParams(location.search);
const sala = params.get('sala') ?? '';
const rolParam = params.get('rol') as Rol | null;
const rol: Rol = rolParam && ROLES.includes(rolParam) ? rolParam : 'alumno';

const app = document.getElementById('app');
if (app) {
  app.textContent = rol;
  app.dataset.sala = sala;
}
