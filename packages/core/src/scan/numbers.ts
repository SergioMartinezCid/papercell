/**
 * Reading the numbers written in number fields, one digit per box. Digit boxes are printed light, so that the
 * writing can be told from them: each box is read with some space around it, keeping only ink clearly darker
 * than the paper (and, near the outline, than the outline) that forms strokes of a real size centred on the
 * box. Strokes written over the outline or past it are kept. What is left decides whether the box is empty
 * and, if not, is read as a digit (see `digits.ts`).
 */
import { gridCellRect, type Rect } from '../layout';
import { sourceRowOf, type PagePayload } from '../payload';
import { digitBoxes } from '../spec';
import type { NumberField } from '../tokens';
import { classifyDigit, normalizeDigit } from './digits';
import type { GrayImage, Point } from './image';

export interface DigitRead {
  /** The box, where it is expected on the page: where it was printed, moved like the checkboxes around it. */
  box: Rect;
  /** Writing kept in and around the box (summed ink), per unit of box area: 0 when empty. */
  fill: number;
  /** The digit read, or null for an empty box. */
  digit: number | null;
  /** Probability of `digit` (for empty boxes, how surely the box is empty). */
  confidence: number;
}

export interface ReadNumber {
  row: number;
  col: number;
  pageRow: number;
  cell: Rect;
  field: NumberField;
  digits: DigitRead[];
  /** The number as text, with the field's separator; empty when nothing is written. */
  value: string;
  /** Some digit, or the way the digits are placed, is doubtful: a person should check the value. */
  uncertain: boolean;
}

/**
 * Empty and written digit boxes are told apart per page, at the widest gap between their fills (see
 * `DigitRead.fill`): empty boxes have none or nearly none, below SPLIT_LOW, and written ones some, above
 * SPLIT_HIGH. A gap narrower than MIN_GAP is not trusted: then a page whose typical box is below FALLBACK is
 * taken as mostly empty, written from EMPTY_SPREAD above its typical box, and other pages are split at
 * FALLBACK. Boxes closer than DOUBT to the split are flagged.
 */
const SPLIT_LOW = 0.06;
const SPLIT_HIGH = 0.02;
const MIN_GAP = 0.02;
const FALLBACK = 0.02;
const EMPTY_SPREAD = 0.015;
const DOUBT = 0.01;
/** Digits read with less probability than this are flagged. */
const MIN_CONFIDENCE = 0.95;
/**
 * Space around a digit box read with it (mm), so that strokes written over or past the outline are kept;
 * between two boxes, up to half the gap.
 */
const OVERFLOW = 0.8;
/**
 * Writing is ink this much darker than the paper around the box (its median, which shading can darken) and,
 * near the printed outline, which is light (see `DIGIT_BOX_COLOR`), this much darker than the outline.
 */
const ABOVE_PAPER = 0.12;
const ABOVE_OUTLINE = 0.1;
/** Blobs of writing smaller than this (mm²) are specks, not strokes. */
const MIN_STROKE_AREA = 0.8;
/** Blobs lying mostly (OUTLINE_SHARE) within this distance of the box outline (mm) are the outline, where shading darkened it. */
const OUTLINE_BAND = 0.6;
const OUTLINE_SHARE = 0.7;
/** A blob belongs to a box when its centre is in the box or this close to it (mm), as the box may be slightly off. */
const CENTRE_SLACK = 0.5;

/** Boxes found on the page (checkboxes), whose shifts show how the paper bent around them. */
export interface Anchor {
  box: Rect;
  shift: Point;
}

/** How many nearby anchors give the shift of a digit box, and how near they must be (mm). */
const ANCHORS = 6;
const ANCHOR_RANGE = 50;

/**
 * Reads the number fields of a page. Digit boxes are light, so they are not found by their outline (cell
 * gridlines look alike): they take the shift of nearby checkboxes (`anchors`), if any, and the crop around
 * each box leaves room for the rest.
 */
