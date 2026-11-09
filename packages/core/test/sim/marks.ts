/** Hand-made marks drawn into a printed page. */
import type { Rect } from '../../src/layout';
import type { Point } from '../../src/scan/image';
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
  | 'light'
  /** A quick zigzag with a fine pen, covering about half the box. */
  | 'squiggle';

export const INKS: Record<'black' | 'blue' | 'red' | 'pencil', Rgb> = {
  black: [0.1, 0.1, 0.12],
  blue: [0.12, 0.17, 0.48],
  red: [0.88, 0.45, 0.45],
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
    case 'cross':
      line(img, { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, 0.6, ink, p);
      line(img, { x: box.x + box.w, y: box.y }, { x: box.x, y: box.y + box.h }, 0.6, ink, p);
      break;
    case 'squiggle': {
      const w = box.w * uniform(rng, 0.3, 0.6);
      const h = box.h * uniform(rng, 0.55, 0.85);
      const x = box.x + (box.w - w) / 2 + uniform(rng, -0.1, 0.1) * box.w;
      const y = box.y + (box.h - h) / 2 + uniform(rng, -0.1, 0.1) * box.h;
      const turns = 3 + Math.floor(rng() * 3);
      const pen = uniform(rng, 0.4, 0.6);
      let from = { x: x + uniform(rng, -0.15, 0.15) * w, y };
      for (let i = 1; i <= turns; i++) {
        const to = { x: x + (i % 2) * w + uniform(rng, -0.15, 0.15) * w, y: y + (i / turns) * h };
        line(img, from, to, pen, ink, p);
        from = to;
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

/** A straight pen stroke of width `pen` between two points (mm). */
function line(img: RgbImage, a: Point, b: Point, pen: number, ink: Rgb, p: number): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillRect(img, { x: a.x + t * (b.x - a.x) - pen / 2, y: a.y + t * (b.y - a.y) - pen / 2, w: pen, h: pen }, ink, p);
  }
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}
