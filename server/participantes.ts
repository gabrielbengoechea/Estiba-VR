import type { Participante } from '../src/shared/protocolo';
import type { Rol } from '../src/shared/tipos';

/** Quién está en una sala, con su estado de batería. No sabe nada de la red: se indexa por cualquier objeto (el socket). */
export class Participantes {
  private readonly porClave = new Map<object, Participante>();
  private siguienteId = 1;

  unir(clave: object, rol: Rol, ahora: number = Date.now()): Participante {
    const p: Participante = {
      id: String(this.siguienteId++), rol, nombre: rol === 'alumno' ? this.nombreLibre() : rol,
      bateria: null, cargando: null, desde: ahora,
    };
    this.porClave.set(clave, p);
    return { ...p };
  }

  actualizar(clave: object, bateria: number | null, cargando: boolean | null): void {
    const p = this.porClave.get(clave);
    if (p) { p.bateria = bateria; p.cargando = cargando; }
  }

  quitar(clave: object): void {
    this.porClave.delete(clave);
  }

  lista(): Participante[] {
    return [...this.porClave.values()].map((p) => ({ ...p }));
  }

  private nombreLibre(): string {
    const usados = new Set([...this.porClave.values()].map((p) => p.nombre));
    let n = 1;
    while (usados.has(`Alumno ${n}`)) n++;
    return `Alumno ${n}`;
  }
}
