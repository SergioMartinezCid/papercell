/**
 * Writing lines. What is written on them is not read, only whether something is, so that whoever reviews the
 * page types it in from the photo. The line's cell is searched for strokes clearly darker than the paper and
 * than the printed lines (writing lines and gridlines, which are light), leaving out the printed lines
 * themselves.
 */
import { gridCellRect, type Rect } from '../layout';
import { sourceRowOf, type PagePayload } from '../payload';
import { writingLine } from '../spec';
import { shiftNear, type Anchor } from './fields';
import { inkBlobs, type GrayImage } from './image';

export interface ReadLine {
  row: number;
  col: number;
  pageRow: number;
  cell: Rect;
  /** Where writing was looked for: the cell without its edges, moved like the checkboxes around it. */
  area: Rect;
  /** Writing found, in mm² of ink. */
  ink: number;
  written: boolean;
  /** Whether something is written is doubtful. */
  uncertain: boolean;
}

/** Left out along the cell's edges (mm), where its gridlines are. */
const EDGE = 0.8;
/** Writing is ink this much darker than the paper around it, and this much darker than the printed lines. */
const ABOVE_PAPER = 0.12;
const ABOVE_PRINTED = 0.1;
/** Blobs smaller than this (mm²) are specks. */
const MIN_STROKE_AREA = 0.8;
/** Blobs lying mostly (PRINTED_SHARE) within this distance (mm) of the writing line or of the edges are printed lines. */
const PRINTED_BAND = 0.6;
const PRINTED_SHARE = 0.7;
/** A line is written from this much ink (mm²); within DOUBT of it, that is doubtful. */
const WRITTEN = 1.5;
const DOUBT: [number, number] = [0.8, 3];

export function readLines(page: GrayImage, pxPerMm: number, payload: PagePayload, anchors: Anchor[] = []): ReadLine[] {
  const lines = (payload.lines ?? []).map((l) => {
    const cell = gridCellRect(payload.grid, l.pageRow, l.col, l.rowSpan, l.colSpan);
    return { row: sourceRowOf(payload, l.pageRow), col: l.col, pageRow: l.pageRow, cell, line: writingLine(cell, payload.version) };
  });
  if (lines.length === 0) return [];
  const printed = printedLevel(page, pxPerMm, lines.map((l) => l.line));
  return lines.map(({ line, ...l }) => {
    const shift = shiftNear(anchors, l.cell);
    const area = { x: l.cell.x + EDGE + shift.x, y: l.cell.y + EDGE + shift.y, w: l.cell.w - 2 * EDGE, h: l.cell.h - 2 * EDGE };
    const ruled = { x: line.x + shift.x, y: line.y + shift.y, w: line.w };
    const ink = writingIn(page, pxPerMm, area, ruled, printed + ABOVE_PRINTED);
    return { ...l, area, ink, written: ink >= WRITTEN, uncertain: ink > DOUBT[0] && ink < DOUBT[1] };
  });
}

/**
 * Darkness of the printed writing lines: for points along them, the darkest pixel across the line within
 * PRINTED_BAND (the page may be slightly off), then the median of those (writing crosses them in few places).
 */
function printedLevel(page: GrayImage, p: number, lines: Array<{ x: number; y: number; w: number }>): number {
  const samples: number[] = [];
  for (const line of lines) {
    for (let t = 0.05; t < 1; t += 0.1) {
      let max = 0;
      for (let d = -PRINTED_BAND; d <= PRINTED_BAND; d += 1 / p) {
        const [px, py] = [Math.round((line.x + t * line.w) * p), Math.round((line.y + d) * p)];
        if (px >= 0 && py >= 0 && px < page.width && py < page.height) max = Math.max(max, 1 - page.data[py * page.width + px]);
      }
      samples.push(max);
    }
  }
  samples.sort((a, b) => a - b);
  return samples[samples.length >> 1];
}

/** Ink (mm²) of the strokes written in `area`: blobs of ink above `floor` and the paper, of a real size, that are not printed lines. */
function writingIn(page: GrayImage, p: number, area: Rect, line: { x: number; y: number; w: number }, floor: number): number {
  const x0 = Math.round(area.x * p);
  const y0 = Math.round(area.y * p);
  const w = Math.max(1, Math.round((area.x + area.w) * p) - x0);
  const h = Math.max(1, Math.round((area.y + area.h) * p) - y0);
  const ink = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [px, py] = [x0 + x, y0 + y];
      ink[y * w + x] = px >= 0 && py >= 0 && px < page.width && py < page.height ? 1 - page.data[py * page.width + px] : 0;
    }
  }
  const threshold = Math.max(Float32Array.from(ink).sort()[ink.length >> 1] + ABOVE_PAPER, floor);
  for (let i = 0; i < ink.length; i++) if (ink[i] <= threshold) ink[i] = 0;
  const band = PRINTED_BAND * p;
  const [lx0, lx1, ly] = [(line.x - area.x) * p, (line.x + line.w - area.x) * p, (line.y - area.y) * p];
  const printed = (x: number, y: number) =>
    (Math.abs(y - ly) <= band && x >= lx0 - band && x <= lx1 + band) || x <= band || y <= band || x >= w - band || y >= h - band;
  const { blobs } = inkBlobs(ink, w, h, printed);
  const kept = blobs.filter((b) => b.size >= MIN_STROKE_AREA * p * p && b.tagged < PRINTED_SHARE * b.size);
  return kept.reduce((sum, b) => sum + b.size, 0) / (p * p);
}
