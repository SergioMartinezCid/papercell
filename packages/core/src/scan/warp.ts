/** Straightening the photographed page and flattening its lighting. */
import type { Rect } from '../layout';
import { applyHomography, type Homography } from './homography';
import { blockMean, createGray, sampleBilinear, type GrayImage } from './image';

/**
 * Samples the region `rect` (mm on the paper) from `src` into a new image with `pxPerMm` pixels per
 * millimetre. `pageToImage` maps paper millimetres to `src` pixel coordinates.
 */
export function warpRegion(src: GrayImage, pageToImage: Homography, rect: Rect, pxPerMm: number): GrayImage {
  const width = Math.round(rect.w * pxPerMm);
  const height = Math.round(rect.h * pxPerMm);
  const out = createGray(width, height);
  const h = pageToImage;
  for (let y = 0; y < height; y++) {
    const my = rect.y + (y + 0.5) / pxPerMm;
    for (let x = 0; x < width; x++) {
      const mx = rect.x + (x + 0.5) / pxPerMm;
      const w = h[6] * mx + h[7] * my + h[8];
      const u = (h[0] * mx + h[1] * my + h[2]) / w;
      const v = (h[3] * mx + h[4] * my + h[5]) / w;
      out.data[y * width + x] = sampleBilinear(src, u, v, 1);
    }
  }
  return out;
}

/** Approximate size of one paper millimetre in image pixels around a point. */
export function pixelsPerMm(pageToImage: Homography, x: number, y: number): number {
  const a = applyHomography(pageToImage, x, y);
  const b = applyHomography(pageToImage, x + 10, y);
  const c = applyHomography(pageToImage, x, y + 10);
  return (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - a.x, c.y - a.y)) / 20;
}

/**
 * Divides the image by an estimate of the bare paper brightness, removing shadows and uneven light.
 * The paper estimate is a morphological closing (local maximum, then local minimum): it erases ink
 * narrower than ~8 mm but keeps the sharp edges of hard shadows in place.
 */
export function flattenIllumination(img: GrayImage, pxPerMm: number): GrayImage {
  const k = Math.max(1, Math.round(pxPerMm / 2));
  const small = blockMean(img, k);
  const unit = pxPerMm / k;
  const radius = Math.round(4 * unit);
  const paper = boxBlur(minFilter(maxFilter(small, radius), radius), Math.round(unit));
  const out = createGray(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const bg = sampleBilinear(paper, (x + 0.5) / k, (y + 0.5) / k, 1);
      const v = img.data[y * img.width + x] / Math.max(bg, 0.04);
      out.data[y * img.width + x] = v > 1 ? 1 : v;
    }
  }
  return out;
}

function maxFilter(img: GrayImage, radius: number): GrayImage {
  return separable(img, radius, (values) => {
    let m = 0;
    for (const v of values) if (v > m) m = v;
    return m;
  });
}

function minFilter(img: GrayImage, radius: number): GrayImage {
  return separable(img, radius, (values) => {
    let m = Infinity;
    for (const v of values) if (v < m) m = v;
    return m;
  });
}

export function boxBlur(img: GrayImage, radius: number): GrayImage {
  return separable(img, radius, (values) => {
    let s = 0;
    for (const v of values) s += v;
    return s / values.length;
  });
}

/** Applies a 1-D window reducer horizontally, then vertically (windows are clipped at the borders). */
function separable(img: GrayImage, radius: number, reduce: (values: Float32Array) => number): GrayImage {
  if (radius < 1) return img;
  const { width, height } = img;
  const pass = (src: Float32Array, len: number, lines: number, stride: number, step: number) => {
    const out = new Float32Array(src.length);
    const buf = new Float32Array(2 * radius + 1);
    for (let line = 0; line < lines; line++) {
      const base = line * stride;
      for (let i = 0; i < len; i++) {
        const lo = Math.max(0, i - radius);
        const hi = Math.min(len - 1, i + radius);
        const view = buf.subarray(0, hi - lo + 1);
        for (let j = lo; j <= hi; j++) view[j - lo] = src[base + j * step];
        out[base + i * step] = reduce(view);
      }
    }
    return out;
  };
  const horizontal = pass(img.data, width, height, width, 1);
  const vertical = pass(horizontal, height, width, 1, width);
  return { width, height, data: vertical };
}
