import { describe, expect, it } from 'vitest';
import { MedidorFps } from './medidorFps';

describe('MedidorFps', () => {
  it('60 cuadros cada 16,67 ms dan unos 60 fps', () => {
    const m = new MedidorFps();
    for (let i = 0; i < 60; i++) m.cuadro(i * 16.67);
    expect(m.fps()).toBeGreaterThanOrEqual(59);
    expect(m.fps()).toBeLessThanOrEqual(61);
  });

  it('sin cuadros da 0', () => {
    expect(new MedidorFps().fps()).toBe(0);
  });

  it('tras 2 s sin cuadros no cuenta los viejos', () => {
    const m = new MedidorFps();
    for (let i = 0; i < 60; i++) m.cuadro(i * 16.67);
    m.cuadro(3000);
    expect(m.fps()).toBe(1);
  });
});
