/** End-to-end synthetic case: build a sheet, print it, mark it, photograph it, scan it, compare. */
import { buildPrintable } from '../../src/drawing';
import { DEFAULT_SETTINGS, type LayoutSettings, type Template } from '../../src/layout';
import { scanPage } from '../../src/scan/scanPage';
import { normalizeSheet, type SheetCell } from '../../src/sheet';
import type { Rect } from '../../src/layout';
import { drawDigit } from './handwriting';
import { drawMark, drawSpeck, INKS, type MarkStyle } from './marks';
import type { RgbaImage } from '../../src/scan/image';
import { photograph, randomPhotoParams, type PhotoParams } from './photo';
import { mulberry32, pick, type Rng } from './random';
import { rasterize, type Rgb, type RgbImage } from './raster';

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
  /** Pen colour; by default black or blue. */
  ink?: Rgb;
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
  // Picked even when an ink is given, so the same seed draws the same marks with any pen.
  const pen = pick(rng, [INKS.black, INKS.blue]);
  const ink = c.ink ?? pen;
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

/** A list with number fields: a label column, then one column per token (e.g. `[##]`, `[#,#]`). */
export function numberTemplate(o: { rows?: number; tokens?: string[]; settings?: Partial<LayoutSettings> } = {}): Template {
  const rows = o.rows ?? 20;
  const tokens = o.tokens ?? ['[##]', '[#,#]', '[###]'];
  const header: SheetCell[] = [{ text: 'Item', style: { bold: true } }, ...tokens.map((_, i) => ({ text: `Value ${i + 1}`, style: { bold: true } }))];
  const body = Array.from({ length: rows }, (_, r) => [{ text: `Item ${r + 1}` }, ...tokens.map((text) => ({ text }))]);
  return {
    sheet: normalizeSheet({ cells: [header, ...body], colWidths: [160, ...tokens.map((t) => 30 + 22 * t.length)], rowHeights: Array(rows + 1).fill(24) }),
    overrides: {},
    settings: { ...DEFAULT_SETTINGS, title: 'Numbers', ...o.settings },
    anchor: { row: 0, col: 0 },
  };
}

export type DigitWriter = (img: RgbImage, box: Rect, digit: number, ink: Rgb, p: number, rng: Rng) => void;

export interface NumberCaseOptions {
  template: Template;
  seed: number;
  difficulty: 'easy' | 'hard';
  ink?: Rgb;
  /** How digits are written; stroke digits by default. */
  writer?: DigitWriter;
  /** Share of fields with something written in them (0.9 by default). */
  written?: number;
  renderPxPerMm?: number;
  photo?: Partial<PhotoParams>;
  onPhoto?: (photo: RgbaImage, params: PhotoParams) => void;
}

export interface NumberCaseResult {
  ok: boolean;
  error?: string;
  fields: number;
  /** Value read differs from the one written. */
  wrong: number;
  /** Wrong and not flagged for review. */
  silentWrong: number;
  uncertain: number;
  mistakes: Array<{ row: number; col: number; written: string; read: string; uncertain: boolean; confidences: number[] }>;
}

/** Writes numbers in every number field of the first page, photographs it and compares what is read. */
export function runNumberCase(c: NumberCaseOptions): NumberCaseResult {
  const rng = mulberry32(c.seed);
  const p = c.renderPxPerMm ?? 8;
  const page = buildPrintable(c.template).pages[0];
  const image = rasterize(page.drawing, p);
  const ink = c.ink ?? pick(rng, [INKS.black, INKS.blue]);
  const write = c.writer ?? drawDigit;
  const truth = new Map<string, string>();
  for (const n of page.layout.numbers) {
    const { digits, decimals, separator } = n.field;
    let whole = '';
    let fraction = '';
    if (rng() < (c.written ?? 0.9)) {
      const count = rng() < 0.7 ? digits : 1 + Math.floor(rng() * digits);
      const offset = rng() < 0.6 ? digits - count : 0;
      for (let i = 0; i < count; i++) {
        const d = i === 0 && count > 1 ? 1 + Math.floor(rng() * 9) : Math.floor(rng() * 10);
        whole += d;
        write(image, n.boxes[offset + i], d, ink, p, rng);
      }
      for (let i = 0; i < decimals; i++) {
        const d = Math.floor(rng() * 10);
        fraction += d;
        write(image, n.boxes[digits + i], d, ink, p, rng);
      }
    }
    truth.set(`${n.row},${n.col}`, fraction ? `${whole}${separator}${fraction}` : whole);
  }
  const params = { ...randomPhotoParams(rng, c.difficulty), ...c.photo };
  const photo = photograph(image, p, params, rng);
  c.onPhoto?.(photo, params);
  const outcome = scanPage(photo);
  const result: NumberCaseResult = { ok: outcome.ok, fields: 0, wrong: 0, silentWrong: 0, uncertain: 0, mistakes: [] };
  if (!outcome.ok) return { ...result, error: outcome.error };
  for (const n of outcome.scan.numbers) {
    result.fields++;
    const written = truth.get(`${n.row},${n.col}`) ?? '';
    if (n.uncertain) result.uncertain++;
    if (n.value !== written) {
      result.wrong++;
      if (!n.uncertain) result.silentWrong++;
      result.mistakes.push({ row: n.row, col: n.col, written, read: n.value, uncertain: n.uncertain, confidences: n.digits.map((d) => Math.round(d.confidence * 100) / 100) });
    }
  }
  return result;
}

/** A list with letter fields and writing lines: a label column, then one column per token (e.g. `[_____]`, `[...]`). */
export function textTemplate(o: { rows?: number; tokens?: string[]; settings?: Partial<LayoutSettings> } = {}): Template {
  const rows = o.rows ?? 20;
  const tokens = o.tokens ?? ['[______]', '[...]'];
  const header: SheetCell[] = [{ text: 'Item', style: { bold: true } }, ...tokens.map((_, i) => ({ text: `Text ${i + 1}`, style: { bold: true } }))];
  const body = Array.from({ length: rows }, (_, r) => [{ text: `Item ${r + 1}` }, ...tokens.map((text) => ({ text }))]);
  const width = (t: string) => (t.includes('_') ? 30 + 22 * t.length : 260);
  return {
    sheet: normalizeSheet({ cells: [header, ...body], colWidths: [140, ...tokens.map(width)], rowHeights: Array(rows + 1).fill(24) }),
    overrides: {},
    settings: { ...DEFAULT_SETTINGS, title: 'Text', ...o.settings },
    anchor: { row: 0, col: 0 },
  };
}
