import { describe, expect, it } from 'vitest';
import { instalarRegistroErrores } from './errores';

function montar(ahora: () => number = () => 0) {
  const oyentes = new Map<string, (e: never) => void>();
  const enviados: Array<Record<string, unknown>> = [];
  instalarRegistroErrores('alumno', '1234', {
    destino: { addEventListener: (t, f) => { oyentes.set(t, f); } },
    enviar: (c) => { enviados.push(JSON.parse(c)); },
    ahora, url: 'http://x/', ua: 'UA',
  });
  const emitir = (tipo: string, e: unknown): void => (oyentes.get(tipo) as (e: unknown) => void)(e);
  return { enviados, emitir };
}

describe('instalarRegistroErrores', () => {
  it('informa un error de ventana con rol, sala, pila, url y ua', () => {
    const { enviados, emitir } = montar(() => 5);
    emitir('error', { message: 'falló', error: { stack: 'en algún lado' } });
    expect(enviados).toEqual([{ rol: 'alumno', sala: '1234', mensaje: 'falló', pila: 'en algún lado', url: 'http://x/', ua: 'UA', momento: 5 }]);
  });

  it('informa una promesa rechazada, sea Error o texto', () => {
    const { enviados, emitir } = montar();
    emitir('unhandledrejection', { reason: { message: 'm', stack: 's' } });
    emitir('unhandledrejection', { reason: 'solo texto' });
    expect(enviados.map((e) => e.mensaje)).toEqual(['m', 'solo texto']);
  });

  it('recorta cada texto a 2000 caracteres', () => {
    const { enviados, emitir } = montar();
    emitir('error', { message: 'x'.repeat(5000), error: { stack: 'y'.repeat(5000) } });
    expect((enviados[0]!.mensaje as string).length).toBe(2000);
    expect((enviados[0]!.pila as string).length).toBe(2000);
  });

  it('manda como máximo 10 por minuto y vuelve a mandar pasado el minuto', () => {
    let t = 0;
    const { enviados, emitir } = montar(() => t);
    for (let i = 0; i < 15; i++) emitir('error', { message: `e${i}` });
    expect(enviados).toHaveLength(10);
    t = 60_001;
    emitir('error', { message: 'otro' });
    expect(enviados).toHaveLength(11);
  });
});
