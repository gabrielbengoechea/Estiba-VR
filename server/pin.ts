import { createHash, timingSafeEqual } from 'node:crypto';

/** Compara el PIN dado con el real en tiempo constante (se comparan los hashes, que miden siempre lo mismo). */
export function pinCorrecto(dado: string | undefined, real: string): boolean {
  const h = (t: string): Buffer => createHash('sha256').update(t).digest();
  return dado !== undefined && timingSafeEqual(h(dado), h(real));
}
