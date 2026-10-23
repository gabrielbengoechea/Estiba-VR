import type { Comando } from '../../shared/sala';
import type { Participante } from '../../shared/protocolo';
import type { Vec3 } from '../../shared/tipos';

/** Altura de los ojos de un alumno parado, en metros. */
export const ALTURA_OJOS = 1.7;

/**
 * Teclas del docente en la laptop: flechas = paso siguiente o anterior, R = recentrar a todos, Espacio = animación del
 * paso actual (`animacionPaso`; si no tiene, nada), Escape = apagar «Miren acá». Cualquier otra tecla no hace nada.
 */
export function teclaAComando(tecla: string, animacionPaso?: string): Comando | null {
  if (tecla === 'r' || tecla === 'R') return { t: 'recentrar' };
  if (tecla === ' ') return animacionPaso ? { t: 'animar', id: animacionPaso } : null;
  if (tecla === 'Escape') return { t: 'mirenAca', pos: null };
  if (tecla === 'ArrowRight' || tecla === 'ArrowDown' || tecla === 'PageDown') return { t: 'siguiente' };
  if (tecla === 'ArrowLeft' || tecla === 'ArrowUp' || tecla === 'PageUp') return { t: 'anterior' };
  return null;
}

/** Si el clic de «Miren acá» cae a menos de esto (m) del aro activo, se interpreta como apagarlo. */
export const RADIO_MISMO_PUNTO = 5;

/** Punto que manda «M + clic»: el nuevo, o null (apagar) si no hay punto o ya hay un aro casi en el mismo lugar. */
export function mirenAcaTrasClic(actual: Vec3 | null, nuevo: Vec3 | null): Vec3 | null {
  if (!nuevo) return null;
  if (actual && Math.hypot(actual[0] - nuevo[0], actual[1] - nuevo[1], actual[2] - nuevo[2]) < RADIO_MISMO_PUNTO) return null;
  return nuevo;
}

/** «Traer»: los alumnos pasan a donde está la cámara, pero a la altura de unos ojos, mirando en su misma dirección. */
export function comandoTraer(camaraPos: Vec3, camaraDir: Vec3): Comando {
  const pos: Vec3 = [camaraPos[0], ALTURA_OJOS, camaraPos[2]];
  return { t: 'traer', pos, mira: [pos[0] + camaraDir[0] * 10, pos[1] + camaraDir[1] * 10, pos[2] + camaraDir[2] * 10] };
}

/** Giro alrededor de Y (radianes) que hace que el frente (-z) apunte de `pos` hacia `mira`, ignorando la altura. */
export function guinadaHacia(pos: Vec3, mira: Vec3): number {
  const dx = mira[0] - pos[0];
  const dz = mira[2] - pos[2];
  if (dx === 0 && dz === 0) return 0;
  return Math.atan2(-dx, -dz);
}

/** Fracción del camino que se recorre en `dt` segundos con un suavizado exponencial de `velocidad` (1/s). */
export function factorSuavizado(dt: number, velocidad: number): number {
  return 1 - Math.exp(-Math.max(0, dt) * velocidad);
}

/** Origen (sin ruta, consulta ni hash) de un http/https válido; cualquier otra cosa da null. */
function baseValida(x: string | null | undefined): string | null {
  if (!x) return null;
  try {
    const u = new URL(x.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Dirección que se muestra en el QR: la página del alumno de esa sala. */
export function urlAlumno(origen: string, sala: string, publico?: string | null): string {
  const base = baseValida(publico) ?? origen.replace(/\/+$/, '');
  return `${base}/?sala=${encodeURIComponent(sala)}&rol=alumno`;
}

/**
 * Modo aula: si el proyector se abrió en localhost y no trae ?publico=, la base pública es la primera
 * URL https de la red que expone el servidor; si no corresponde, null.
 */
export function baseDeAula(origen: string, publico: string | null | undefined, urlsRed: readonly string[]): string | null {
  if (baseValida(publico) || !esLinkLocal(origen)) return null;
  for (const u of urlsRed) {
    const b = baseValida(u);
    if (b) return b;
  }
  return null;
}

/** Verdadero si el link solo funciona en la computadora que lo abre (localhost, 127.x, ::1). */
export function esLinkLocal(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h.endsWith('.localhost') || /^127\./.test(h) || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

/** Id para el comando `ficha` al apretar F: cierra la ficha abierta, o abre la del paso (null si no tiene). */
export function idFichaAlternada(abierta: string | null, delPaso: string | undefined): string | null {
  return abierta !== null ? null : delPaso ?? null;
}

/** Batería baja: informada, por debajo de 20 % y sin estar cargando. */
export function bateriaBaja(p: Participante): boolean {
  return p.bateria !== null && p.bateria < 0.2 && !p.cargando;
}

/** Línea del HUD: «Sala: N alumnos · K con batería baja (< 20 %)». */
export function resumenSala(lista: readonly Participante[]): string {
  const alumnos = lista.filter((p) => p.rol === 'alumno');
  const bajas = alumnos.filter(bateriaBaja).length;
  return `Sala: ${alumnos.length} ${alumnos.length === 1 ? 'alumno' : 'alumnos'} · ${bajas} con batería baja (< 20 %)`;
}

/** Fila de la lista desplegable: nombre, batería, «cargando» y minutos conectado. */
export function filaParticipante(p: Participante, ahora: number): string {
  const bat = p.bateria === null ? 'batería ?' : `batería ${Math.round(p.bateria * 100)} %`;
  const min = Math.max(0, Math.floor((ahora - p.desde) / 60_000));
  return [p.nombre, bat, ...(p.cargando ? ['cargando'] : []), `${min} min`].join(' · ');
}
