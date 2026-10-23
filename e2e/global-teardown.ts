import { rmSync } from 'node:fs';
import { DATOS_E2E } from '../playwright.config';

export default function globalTeardown(): void {
  rmSync(DATOS_E2E, { recursive: true, force: true });
}
