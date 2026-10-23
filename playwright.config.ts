import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Puertos propios para no chocar con un servidor de desarrollo abierto; datos en una carpeta temporal.
const PUERTO_SERVIDOR = 8799;
const PUERTO_WEB = 5199;
export const DATOS_E2E = resolve('test-results', 'e2e-datos');

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PUERTO_WEB}`,
    channel: process.env.ESTIBA_E2E_CANAL || undefined, // p. ej. «msedge» si el Chromium de Playwright no arranca
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: [
    {
      command: 'npm run dev:server',
      port: PUERTO_SERVIDOR,
      reuseExistingServer: false,
      env: { PORT: String(PUERTO_SERVIDOR), ESTIBA_DATOS: DATOS_E2E },
    },
    {
      command: `npm run dev:web:http -- --port ${PUERTO_WEB} --strictPort`,
      port: PUERTO_WEB,
      reuseExistingServer: false,
      env: { ESTIBA_PUERTO: String(PUERTO_SERVIDOR) },
    },
  ],
});
