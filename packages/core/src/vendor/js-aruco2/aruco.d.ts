export interface Point {
  x: number;
  y: number;
}

export interface Marker {
  id: number;
  corners: Point[];
  hammingDistance: number;
}

export interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

declare class Detector {
  constructor(config?: { dictionaryName?: string; maxHammingDistance?: number });
  detect(image: ImageLike): Marker[];
}

declare class Dictionary {
  constructor(name: string);
  codeList: string[];
  nBits: number;
  markSize: number;
}

export declare const AR: { Detector: typeof Detector; Dictionary: typeof Dictionary };
