import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Conserva los plugins y opciones de vite.config.ts y deja afuera las pruebas de punta a punta (Playwright).
export default defineConfig((env) =>
  mergeConfig(
    typeof viteConfig === 'function' ? viteConfig(env) : viteConfig,
    defineConfig({ test: { exclude: [...configDefaults.exclude, 'e2e/**'] } }),
  ),
);
