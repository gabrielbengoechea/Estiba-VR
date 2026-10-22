import { describe, expect, it } from 'vitest';
import { estimarDesfase } from './reloj';

describe('estimarDesfase', () => {
  it('toma la muestra de menor ida y vuelta', () => {
    const d = estimarDesfase([
      { tc: 0, ts: 1050, tr: 100 },
      { tc: 200, ts: 1230, tr: 260 },
    ]);
    expect(d).toBe(1000);
  });
  it('sin muestras no hay desfase', () => {
    expect(estimarDesfase([])).toBe(0);
  });
});
