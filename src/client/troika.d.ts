// troika-three-text no trae tipos: solo lo que usamos de `Text`.
declare module 'troika-three-text' {
  import { Mesh, Material } from 'three';
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    color: number | string;
    maxWidth: number;
    lineHeight: number | string;
    overflowWrap: string;
    anchorX: number | string;
    anchorY: number | string;
    outlineWidth: number | string;
    outlineColor: number | string;
    material: Material;
    textRenderInfo?: { blockBounds: [number, number, number, number] };
    sync(callback?: () => void): void;
    dispose(): void;
  }
}

declare module '*.woff?url' {
  const url: string;
  export default url;
}