export function readNumbers(page: GrayImage, pxPerMm: number, payload: PagePayload, anchors: Anchor[] = []): ReadNumber[] {
  const fields = (payload.numbers ?? []).map((n) => {
    const cell = gridCellRect(payload.grid, n.pageRow, n.col, n.rowSpan, n.colSpan);
    return { ...n, row: sourceRowOf(payload, n.pageRow), cell, ...digitBoxes(cell, n.field, payload.version) };
  });
  if (fields.length === 0) return [];
  const outline = outlineLevel(page, pxPerMm, fields.flatMap((f) => f.boxes));
  const crops = fields.map((f) =>
    f.boxes.map((printed, i) => {
      const shift = shiftNear(anchors, printed);
      const box = { ...printed, x: printed.x + shift.x, y: printed.y + shift.y };
      const before = f.boxes[i - 1];
      const after = f.boxes[i + 1];
      const left = Math.max(f.cell.x, before ? (before.x + before.w + printed.x) / 2 : -Infinity, printed.x - OVERFLOW);
      const right = Math.min(f.cell.x + f.cell.w, after ? (printed.x + printed.w + after.x) / 2 : Infinity, printed.x + printed.w + OVERFLOW);
      const top = Math.max(f.cell.y, printed.y - OVERFLOW);
      const bottom = Math.min(f.cell.y + f.cell.h, printed.y + printed.h + OVERFLOW);
      const area = { x: left + shift.x, y: top + shift.y, w: right - left, h: bottom - top };
      // The printed separator is no writing either.
      const sep = f.separator && { x: f.separator.x + 0.15 * f.separator.w + shift.x, y: f.separator.y + shift.y, w: 0.7 * f.separator.w, h: f.separator.h };
      const [ink, w, h] = cropInk(page, pxPerMm, area, box, outline + ABOVE_OUTLINE, sep);
      keepStrokes(ink, w, h, MIN_STROKE_AREA * pxPerMm * pxPerMm, OUTLINE_BAND * pxPerMm, CENTRE_SLACK * pxPerMm, {
        x0: (box.x - area.x) * pxPerMm,
        y0: (box.y - area.y) * pxPerMm,
        x1: (box.x + box.w - area.x) * pxPerMm,
        y1: (box.y + box.h - area.y) * pxPerMm,
      });
      const fill = ink.reduce((sum, v) => sum + v, 0) / Math.max(1, box.w * box.h * pxPerMm * pxPerMm);
      return { box, fill, ink, w, h };
    }),
  );
  const written = writtenFrom(crops.flat().map((c) => c.fill));
  return fields.map((f, i) => {
    const digits = crops[i].map((c) => readDigit(c, written));
    return { row: f.row, col: f.col, pageRow: f.pageRow, cell: f.cell, field: f.field, digits, ...numberValue(f.field, digits) };
  });
}

/**
 * Darkness of the printed digit box outlines: for points along them, the darkest pixel across the line within
 * OUTLINE_BAND (the boxes may be slightly off), then the median of those (strokes crossing them are few).
 */
function outlineLevel(page: GrayImage, p: number, boxes: Rect[]): number {
  const ink = (x: number, y: number) => {
    const [px, py] = [Math.round(x * p), Math.round(y * p)];
    return px >= 0 && py >= 0 && px < page.width && py < page.height ? 1 - page.data[py * page.width + px] : 0;
  };
  const across = (x: number, y: number, dx: number, dy: number) => {
    let max = 0;
    for (let t = -OUTLINE_BAND; t <= OUTLINE_BAND; t += 1 / p) max = Math.max(max, ink(x + t * dx, y + t * dy));
    return max;
  };
  const samples: number[] = [];
  for (const b of boxes) {
    for (let t = 0.15; t < 0.9; t += 0.15) {
      samples.push(across(b.x + t * b.w, b.y, 0, 1), across(b.x + t * b.w, b.y + b.h, 0, 1));
      samples.push(across(b.x, b.y + t * b.h, 1, 0), across(b.x + b.w, b.y + t * b.h, 1, 0));
    }
  }
  samples.sort((a, b) => a - b);
  return samples[samples.length >> 1];
}

/** The fill from which a digit box counts as written, for the digit boxes of one page (see SPLIT_LOW). */
export function writtenFrom(fills: number[]): number {
  const s = [...fills].sort((a, b) => a - b);
  let best = { gap: 0, at: FALLBACK };
  for (let i = 0; i + 1 < s.length; i++) {
    if (s[i] > SPLIT_LOW || s[i + 1] < SPLIT_HIGH) continue;
    const gap = s[i + 1] - s[i];
    if (gap > best.gap) best = { gap, at: (s[i] + s[i + 1]) / 2 };
  }
  if (best.gap >= MIN_GAP) return best.at;
  const typical = s[s.length >> 1] ?? 0;
  return typical < FALLBACK ? Math.max(FALLBACK, typical + EMPTY_SPREAD) : FALLBACK;
}

