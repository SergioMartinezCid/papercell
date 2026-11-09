/** Minimal image types and operations; no canvas or DOM needed. */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA bytes, row by row. */
  data: Uint8ClampedArray | Uint8Array;
}

/** Single-channel image, 0 = black, 1 = white. */
export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export interface Point {
  x: number;
  y: number;
}

export function createGray(width: number, height: number, fill = 0): GrayImage {
  const data = new Float32Array(width * height);
  if (fill) data.fill(fill);
  return { width, height, data };
}

/** Luminance (Rec. 601), as used for printed ink of any colour. */
export function toGray(img: RgbaImage): GrayImage {
  const out = createGray(img.width, img.height);
  const src = img.data;
  for (let i = 0, j = 0; j < out.data.length; i += 4, j++) {
    out.data[j] = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  }
  return out;
}

/**
 * Brightness of the darkest colour channel. Pens of any colour (red, blue, green) absorb strongly in
 * at least one channel, so they read nearly as dark as black ink; paper and grey print are unchanged.
 */
export function darkestChannel(img: RgbaImage): GrayImage {
  const out = createGray(img.width, img.height);
  const src = img.data;
  for (let i = 0, j = 0; j < out.data.length; i += 4, j++) {
    out.data[j] = Math.min(src[i], src[i + 1], src[i + 2]) / 255;
  }
  return out;
}

export function grayToRgba(img: GrayImage): RgbaImage {
  const data = new Uint8ClampedArray(img.width * img.height * 4);
  for (let j = 0, i = 0; j < img.data.length; j++, i += 4) {
    const v = img.data[j] * 255;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data };
}

/** Area-average downscale so the longest side is at most `maxSide`. Returns the factor used. */
export function downscaleRgba(img: RgbaImage, maxSide: number): { image: RgbaImage; factor: number } {
  const factor = Math.max(img.width, img.height) / maxSide;
  if (factor <= 1) return { image: img, factor: 1 };
  const width = Math.max(1, Math.round(img.width / factor));
  const height = Math.max(1, Math.round(img.height / factor));
  const fx = img.width / width;
  const fy = img.height / height;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const o = (y * width + x) * 4;
      out[o] = r / count;
      out[o + 1] = g / count;
      out[o + 2] = b / count;
      out[o + 3] = 255;
    }
  }
  return { image: { width, height, data: out }, factor: img.width / width };
}

/** Mean over `k`×`k` blocks. */
export function blockMean(img: GrayImage, k: number): GrayImage {
  if (k <= 1) return img;
  const width = Math.max(1, Math.floor(img.width / k));
  const height = Math.max(1, Math.floor(img.height / k));
  const out = createGray(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let yy = y * k; yy < (y + 1) * k; yy++) {
        const row = yy * img.width;
        for (let xx = x * k; xx < (x + 1) * k; xx++) sum += img.data[row + xx];
      }
      out.data[y * width + x] = sum / (k * k);
    }
  }
  return out;
}

/** Bilinear sample at continuous pixel coordinates (pixel `i` covers [i, i+1)). */
export function sampleBilinear(img: GrayImage, x: number, y: number, outside = 0): number {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  if (x0 < -1 || y0 < -1 || x0 >= img.width || y0 >= img.height) return outside;
  const tx = fx - x0;
  const ty = fy - y0;
  const cx0 = Math.min(Math.max(x0, 0), img.width - 1);
  const cx1 = Math.min(Math.max(x0 + 1, 0), img.width - 1);
  const cy0 = Math.min(Math.max(y0, 0), img.height - 1);
  const cy1 = Math.min(Math.max(y0 + 1, 0), img.height - 1);
  const d = img.data;
  const w = img.width;
  const top = d[cy0 * w + cx0] * (1 - tx) + d[cy0 * w + cx1] * tx;
  const bottom = d[cy1 * w + cx0] * (1 - tx) + d[cy1 * w + cx1] * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Summed-area table with one extra row and column of zeros. */
export class Integral {
  readonly width: number;
  readonly height: number;
  private sums: Float64Array;

  constructor(img: GrayImage, map: (v: number) => number = (v) => v) {
    this.width = img.width;
    this.height = img.height;
    const w = img.width + 1;
    this.sums = new Float64Array(w * (img.height + 1));
    for (let y = 0; y < img.height; y++) {
      let row = 0;
      for (let x = 0; x < img.width; x++) {
        row += map(img.data[y * img.width + x]);
        this.sums[(y + 1) * w + x + 1] = this.sums[y * w + x + 1] + row;
      }
    }
  }

  /** Sum over the pixel rectangle [x0, x1) × [y0, y1), clipped to the image. */
  sum(x0: number, y0: number, x1: number, y1: number): number {
    x0 = Math.max(0, Math.min(this.width, x0));
    x1 = Math.max(0, Math.min(this.width, x1));
    y0 = Math.max(0, Math.min(this.height, y0));
    y1 = Math.max(0, Math.min(this.height, y1));
    if (x1 <= x0 || y1 <= y0) return 0;
    const w = this.width + 1;
    const s = this.sums;
    return s[y1 * w + x1] - s[y0 * w + x1] - s[y1 * w + x0] + s[y0 * w + x0];
  }

  mean(x0: number, y0: number, x1: number, y1: number): number {
    const area = (Math.min(this.width, x1) - Math.max(0, x0)) * (Math.min(this.height, y1) - Math.max(0, y0));
    return area > 0 ? this.sum(x0, y0, x1, y1) / area : 0;
  }
}
