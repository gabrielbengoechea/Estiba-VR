import type { Participante } from '../../shared/protocolo';
import { describe, expect, it } from 'vitest';
import { baseDeAula, comandoTraer, mirenAcaTrasClic, esLinkLocal, factorSuavizado, guinadaHacia, idFichaAlternada, resumenSala, filaParticipante, teclaAComando, urlAlumno } from './controlesDocente';

describe('teclaAComando', () => {
  it('las flechas pasan de paso', () => {
    expect(teclaAComando('ArrowRight')).toEqual({ t: 'siguiente' });
    expect(teclaAComando('ArrowLeft')).toEqual({ t: 'anterior' });
  });
  it('R recentra a todos', () => {
    expect(teclaAComando('r')).toEqual({ t: 'recentrar' });
    expect(teclaAComando('R')).toEqual({ t: 'recentrar' });
  });
  it('Espacio reproduce la animación del paso, y sin animación no hace nada', () => {
    expect(teclaAComando(' ', 'descarga-ciclo')).toEqual({ t: 'animar', id: 'descarga-ciclo' });
    expect(teclaAComando(' ')).toBeNull();
    expect(teclaAComando(' ', undefined)).toBeNull();
  });
  it('Escape apaga «Miren acá»', () => {
    expect(teclaAComando('Escape')).toEqual({ t: 'mirenAca', pos: null });
  });
  it('otras teclas no hacen nada', () => {
    expect(teclaAComando('m')).toBeNull();
    expect(teclaAComando('Enter')).toBeNull();
  });
});

describe('comandoTraer', () => {
  it('baja la posición a 1,7 m y mira en la misma dirección que la cámara', () => {
    expect(comandoTraer([10, 50, -20], [0, 0, -1])).toEqual({ t: 'traer', pos: [10, 1.7, -20], mira: [10, 1.7, -30] });
  });
});

describe('guinadaHacia', () => {
  it('mirar hacia -z no gira', () => {
    expect(guinadaHacia([0, 1, 0], [0, 5, -10])).toBeCloseTo(0);
  });
  it('mirar hacia +x gira -90 grados', () => {
    expect(guinadaHacia([0, 1, 0], [10, 1, 0])).toBeCloseTo(-Math.PI / 2);
  });
  it('mirar hacia arriba sin desplazamiento horizontal no gira', () => {
    expect(guinadaHacia([3, 1, 3], [3, 9, 3])).toBe(0);
  });
});

describe('factorSuavizado', () => {
  it('va de 0 hacia 1 con el tiempo', () => {
    expect(factorSuavizado(0, 8)).toBe(0);
    expect(factorSuavizado(0.1, 8)).toBeGreaterThan(0.5);
    expect(factorSuavizado(10, 8)).toBeCloseTo(1);
  });
});

describe('urlAlumno', () => {
  it('arma el link con sala y rol', () => {
    expect(urlAlumno('https://estiba.test', '1234')).toBe('https://estiba.test/?sala=1234&rol=alumno');
  });
  it('si la base pública es inválida, vuelve al origen', () => {
    for (const malo of ['basura', '%%%', 'ftp:x', 'javascript:alert(1)']) {
      expect(urlAlumno('http://localhost:5173', '1234', malo)).toBe('http://localhost:5173/?sala=1234&rol=alumno');
    }
  });
  it('de la base pública solo se conserva el origen', () => {
    expect(urlAlumno('http://localhost:5173', '1234', 'https://x.com/?a=1')).toBe('https://x.com/?sala=1234&rol=alumno');
    expect(urlAlumno('http://localhost:5173', '1234', 'https://x.com/ruta/#h')).toBe('https://x.com/?sala=1234&rol=alumno');
  });
  it('usa la base pública si se pasa, sin barra final', () => {
    expect(urlAlumno('http://localhost:5173', '1234', 'https://algo.trycloudflare.com/')).toBe('https://algo.trycloudflare.com/?sala=1234&rol=alumno');
    expect(urlAlumno('http://localhost:5173', '1234', '')).toBe('http://localhost:5173/?sala=1234&rol=alumno');
    expect(urlAlumno('http://localhost:5173', '1234', null)).toBe('http://localhost:5173/?sala=1234&rol=alumno');
  });
});

