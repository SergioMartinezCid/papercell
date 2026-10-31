/** Locating each printed box precisely and measuring how much of it is inked. */
import type { Rect } from '../layout';
import { Integral, type GrayImage, type Point } from './image';

export interface BoxTarget {
  row: number;
  col: number;
  pageRow: number;
  /** Cell and box where they were printed, in paper millimetres. */
  cell: Rect;
  box: Rect;
}

export interface BoxReading extends BoxTarget {
  /** Correction applied to the printed position, in mm (paper curl, small fitting errors). */
  shift: Point;
  /** Mean ink darkness inside the box, 0 (blank paper) to 1 (solid black). */
  fill: number;
}

const SEARCH_MM = 2;
const MAX_DEVIATION_MM = 0.8;
const NEIGHBOURS = 6;
const NEIGHBOUR_RANGE_MM = 50;

/**
 * Reads every box from a straightened page with flattened lighting (`page`, sampled at `pxPerMm`
 * from the paper origin).
 */
export function readBoxes(page: GrayImage, pxPerMm: number, targets: BoxTarget[]): BoxReading[] {
  const ink = new Integral(page, (v) => 1 - v);
  const p = pxPerMm;
  const half = Math.max(1, Math.round(0.3 * p));
  const ring = Math.max(2, Math.round(0.7 * p));

  const snaps = targets.map((t) => {
    const x0 = Math.round(t.box.x * p);
    const y0 = Math.round(t.box.y * p);
    const x1 = Math.round((t.box.x + t.box.w) * p);
    const y1 = Math.round((t.box.y + t.box.h) * p);
    const radius = Math.max(1, Math.round(Math.min(SEARCH_MM, 0.4 * Math.min(t.cell.w, t.cell.h)) * p));
    let best = { score: -Infinity, dx: 0, dy: 0, outside: 1 };
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const bx0 = x0 + dx - half;
        const by0 = y0 + dy - half;
        const bx1 = x1 + dx + half;
        const by1 = y1 + dy + half;
        const edge = bandMean(ink, bx0, by0, bx1, by1, 2 * half);
        const outer = bandMean(ink, bx0 - ring, by0 - ring, bx1 + ring, by1 + ring, ring);
        // Prefer the smallest shift on ties so blank areas stay put.
        const score = edge - outer - 1e-4 * (Math.abs(dx) + Math.abs(dy));
        if (score > best.score) best = { score, dx, dy, outside: outer };
      }
    }
    const confident = best.score > 0.2 && best.outside < 0.3;
    return { dx: best.dx / p, dy: best.dy / p, confident };
  });

  const centre = (t: BoxTarget) => ({ x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 });
  const anchors = targets.map((t, i) => ({ c: centre(t), s: snaps[i] })).filter((a) => a.s.confident);

  return targets.map((t, i) => {
    const own = snaps[i];
    const c = centre(t);
    const near = anchors
      .map((a) => ({ a, d: Math.hypot(a.c.x - c.x, a.c.y - c.y) }))
      .filter((n) => n.d <= NEIGHBOUR_RANGE_MM)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBOURS);
    let shift: Point = own.confident ? { x: own.dx, y: own.dy } : { x: 0, y: 0 };
    if (near.length > 0) {
      const med = { x: median(near.map((n) => n.a.s.dx)), y: median(near.map((n) => n.a.s.dy)) };
      if (!own.confident || Math.hypot(own.dx - med.x, own.dy - med.y) > MAX_DEVIATION_MM) shift = med;
    }
    const box = { ...t.box, x: t.box.x + shift.x, y: t.box.y + shift.y };
    const inset = half + Math.round(0.12 * box.w * p);
    const fill = ink.mean(
      Math.round(box.x * p) + inset,
      Math.round(box.y * p) + inset,
      Math.round((box.x + box.w) * p) - inset,
      Math.round((box.y + box.h) * p) - inset,
    );
    return { ...t, box, shift, fill };
  });
}

/** Mean over the band of thickness `width` just inside the rectangle [x0, x1) × [y0, y1). */
function bandMean(ink: Integral, x0: number, y0: number, x1: number, y1: number, width: number): number {
  const outer = ink.sum(x0, y0, x1, y1);
  const inner = ink.sum(x0 + width, y0 + width, x1 - width, y1 - width);
  const area = (x1 - x0) * (y1 - y0) - Math.max(0, x1 - x0 - 2 * width) * Math.max(0, y1 - y0 - 2 * width);
  return area > 0 ? (outer - inner) / area : 0;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
