/**
 * Handwritten-looking digits and capital letters drawn into printed boxes or on writing lines: each character
 * is a few pen strokes through hand-placed points (several ways of writing some, such as 1 with a flag or 7
 * with a bar), with random size, slant, wobble, position and pen.
 */
import type { Rect } from '../../src/layout';
import glyphs from './glyphs.json';
import type { Point } from '../../src/scan/image';
import { line } from './marks';
import { gaussian, pick, uniform, type Rng } from './random';
import type { Rgb, RgbImage } from './raster';

type Stroke = Array<[number, number]>;

/** Ways of writing each digit, in a unit box (x right, y down). */
const DIGITS = glyphs.digits as Stroke[][][];
/** Ways of writing each capital letter (A–Z, Ñ). */
const LETTERS = glyphs.letters as unknown as Record<string, Stroke[][]>;

/** Writes `digit` in `box`, in mm on an image of `p` pixels per mm. */
export function drawDigit(img: RgbImage, box: Rect, digit: number, ink: Rgb, p: number, rng: Rng): void {
  drawInBox(img, box, pick(rng, DIGITS[digit]), [0.5, 0.72], ink, p, rng);
}

/** Writes a capital letter (A–Z, Ñ) or a digit in `box`. */
export function drawLetter(img: RgbImage, box: Rect, letter: string, ink: Rgb, p: number, rng: Rng): void {
  if (/\d/.test(letter)) drawDigit(img, box, Number(letter), ink, p, rng);
  else drawInBox(img, box, pick(rng, LETTERS[letter]), [0.6, 0.92], ink, p, rng);
}

/** Writes `text` (capitals, digits and spaces) on the writing line `ruled`, in the space of `cell` above it. */
export function drawText(img: RgbImage, cell: Rect, ruled: { x: number; y: number; w: number }, text: string, ink: Rgb, p: number, rng: Rng): void {
  const h = (ruled.y - cell.y) * uniform(rng, 0.45, 0.75);
  const pen = uniform(rng, 0.35, 0.6);
  let x = ruled.x + uniform(rng, 0, 0.25) * ruled.w;
  for (const ch of text) {
    const w = h * uniform(rng, 0.55, 0.8);
    if (x + w > ruled.x + ruled.w) break;
    if (ch !== ' ') {
      const strokes = /\d/.test(ch) ? pick(rng, DIGITS[Number(ch)]) : pick(rng, LETTERS[ch]);
      const at = { cx: x + w / 2, cy: ruled.y - 0.3 - h / 2 + uniform(rng, -0.2, 0.2), w, h };
      drawStrokes(img, strokes, { ...at, slant: uniform(rng, -0.1, 0.35), pen, wobble: uniform(rng, 0.01, 0.04) }, ink, p, rng);
    }
    x += w * uniform(rng, 1.1, 1.35);
  }
}

function drawInBox(img: RgbImage, box: Rect, strokes: Stroke[], aspect: [number, number], ink: Rgb, p: number, rng: Rng): void {
  const big = rng() < 0.12;
  const h = box.h * (big ? uniform(rng, 0.85, 1.02) : uniform(rng, 0.55, 0.82));
  const w = h * uniform(rng, aspect[0], aspect[1]);
  const slant = uniform(rng, -0.1, 0.35);
  const cx = box.x + box.w / 2 + uniform(rng, -0.3, 0.3) * Math.max(0, box.w - w);
  const cy = box.y + box.h / 2 + uniform(rng, -0.3, 0.3) * Math.max(0, box.h - h);
  const pen = uniform(rng, 0.35, 0.6);
  const wobble = uniform(rng, 0.01, 0.04);
  drawStrokes(img, strokes, { cx, cy, w, h, slant, pen, wobble }, ink, p, rng);
}

interface Placement {
  /** Centre and size (mm) of the unit box the strokes are drawn in. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Horizontal shift per unit of height, upwards. */
  slant: number;
  /** Pen width (mm). */
  pen: number;
  /** Random shift of each point, in units of the box. */
  wobble: number;
}

/** Draws strokes given in a unit box, placed, slanted and wobbled as `Placement` says. */
function drawStrokes(img: RgbImage, strokes: Stroke[], { cx, cy, w, h, slant, pen, wobble }: Placement, ink: Rgb, p: number, rng: Rng): void {
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
