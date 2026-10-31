/** Rasterises page drawings into RGB images, standing in for a printer in synthetic tests. */
import type { PageDrawing } from '../../src/drawing';
import type { Rect } from '../../src/layout';

export interface RgbImage {
  width: number;
  height: number;
  /** Interleaved r, g, b in 0..1. */
  data: Float32Array;
}

export type Rgb = [number, number, number];

export function createRgb(width: number, height: number, fill: Rgb = [1, 1, 1]): RgbImage {
  const data = new Float32Array(width * height * 3);
  for (let i = 0; i < data.length; i += 3) data.set(fill, i);
  return { width, height, data };
}

/** Paints an axis-aligned rectangle given in mm, with exact partial-pixel coverage at its edges. */
export function fillRect(img: RgbImage, r: Rect, color: Rgb, pxPerMm: number, opacity = 1): void {
  const x0 = r.x * pxPerMm;
  const y0 = r.y * pxPerMm;
  const x1 = (r.x + r.w) * pxPerMm;
  const y1 = (r.y + r.h) * pxPerMm;
  for (let iy = Math.max(0, Math.floor(y0)); iy < Math.min(img.height, Math.ceil(y1)); iy++) {
    const cy = Math.min(y1, iy + 1) - Math.max(y0, iy);
    for (let ix = Math.max(0, Math.floor(x0)); ix < Math.min(img.width, Math.ceil(x1)); ix++) {
      const a = cy * (Math.min(x1, ix + 1) - Math.max(x0, ix)) * opacity;
      const i = (iy * img.width + ix) * 3;
      img.data[i] = img.data[i] * (1 - a) + color[0] * a;
      img.data[i + 1] = img.data[i + 1] * (1 - a) + color[1] * a;
      img.data[i + 2] = img.data[i + 2] * (1 - a) + color[2] * a;
    }
  }
}

/** Darkest value a printer produces for black. */
const TONER: Rgb = [0.08, 0.08, 0.09];

export function rasterize(drawing: PageDrawing, pxPerMm: number): RgbImage {
  const img = createRgb(Math.round(drawing.width * pxPerMm), Math.round(drawing.height * pxPerMm));
  for (const s of drawing.shapes) {
    switch (s.kind) {
      case 'rect':
        fillRect(img, s, parseColor(s.fill), pxPerMm);
        break;
      case 'frame': {
        const c = toner(parseColor(s.stroke));
        const h = s.width / 2;
        fillRect(img, { x: s.x - h, y: s.y - h, w: s.w + s.width, h: s.width }, c, pxPerMm);
        fillRect(img, { x: s.x - h, y: s.y + s.h - h, w: s.w + s.width, h: s.width }, c, pxPerMm);
        fillRect(img, { x: s.x - h, y: s.y + h, w: s.width, h: s.h - s.width }, c, pxPerMm);
        fillRect(img, { x: s.x + s.w - h, y: s.y + h, w: s.width, h: s.h - s.width }, c, pxPerMm);
        break;
      }
      case 'modules':
        s.matrix.forEach((row, r) =>
          row.forEach((black, c) => {
            if (black) fillRect(img, { x: s.x + c * s.module, y: s.y + r * s.module, w: s.module, h: s.module }, TONER, pxPerMm);
          }),
        );
        break;
      case 'text':
        drawPseudoText(img, s, toner(parseColor(s.color)), pxPerMm);
        break;
    }
  }
  return img;
}

/** Glyph-like strokes with the ink density of real text (the scanner never reads text). */
function drawPseudoText(
  img: RgbImage,
  s: Rect & { text: string; size: number; align: 'left' | 'center' | 'right'; pad: number; bold: boolean },
  color: Rgb,
  p: number,
): void {
  const advance = s.size * 0.55;
  const lineWidth = s.size * (s.bold ? 0.16 : 0.11);
  const height = s.size * 0.7;
  const total = s.text.length * advance;
  let x = s.align === 'left' ? s.x + s.pad : s.align === 'right' ? s.x + s.w - s.pad - total : s.x + (s.w - total) / 2;
  const top = s.y + (s.h - height) / 2;
  for (const ch of s.text) {
    const code = ch.charCodeAt(0);
    if (ch.trim() && x >= s.x && x + advance <= s.x + s.w) {
      const gw = advance * 0.75;
      fillRect(img, { x, y: top, w: lineWidth, h: height }, color, p);
      if (code & 1) fillRect(img, { x: x + gw - lineWidth, y: top, w: lineWidth, h: height }, color, p);
      if (code & 2) fillRect(img, { x, y: top, w: gw, h: lineWidth }, color, p);
      if (code & 4) fillRect(img, { x, y: top + height / 2, w: gw, h: lineWidth }, color, p);
      if (code & 8) fillRect(img, { x, y: top + height - lineWidth, w: gw, h: lineWidth }, color, p);
    }
    x += advance;
  }
}

function toner(c: Rgb): Rgb {
  return [Math.max(c[0], TONER[0]), Math.max(c[1], TONER[1]), Math.max(c[2], TONER[2])];
}

export function parseColor(color: string): Rgb {
  const c = color.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(c);
  if (m) {
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  m = /^#([0-9a-f]{3})$/.exec(c);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16) / 255) as Rgb;
  m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(c);
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  if (c === 'white') return [1, 1, 1];
  return [0, 0, 0];
}
