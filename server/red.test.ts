import { describe, expect, it } from 'vitest';
import { ipv4DeLaRed, urlsDeLaRed } from './red';

const ifaces = {
  lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  wifi: [
    { family: 'IPv6', address: 'fe80::1', internal: false },
    { family: 'IPv4', address: '192.168.0.10', internal: false },
  ],
  eth: [{ family: 'IPv4', address: '10.0.0.5', internal: false }, undefined as never],
};

describe('red', () => {
  it('lista solo IPv4 no internas', () => {
    expect(ipv4DeLaRed(ifaces)).toEqual(['192.168.0.10', '10.0.0.5']);
  });
  it('arma las URL https con el puerto', () => {
    expect(urlsDeLaRed(8443, ifaces)).toEqual(['https://192.168.0.10:8443', 'https://10.0.0.5:8443']);
  });
});
