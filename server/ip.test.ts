import { describe, expect, it } from 'vitest';
import { ipCliente } from './ip';

const req = (xff: string | string[] | undefined, remota: string | null = '10.0.0.1') => ({
  headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
  socket: { remoteAddress: remota ?? undefined },
});
const PROXY = { ESTIBA_DETRAS_DE_PROXY: '1' };

describe('ipCliente', () => {
  it('sin proxy ignora X-Forwarded-For', () => {
    expect(ipCliente(req('1.2.3.4'), {})).toBe('10.0.0.1');
    expect(ipCliente(req('1.2.3.4'), { ESTIBA_DETRAS_DE_PROXY: '0' })).toBe('10.0.0.1');
  });
  it('con proxy y sin cabecera usa la IP del socket', () => {
    expect(ipCliente(req(undefined), PROXY)).toBe('10.0.0.1');
    expect(ipCliente(req(''), PROXY)).toBe('10.0.0.1');
  });
  it('N=1 por defecto: toma la última entrada, recortada', () => {
    expect(ipCliente(req('  1.2.3.4 '), PROXY)).toBe('1.2.3.4');
  });
  it('las entradas falsificadas a la izquierda se ignoran', () => {
    expect(ipCliente(req('9.9.9.9, 8.8.8.8, 1.2.3.4'), PROXY)).toBe('1.2.3.4');
    expect(ipCliente(req(['9.9.9.9', '1.2.3.4']), PROXY)).toBe('1.2.3.4');
  });
  it('N=2 toma la segunda desde la derecha', () => {
    expect(ipCliente(req('9.9.9.9, 1.2.3.4, 5.5.5.5'), { ...PROXY, ESTIBA_PROXIES: '2' })).toBe('1.2.3.4');
  });
  it('menos entradas que N o vacía: IP del socket', () => {
    expect(ipCliente(req('1.2.3.4'), { ...PROXY, ESTIBA_PROXIES: '2' })).toBe('10.0.0.1');
    expect(ipCliente(req('1.2.3.4, '), PROXY)).toBe('10.0.0.1');
  });
  it('ESTIBA_PROXIES inválido equivale a 1', () => {
    for (const v of ['0', 'abc', '-2', '1.5', '']) {
      expect(ipCliente(req('9.9.9.9, 1.2.3.4'), { ...PROXY, ESTIBA_PROXIES: v })).toBe('1.2.3.4');
    }
  });
  it('sin dirección devuelve undefined', () => {
    expect(ipCliente(req(undefined, null), {})).toBeUndefined();
  });
});
