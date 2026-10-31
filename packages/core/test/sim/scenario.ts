/** End-to-end synthetic case: build a sheet, print it, mark it, photograph it, scan it, compare. */
import { buildPrintable } from '../../src/drawing';
import { DEFAULT_SETTINGS, type LayoutSettings, type Template } from '../../src/layout';
import { scanPage } from '../../src/scan/scanPage';
import { normalizeSheet, type SheetCell } from '../../src/sheet';
import { drawMark, drawSpeck, INKS, type MarkStyle } from './marks';
import type { RgbaImage } from '../../src/scan/image';
import { photograph, randomPhotoParams, type PhotoParams } from './photo';
import { mulberry32, pick, type Rng } from './random';
import { rasterize } from './raster';

export interface SampleOptions {
  rows?: number;
  options?: number;
  /** Background of every other row (as spreadsheet "alternating colours" do), or null. */
  stripe?: string | null;
  headerBackground?: string | null;
  settings?: Partial<LayoutSettings>;
}

/** A generic list: one label column followed by option columns to mark. */
export function sampleTemplate(o: SampleOptions = {}): Template {
  const rows = o.rows ?? 30;
  const options = o.options ?? 4;
  const header: SheetCell[] = [
    { text: 'Item', style: { bold: true, ...(o.headerBackground ? { background: o.headerBackground } : {}) } },
    ...Array.from({ length: options }, (_, i) => ({
      text: `Option ${i + 1}`,
      style: { bold: true, align: 'center' as const, ...(o.headerBackground ? { background: o.headerBackground } : {}) },
    })),
  ];
  const body = Array.from({ length: rows }, (_, r) => {
    const style = o.stripe && r % 2 === 1 ? { background: o.stripe } : undefined;
    return [{ text: `Item ${r + 1}`, style }, ...Array.from({ length: options }, () => ({ text: '', style }))];
  });
  return {
    sheet: normalizeSheet({ cells: [header, ...body], colWidths: [180, ...Array(options).fill(80)], rowHeights: Array(rows + 1).fill(24) }),
    overrides: {},
    settings: { ...DEFAULT_SETTINGS, title: 'Sample sheet', ...o.settings },
    anchor: { row: 0, col: 0 },
  };
}

export interface CaseOptions {
  template: Template;
  seed: number;
  difficulty: 'easy' | 'hard';
  /** Mark styles to draw, picked uniformly. */
  styles?: MarkStyle[];
  renderPxPerMm?: number;
  photo?: Partial<PhotoParams>;
  /** Called with the simulated photo, e.g. to save it for inspection. */
  onPhoto?: (photo: RgbaImage, params: PhotoParams) => void;
}

export interface CaseResult {
  ok: boolean;
  error?: string;
  boxes: number;
  /** Final decision differs from the truth. */
  wrong: number;
  /** Wrong and not flagged for review: the errors that would reach the spreadsheet. */
  silentWrong: number;
  uncertain: number;
  emptyFills: number[];
  markedFills: number[];
  /** Fills of empty boxes in rows that have a background colour. */
  emptyStripedFills: number[];
  /** Every box read wrongly, with what was drawn in it. */
  mistakes: Array<{ row: number; col: number; drawn: MarkStyle | 'speck' | 'nothing'; fill: number; threshold: number; uncertain: boolean }>;
  ms: number;
}

const DEFAULT_STYLES: MarkStyle[] = ['fill', 'fill', 'fill', 'scribble', 'scribble', 'cell'];

export function runCase(c: CaseOptions): CaseResult {
  const rng = mulberry32(c.seed);
  const p = c.renderPxPerMm ?? 8;
  const printable = buildPrintable(c.template);
  const page = printable.pages[0];
  const image = rasterize(page.drawing, p);
  const truth = chooseMarks(page.layout.boxes.map((b) => ({ row: b.row, col: b.col })), rng);

  const styles = c.styles ?? DEFAULT_STYLES;
  const ink = pick(rng, [INKS.black, INKS.blue]);
  const drawn = new Map<string, MarkStyle | 'speck'>();
  for (const b of page.layout.boxes) {
    const key = `${b.row},${b.col}`;
    if (truth.has(key)) {
      const style = pick(rng, styles);
      drawMark(image, b.box, b.cell, style, ink, p, rng);
      drawn.set(key, style);
    } else if (rng() < 0.03) {
      drawSpeck(image, b.box, ink, p, rng);
      drawn.set(key, 'speck');
    }
  }
  const params = { ...randomPhotoParams(rng, c.difficulty), ...c.photo };
  const photo = photograph(image, p, params, rng);
  c.onPhoto?.(photo, params);

  const started = performance.now();
  const outcome = scanPage(photo);
  const ms = performance.now() - started;
  const empty: CaseResult = { ok: false, boxes: 0, wrong: 0, silentWrong: 0, uncertain: 0, emptyFills: [], markedFills: [], emptyStripedFills: [], mistakes: [], ms };
  if (!outcome.ok) return { ...empty, error: outcome.error };

  const striped = new Set(
    c.template.sheet.cells.flatMap((row, r) => row.map((cell, col) => (cell.style?.background ? `${r},${col}` : '')).filter(Boolean)),
  );
  const result = { ...empty, ok: true, boxes: outcome.scan.boxes.length };
  for (const b of outcome.scan.boxes) {
    const key = `${b.row},${b.col}`;
    const truthMarked = truth.has(key);
    if (b.marked !== truthMarked) {
      result.wrong++;
      if (!b.uncertain) result.silentWrong++;
      result.mistakes.push({ row: b.row, col: b.col, drawn: drawn.get(key) ?? 'nothing', fill: b.fill, threshold: outcome.scan.threshold.value, uncertain: b.uncertain });
    }
    if (b.uncertain) result.uncertain++;
    if (truthMarked) result.markedFills.push(b.fill);
    else {
      result.emptyFills.push(b.fill);
      if (striped.has(key)) result.emptyStripedFills.push(b.fill);
    }
  }
  return result;
}

/** Mostly one mark per row, sometimes none or two. */
function chooseMarks(boxes: Array<{ row: number; col: number }>, rng: Rng): Set<string> {
  const byRow = new Map<number, number[]>();
  for (const b of boxes) byRow.set(b.row, [...(byRow.get(b.row) ?? []), b.col]);
  const marked = new Set<string>();
  for (const [row, cols] of byRow) {
    const r = rng();
    const count = r < 0.1 ? 0 : r < 0.95 ? 1 : 2;
    const shuffled = [...cols].sort(() => rng() - 0.5);
    for (const col of shuffled.slice(0, count)) marked.add(`${row},${col}`);
  }
  return marked;
}
