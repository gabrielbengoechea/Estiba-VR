import { describe, expect, it } from 'vitest';
import { ipCliente } from './ip';

const req = (xff: string | string[] | undefined, remota: string | null = '10.0.0.1') => ({
  headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
  socket: { remoteAddress: remota ?? undefined },
});

describe('ipCliente', () => {
  it('sin proxy ignora X-Forwarded-For', () => {
    expect(ipCliente(req('1.2.3.4'), {})).toBe('10.0.0.1');
    expect(ipCliente(req('1.2.3.4'), { ESTIBA_DETRAS_DE_PROXY: '0' })).toBe('10.0.0.1');
  });
  it('con proxy y sin cabecera usa la IP del socket', () => {
    expect(ipCliente(req(undefined), { ESTIBA_DETRAS_DE_PROXY: '1' })).toBe('10.0.0.1');
  });
  it('con proxy usa la primera entrada recortada', () => {
    expect(ipCliente(req('  1.2.3.4 '), { ESTIBA_DETRAS_DE_PROXY: '1' })).toBe('1.2.3.4');
    expect(ipCliente(req('1.2.3.4, 5.6.7.8, 9.9.9.9'), { ESTIBA_DETRAS_DE_PROXY: '1' })).toBe('1.2.3.4');
    expect(ipCliente(req(['7.7.7.7, 8.8.8.8']), { ESTIBA_DETRAS_DE_PROXY: '1' })).toBe('7.7.7.7');
  });
  it('con proxy y cabecera vacía cae al socket', () => {
    expect(ipCliente(req(' , 5.6.7.8'), { ESTIBA_DETRAS_DE_PROXY: '1' })).toBe('10.0.0.1');
    expect(ipCliente(req(''), { ESTIBA_DETRAS_DE_PROXY: '1' })).toBe('10.0.0.1');
  });
  it('sin dirección devuelve undefined', () => {
    expect(ipCliente(req(undefined, null), {})).toBeUndefined();
  });
});
