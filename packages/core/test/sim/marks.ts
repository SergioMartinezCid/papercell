/** Hand-made marks drawn into a printed page. */
import type { Rect } from '../../src/layout';
import { fillRect, type Rgb, type RgbImage } from './raster';
import { uniform, type Rng } from './random';

export type MarkStyle =
  /** Box blacked out with dense pen strokes. */
  | 'fill'
  /** Quick strokes covering most of the box. */
  | 'scribble'
  /** The whole cell blacked out, beyond the box. */
  | 'cell'
  /** A cross through the box. */
  | 'cross'
  /** Filled in with a light pencil. */
  | 'light';

export const INKS: Record<'black' | 'blue' | 'pencil', Rgb> = {
  black: [0.1, 0.1, 0.12],
  blue: [0.12, 0.17, 0.48],
  pencil: [0.55, 0.55, 0.57],
};

const PEN = 0.7;

export function drawMark(img: RgbImage, box: Rect, cell: Rect, style: MarkStyle, ink: Rgb, p: number, rng: Rng): void {
  switch (style) {
    case 'fill':
      strokes(img, grow(box, 0.4), 0.35, 0.02, ink, p, rng);
      break;
    case 'scribble':
      strokes(img, grow(box, 0.6), 0.75, 0.12, ink, p, rng);
      break;
    case 'cell':
      strokes(img, grow(cell, -0.6), 0.4, 0.03, ink, p, rng);
      break;
    case 'light':
      strokes(img, grow(box, 0.3), 0.4, 0.05, INKS.pencil, p, rng);
      break;
    case 'cross': {
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const d = 0.6;
        fillRect(img, { x: box.x + t * box.w - d / 2, y: box.y + t * box.h - d / 2, w: d, h: d }, ink, p);
        fillRect(img, { x: box.x + (1 - t) * box.w - d / 2, y: box.y + t * box.h - d / 2, w: d, h: d }, ink, p);
      }
      break;
    }
  }
}

/** A small stray dot, e.g. from resting the pen on an empty box. */
export function drawSpeck(img: RgbImage, box: Rect, ink: Rgb, p: number, rng: Rng): void {
  const d = uniform(rng, 0.3, 0.6);
  fillRect(img, { x: uniform(rng, box.x, box.x + box.w - d), y: uniform(rng, box.y, box.y + box.h - d), w: d, h: d }, ink, p);
}

/** Horizontal pen strokes with uneven ends and some gaps. */
function strokes(img: RgbImage, area: Rect, spacing: number, gapChance: number, ink: Rgb, p: number, rng: Rng): void {
  for (let y = area.y; y < area.y + area.h - PEN * 0.3; y += spacing * uniform(rng, 0.8, 1.2)) {
    if (rng() < gapChance) continue;
    const start = area.x + uniform(rng, -0.3, 0.5);
    const end = area.x + area.w + uniform(rng, -0.5, 0.3);
    fillRect(img, { x: start, y, w: end - start, h: Math.min(PEN, area.y + area.h - y) }, ink, p, uniform(rng, 0.85, 1));
  }
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}
