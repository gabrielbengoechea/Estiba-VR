import { describe, expect, it } from 'vitest';
import { baseServidor, urlWebSocket } from './servidor';

describe('baseServidor', () => {
  it('sin valor o con espacios es el mismo origen', () => {
    expect(baseServidor(undefined)).toBe('');
    expect(baseServidor('  ')).toBe('');
  });

  it('se queda con el origen, sin barra ni ruta', () => {
    expect(baseServidor('https://estiba-x.onrender.com/')).toBe('https://estiba-x.onrender.com');
    expect(baseServidor(' https://estiba-x.onrender.com/algo ')).toBe('https://estiba-x.onrender.com');
  });

  it('ignora valores que no son http(s)', () => {
    expect(baseServidor('estiba-x.onrender.com')).toBe('');
    expect(baseServidor('ftp://x')).toBe('');
  });
});

describe('urlWebSocket', () => {
  it('https pasa a wss y http a ws, en /ws', () => {
    expect(urlWebSocket('https://estiba-x.onrender.com')).toBe('wss://estiba-x.onrender.com/ws');
    expect(urlWebSocket('http://192.168.1.5:8787')).toBe('ws://192.168.1.5:8787/ws');
  });
});
