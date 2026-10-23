import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { obtenerCertificado } from './certificado';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'estiba-cert-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('obtenerCertificado', () => {
  it('genera PEM válidos y guarda los dos archivos', () => {
    const { key, cert } = obtenerCertificado(dir);
    expect(key.startsWith('-----BEGIN')).toBe(true);
    expect(cert.startsWith('-----BEGIN CERTIFICATE')).toBe(true);
    expect(existsSync(join(dir, 'estiba-aula.key'))).toBe(true);
    expect(existsSync(join(dir, 'estiba-aula.crt'))).toBe(true);
  });

  it('la segunda llamada reutiliza el certificado', () => {
    const a = obtenerCertificado(dir);
    const b = obtenerCertificado(dir);
    expect(b.cert).toBe(a.cert);
    expect(b.key).toBe(a.key);
  });

  it('crea el directorio si no existe', () => {
    const sub = join(dir, 'a', 'b');
    expect(obtenerCertificado(sub).cert).toContain('BEGIN CERTIFICATE');
  });
});
