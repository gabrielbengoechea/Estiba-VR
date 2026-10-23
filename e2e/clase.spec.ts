import { expect, test, type Page } from '@playwright/test';

/** Errores de consola que no son fallas de la app (ruido de WebGL por software en Chromium headless). */
// (también se ignora el 404 de /favicon.ico)
const BENIGNOS = [/GPU stall due to ReadPixels/i, /GL Driver Message/i, /WebGL.*(swiftshader|fallback)/i];

function vigilar(page: Page, nombre: string, errores: string[]): void {
  page.on('pageerror', (e) => errores.push(`${nombre} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (BENIGNOS.some((r) => r.test(t))) return;
    if (/favicon\.ico$/.test(m.location().url)) return; // el navegador pide el ícono; la app no tiene
    errores.push(`${nombre} console: ${t}`);
  });
}

type Depuracion = { estado(): { paso: number; clase: { pasos: unknown[] } } | null };
const leerPaso = (page: Page) =>
  page.evaluate(() => {
    const d = (window as unknown as { __estiba?: Depuracion }).__estiba;
    // En el escritorio `estado` es un campo; en el alumno, una función.
    const e = typeof d?.estado === 'function' ? d.estado() : (d as unknown as { estado: ReturnType<Depuracion['estado']> } | undefined)?.estado ?? null;
    return e ? e.paso : null;
  });

test('una clase completa: docente, proyector y alumno ven el mismo paso', async ({ browser }) => {
  const sala = String(1000 + Math.floor(Math.random() * 9000));
  const errores: string[] = [];

  const ctxEscritorio = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctxAlumno = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctxAlumno.addInitScript(() => {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (DOE) DOE.requestPermission = () => Promise.resolve('granted');
  });

  const docente = await ctxEscritorio.newPage();
  const proyector = await ctxEscritorio.newPage();
  const alumno = await ctxAlumno.newPage();
  vigilar(docente, 'docente', errores);
  vigilar(proyector, 'proyector', errores);
  vigilar(alumno, 'alumno', errores);

  await docente.goto(`/?sala=${sala}&rol=docente&pin=0000&debug=1`);
  await proyector.goto(`/?sala=${sala}&rol=proyector&debug=1`);
  await alumno.goto(`/?sala=${sala}&rol=alumno&debug=1&simular=1`);

  await alumno.getByRole('button', { name: 'Entrar a la clase' }).click();

  await expect.poll(() => leerPaso(docente), { timeout: 15_000 }).not.toBeNull();
  const total = await docente.evaluate(
    () => (window as unknown as { __estiba: { estado: { clase: { pasos: unknown[] } } } }).__estiba.estado.clase.pasos.length,
  );
  expect(total).toBe(6);

  const todosEn = async (paso: number) => {
    await expect.poll(() => leerPaso(alumno), { timeout: 2_000 }).toBe(paso);
    await expect.poll(() => leerPaso(proyector), { timeout: 2_000 }).toBe(paso);
  };

  await expect.poll(() => leerPaso(alumno), { timeout: 15_000 }).not.toBeNull();
  await expect.poll(() => leerPaso(proyector), { timeout: 15_000 }).not.toBeNull();

  await docente.locator('body').click({ position: { x: 5, y: 5 } });
  const inicial = (await leerPaso(docente)) as number;
  await todosEn(inicial);
  for (let paso = inicial + 1; paso < total; paso++) {
    await docente.keyboard.press('ArrowRight');
    await expect.poll(() => leerPaso(docente), { timeout: 2_000 }).toBe(paso);
    await todosEn(paso);
  }
  expect(await leerPaso(alumno)).toBe(total - 1);

  expect(errores).toEqual([]);
  await ctxEscritorio.close();
  await ctxAlumno.close();
});
