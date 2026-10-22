import { describe, expect, it } from 'vitest';
import { estadoEntrada } from './entrada';

describe('estadoEntrada', () => {
  it('con permiso denegado explica cómo permitir el movimiento', () => {
    const e = estadoEntrada('denegado', false);
    expect(e.listo).toBe(false);
    expect(e.mensaje).toBe(
      'Sin permiso de movimiento no podemos seguir tu cabeza. Tocá «Entrar» de nuevo y elegí «Permitir».',
    );
  });

  it('con el celular en vertical pide girarlo', () => {
    const e = estadoEntrada('concedido', true);
    expect(e.listo).toBe(false);
    expect(e.mensaje).toBe('Girá el celular y ponelo en el visor.');
  });

  it('con permiso y celular horizontal está listo y sin mensaje', () => {
    expect(estadoEntrada('concedido', false)).toEqual({ listo: true, mensaje: null });
  });

  it('con permiso pendiente no está listo y tiene un mensaje', () => {
    const e = estadoEntrada('pendiente', false);
    expect(e.listo).toBe(false);
    expect(e.mensaje).toBeTruthy();
  });
});
