import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import selfsigned from 'selfsigned';
import { ipv4DeLaRed } from './red';

const DIAS = 825;

function vigente(cert: string): boolean {
  try {
    return new Date(new X509Certificate(cert).validTo).getTime() > Date.now() + 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

/** Certificado autofirmado para el modo aula (SAN: localhost y las IPv4 de la máquina). Se guarda en `dir` y se reutiliza. */
export function obtenerCertificado(dir: string): { key: string; cert: string } {
  const archivoKey = join(dir, 'estiba-aula.key');
  const archivoCert = join(dir, 'estiba-aula.crt');
  const ips = ipv4DeLaRed(networkInterfaces());
  if (existsSync(archivoKey) && existsSync(archivoCert)) {
    const key = readFileSync(archivoKey, 'utf8');
    const cert = readFileSync(archivoCert, 'utf8');
    // Si la laptop cambió de IP, el certificado viejo ya no cubre la dirección: se regenera.
    const sirve = vigente(cert) && ips.every((ip) => { try { return new X509Certificate(cert).checkIP(ip) !== undefined; } catch { return false; } });
    if (sirve) return { key, cert };
  }
  const pems = selfsigned.generate([{ name: 'commonName', value: 'Estiba aula' }], {
    keySize: 2048,
    days: DIAS,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'subjectAltName', altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        ...ips.map((ip) => ({ type: 7 as const, ip })),
      ] },
    ],
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(archivoKey, pems.private, { mode: 0o600 });
  writeFileSync(archivoCert, pems.cert);
  return { key: pems.private, cert: pems.cert };
}