describe('esLinkLocal', () => {
  it('detecta localhost y loopback', () => {
    expect(esLinkLocal('http://localhost:5173/?sala=1')).toBe(true);
    expect(esLinkLocal('http://127.0.0.1:5173')).toBe(true);
    expect(esLinkLocal('http://[::1]:5173')).toBe(true);
  });
  it('no marca links públicos, de la LAN ni inválidos', () => {
    expect(esLinkLocal('https://algo.trycloudflare.com')).toBe(false);
    expect(esLinkLocal('http://192.168.1.20:5173')).toBe(false);
    expect(esLinkLocal('basura')).toBe(false);
  });
});

describe('idFichaAlternada', () => {
  it('abre la del paso si no hay ninguna abierta', () => {
    expect(idFichaAlternada(null, 'grua-sts')).toBe('grua-sts');
  });
  it('cierra si hay una abierta, sea la del paso o no', () => {
    expect(idFichaAlternada('grua-sts', 'grua-sts')).toBeNull();
    expect(idFichaAlternada('otra', 'grua-sts')).toBeNull();
  });
  it('sin ficha en el paso no abre nada', () => {
    expect(idFichaAlternada(null, undefined)).toBeNull();
  });
});

describe('mirenAcaTrasClic', () => {
  it('sin aro activo, M + clic marca el punto', () => {
    expect(mirenAcaTrasClic(null, [10, 0, 20])).toEqual([10, 0, 20]);
  });
  it('con aro activo, M + clic en otro lado lo mueve', () => {
    expect(mirenAcaTrasClic([10, 0, 20], [100, 0, 20])).toEqual([100, 0, 20]);
  });
  it('con aro activo, M + clic en el mismo punto lo apaga', () => {
    expect(mirenAcaTrasClic([10, 0, 20], [11, 0.5, 20.5])).toBeNull();
  });
  it('M + clic sin punto (vacío) apaga el aro', () => {
    expect(mirenAcaTrasClic([10, 0, 20], null)).toBeNull();
    expect(mirenAcaTrasClic(null, null)).toBeNull();
  });
});

describe('baseDeAula', () => {
  it('con ?publico= no toca nada', () => {
    expect(baseDeAula('http://localhost:8443', 'https://x.com', ['https://192.168.0.10:8443'])).toBeNull();
  });
  it('en localhost sin publico usa la primera URL de la red', () => {
    expect(baseDeAula('https://localhost:8443', null, ['https://192.168.0.10:8443', 'https://10.0.0.5:8443'])).toBe('https://192.168.0.10:8443');
  });
  it('fuera de localhost, sin URLs o con basura no hace nada', () => {
    expect(baseDeAula('https://192.168.0.10:8443', null, ['https://10.0.0.5:8443'])).toBeNull();
    expect(baseDeAula('https://localhost:8443', null, [])).toBeNull();
    expect(baseDeAula('https://localhost:8443', null, ['ftp://x'])).toBeNull();
  });
});

const part = (o: Partial<Participante>): Participante => ({ id: '1', rol: 'alumno', nombre: 'Alumno 1', bateria: null, cargando: null, desde: 0, ...o });

describe('resumenSala', () => {
  it('cuenta alumnos y baterías bajas (< 20 % y sin cargar)', () => {
    const lista = [
      part({ bateria: 0.1, cargando: false }),
      part({ bateria: 0.1, cargando: true }),
      part({ bateria: 0.19, cargando: null }),
      part({ bateria: 0.2 }),
      part({ bateria: null }),
      part({ rol: 'docente', nombre: 'docente', bateria: 0.01 }),
    ];
    expect(resumenSala(lista)).toBe('Sala: 5 alumnos · 2 con batería baja (< 20 %)');
  });
  it('sala vacía', () => {
    expect(resumenSala([])).toBe('Sala: 0 alumnos · 0 con batería baja (< 20 %)');
  });
});

describe('filaParticipante', () => {
  it('muestra batería, cargando y minutos', () => {
    expect(filaParticipante(part({ bateria: 0.456, cargando: true, desde: 0 }), 125_000)).toBe('Alumno 1 · batería 46 % · cargando · 2 min');
    expect(filaParticipante(part({}), 0)).toBe('Alumno 1 · batería ? · 0 min');
  });
});
