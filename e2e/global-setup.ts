import { mkdirSync, rmSync } from 'node:fs';
import { DATOS_E2E } from '../playwright.config';

export default function globalSetup(): void {
  rmSync(DATOS_E2E, { recursive: true, force: true });
  mkdirSync(DATOS_E2E, { recursive: true });
}