/** Median shift of the nearest anchors, or none. */
function shiftNear(anchors: Anchor[], box: Rect): Point {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const near = anchors
    .map((a) => ({ a, d: Math.hypot(a.box.x + a.box.w / 2 - cx, a.box.y + a.box.h / 2 - cy) }))
    .filter((n) => n.d <= ANCHOR_RANGE)
    .sort((a, b) => a.d - b.d)
    .slice(0, ANCHORS);
  if (near.length === 0) return { x: 0, y: 0 };
  return { x: median(near.map((n) => n.a.shift.x)), y: median(near.map((n) => n.a.shift.y)) };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function readDigit({ box, fill, ink, w, h }: { box: Rect; fill: number; ink: Float32Array; w: number; h: number }, written: number): DigitRead {
  const doubtful = Math.abs(fill - written) < DOUBT;
  if (fill < written) return { box, fill, digit: null, confidence: doubtful ? 0.5 : 1 };
  const probabilities = classifyDigit(normalizeDigit(ink, w, h));
  const digit = probabilities.indexOf(Math.max(...probabilities));
  return { box, fill, digit, confidence: doubtful ? Math.min(0.5, probabilities[digit]) : probabilities[digit] };
}

/**
 * The writing in `area`: ink (1 − brightness) darker than the paper there by ABOVE_PAPER and, within
 * OUTLINE_BAND of the outline of `box`, darker than `outlineFloor`; anything else, and anything in `exclude`,
 * is set to 0.
 */
export function cropInk(
  page: GrayImage,
  pxPerMm: number,
  area: Rect,
  box: Rect,
  outlineFloor: number,
  exclude: Rect | null = null,
): [Float32Array, number, number] {
  const p = pxPerMm;
  const x0 = Math.round(area.x * p);
  const y0 = Math.round(area.y * p);
  const w = Math.max(1, Math.round((area.x + area.w) * p) - x0);
  const h = Math.max(1, Math.round((area.y + area.h) * p) - y0);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [px, py] = [x0 + x, y0 + y];
      out[y * w + x] = px >= 0 && py >= 0 && px < page.width && py < page.height ? 1 - page.data[py * page.width + px] : 0;
    }
  }
  const paper = Float32Array.from(out).sort()[out.length >> 1] + ABOVE_PAPER;
  const near = (v: number, edge: number) => Math.abs(v - edge) <= OUTLINE_BAND;
  for (let y = 0; y < h; y++) {
    const my = (y0 + y + 0.5) / p;
    for (let x = 0; x < w; x++) {
      const mx = (x0 + x + 0.5) / p;
      const onOutline =
        ((near(mx, box.x) || near(mx, box.x + box.w)) && my > box.y - OUTLINE_BAND && my < box.y + box.h + OUTLINE_BAND) ||
        ((near(my, box.y) || near(my, box.y + box.h)) && mx > box.x - OUTLINE_BAND && mx < box.x + box.w + OUTLINE_BAND);
      const i = y * w + x;
      const excluded = exclude && mx >= exclude.x && mx <= exclude.x + exclude.w && my >= exclude.y && my <= exclude.y + exclude.h;
      if (excluded || out[i] <= (onOutline ? Math.max(paper, outlineFloor) : paper)) out[i] = 0;
    }
  }
  return [out, w, h];
}

/**
 * Keeps the blobs of ink (8-connected) that are at least `minArea` pixels, centred inside `box` (pixels of the
 * crop, give or take `slack`) and not mostly within `band` pixels of its outline: the strokes of the digit in this box, without
 * specks, pieces of a neighbour's digit or the outline itself.
 */
function keepStrokes(
  ink: Float32Array,
  w: number,
  h: number,
  minArea: number,
  band: number,
  slack: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): void {
  const near = (v: number, edge: number) => Math.abs(v - edge) <= band;
  const onOutline = (x: number, y: number) =>
    ((near(x, box.x0) || near(x, box.x1)) && y >= box.y0 - band && y <= box.y1 + band) ||
    ((near(y, box.y0) || near(y, box.y1)) && x >= box.x0 - band && x <= box.x1 + band);
  const label = new Int32Array(w * h).fill(-1);
  const keep: boolean[] = [];
  const stack: number[] = [];
  for (let start = 0; start < ink.length; start++) {
    if (ink[start] === 0 || label[start] >= 0) continue;
    const id = keep.length;
    let size = 0;
    let sx = 0;
    let sy = 0;
    let outline = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      size++;
      sx += x;
      sy += y;
      if (onOutline(x + 0.5, y + 0.5)) outline++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (ink[j] !== 0 && label[j] < 0) {
            label[j] = id;
            stack.push(j);
          }
        }
      }
    }
    const [cx, cy] = [sx / size + 0.5, sy / size + 0.5];
    const inside = cx >= box.x0 - slack && cx <= box.x1 + slack && cy >= box.y0 - slack && cy <= box.y1 + slack;
    keep.push(size >= minArea && inside && outline < OUTLINE_SHARE * size);
  }
  for (let i = 0; i < ink.length; i++) if (ink[i] !== 0 && !keep[label[i]]) ink[i] = 0;
}

/**
 * The value of a field from its digits. Empty boxes before or after the digits of the whole part are
 * fine (numbers written right or left aligned); a gap between digits, or decimals without a whole part,
 * is doubtful.
 */
function numberValue(field: NumberField, digits: DigitRead[]): { value: string; uncertain: boolean } {
  const text = (ds: DigitRead[]) => ds.map((d) => (d.digit === null ? ' ' : String(d.digit))).join('');
  const whole = text(digits.slice(0, field.digits)).trim();
  const decimals = text(digits.slice(field.digits)).trimEnd();
  let uncertain = digits.some((d) => d.confidence < MIN_CONFIDENCE);
  if (whole.includes(' ') || decimals.includes(' ') || (decimals && !whole)) uncertain = true;
  const clean = (s: string) => s.replace(/ /g, '');
  const value = decimals ? `${clean(whole) || '0'}${field.separator}${clean(decimals)}` : clean(whole);
  return { value, uncertain };
}
