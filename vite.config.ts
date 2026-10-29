import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  // HTTPS por defecto (el giroscopio y WebXR lo exigen en los dispositivos).
  // `--mode http` o ESTIBA_HTTP=1 sirven por http solo para revisar en localhost (sigue siendo contexto seguro).
  const soloHttp = mode === 'http' || process.env.ESTIBA_HTTP === '1';
  return {
    // GitHub Pages sirve la app en una subcarpeta (/Estiba-VR/): el workflow la pasa en ESTIBA_BASE.
    base: process.env.ESTIBA_BASE ?? '/',
    plugins: soloHttp ? [] : [basicSsl()],
    server: {
      host: true,
      proxy: {
        '/ws': { target: `ws://localhost:${process.env.ESTIBA_PUERTO ?? 8787}`, ws: true },
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          editor: resolve(__dirname, 'editor.html'),
        },
      },
    },
  };
});
