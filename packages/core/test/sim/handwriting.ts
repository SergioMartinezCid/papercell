/**
 * Handwritten-looking digits drawn into printed boxes: each digit is a few pen strokes through hand-placed
 * points (several ways of writing some digits, such as 1 with a flag or 7 with a bar), with random size,
 * slant, wobble, position and pen.
 */
import type { Rect } from '../../src/layout';
import glyphs from './glyphs.json';
import type { Point } from '../../src/scan/image';
import { line } from './marks';
import { gaussian, pick, uniform, type Rng } from './random';
import type { Rgb, RgbImage } from './raster';

type Stroke = Array<[number, number]>;

/** Ways of writing each digit, in a unit box (x right, y down). */
const GLYPHS = glyphs.digits as Stroke[][][];

/** Writes `digit` in `box`, in mm on an image of `p` pixels per mm. */
export function drawDigit(img: RgbImage, box: Rect, digit: number, ink: Rgb, p: number, rng: Rng): void {
  const strokes = pick(rng, GLYPHS[digit]);
  const big = rng() < 0.12;
  const h = box.h * (big ? uniform(rng, 0.85, 1.02) : uniform(rng, 0.55, 0.82));
  const w = h * uniform(rng, 0.5, 0.72);
  const slant = uniform(rng, -0.1, 0.35);
  const cx = box.x + box.w / 2 + uniform(rng, -0.3, 0.3) * Math.max(0, box.w - w);
  const cy = box.y + box.h / 2 + uniform(rng, -0.3, 0.3) * Math.max(0, box.h - h);
  const pen = uniform(rng, 0.35, 0.6);
  const wobble = uniform(rng, 0.01, 0.04);
  const toMm = ([u, v]: [number, number]): Point => {
    const du = u + wobble * gaussian(rng);
    const dv = v + wobble * gaussian(rng);
    return { x: cx + (du - 0.5) * w + slant * (0.5 - dv) * h, y: cy + (dv - 0.5) * h };
  };
  for (const stroke of strokes) {
    const points = smooth(stroke.map(toMm));
    for (let i = 1; i < points.length; i++) line(img, points[i - 1], points[i], pen, ink, p);
  }
}

/** Catmull-Rom curve through the points. */
function smooth(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < 8; s++) {
      const t = s / 8;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
