/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección del servidor de Estiba si la página se sirve desde otro dominio (ver README, Vercel). */
  readonly VITE_ESTIBA_SERVIDOR?: string;
}
