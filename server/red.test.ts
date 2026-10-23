import { describe, expect, it } from 'vitest';
import { ipv4DeLaRed, ipv4Ordenadas, urlsDeLaRed } from './red';

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
  it('ordena: adaptadores virtuales al final, luego 192.168, 10, 172.16-31', () => {
    const i = (address: string) => [{ family: 'IPv4', address, internal: false }];
    const r = ipv4Ordenadas({
      'vEthernet (WSL)': i('192.168.42.1'),
      VPN: i('172.20.0.2'),
      Ethernet: i('10.100.72.167'),
      'Wi-Fi': i('192.168.1.50'),
      'Docker Desktop': i('172.17.0.1'),
    });
    expect(r).toEqual(['192.168.1.50', '10.100.72.167', '172.20.0.2', '192.168.42.1', '172.17.0.1']);
  });
});
