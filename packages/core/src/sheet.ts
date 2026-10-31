/** A rectangular range copied from a spreadsheet: text, light formatting and geometry. */

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  /** CSS colour of the cell background, e.g. `#f3f3f3`. Absent means white. */
  background?: string;
  /** CSS colour of the text. */
  color?: string;
  /** Font size in points. */
  fontSize?: number;
}

export interface SheetCell {
  text: string;
  style?: CellStyle;
}

export interface Merge {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface Sheet {
  /** `cells[row][col]`; every row has the same number of cells. */
  cells: SheetCell[][];
  /** Column widths in CSS pixels. */
  colWidths: number[];
  /** Row heights in CSS pixels. */
  rowHeights: number[];
  merges: Merge[];
}

/**
 * How a cell is treated:
 * - `text`: printed, never scanned.
 * - `mark`: printed as an empty box and read back as marked / empty.
 * - `blank`: empty, printed as an empty cell and not scanned.
 * - `covered`: hidden under a merged cell.
 *
 * A future `write` kind (handwriting read by OCR) fits next to `mark`.
 */
export type CellKind = 'text' | 'mark' | 'blank' | 'covered';

/** Per-cell overrides chosen by the user, keyed by `cellKey(row, col)`. */
export type KindOverrides = Record<string, 'mark' | 'blank'>;

export const DEFAULT_COL_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 21;
export const DEFAULT_FONT_SIZE = 10;

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** Pads ragged rows, fills missing geometry and drops merges that fall outside the range. */
export function normalizeSheet(input: {
  cells: SheetCell[][];
  colWidths?: number[];
  rowHeights?: number[];
  merges?: Merge[];
}): Sheet {
  const rowCount = input.cells.length;
  const colCount = Math.max(0, ...input.cells.map((r) => r.length));
  const cells = input.cells.map((row) => {
    const out = row.map((c) => ({ text: c.text ?? '', ...(c.style ? { style: c.style } : {}) }));
    while (out.length < colCount) out.push({ text: '' });
    return out;
  });
  const colWidths = Array.from({ length: colCount }, (_, i) => positive(input.colWidths?.[i], DEFAULT_COL_WIDTH));
  const rowHeights = Array.from({ length: rowCount }, (_, i) => positive(input.rowHeights?.[i], DEFAULT_ROW_HEIGHT));
  const merges = (input.merges ?? []).filter(
    (m) =>
      m.row >= 0 &&
      m.col >= 0 &&
      m.rowSpan >= 1 &&
      m.colSpan >= 1 &&
      (m.rowSpan > 1 || m.colSpan > 1) &&
      m.row + m.rowSpan <= rowCount &&
      m.col + m.colSpan <= colCount,
  );
  return { cells, colWidths, rowHeights, merges };
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Decides the kind of every cell. Cells with text are printed only; empty cells become boxes,
 * except in rows that have no text at all (spacer rows). Overrides apply to empty cells.
 */
export function classifyCells(sheet: Sheet, overrides: KindOverrides = {}): CellKind[][] {
  const kinds: CellKind[][] = sheet.cells.map((row) =>
    row.map((cell) => (cell.text.trim() !== '' ? 'text' : 'blank')),
  );
  for (const m of sheet.merges) {
    for (let r = m.row; r < m.row + m.rowSpan; r++) {
      for (let c = m.col; c < m.col + m.colSpan; c++) {
        if (r !== m.row || c !== m.col) kinds[r][c] = 'covered';
      }
    }
  }
  kinds.forEach((row, r) => {
    const spacer = !row.some((k) => k === 'text');
    row.forEach((kind, c) => {
      if (kind !== 'blank') return;
      const override = overrides[cellKey(r, c)];
      row[c] = override ?? (spacer ? 'blank' : 'mark');
    });
  });
  return kinds;
}

export function countMarks(kinds: CellKind[][]): number {
  return kinds.reduce((n, row) => n + row.filter((k) => k === 'mark').length, 0);
}

/** Converts a zero-based column index into spreadsheet letters (0 → A, 26 → AA). */
export function columnName(col: number): string {
  let name = '';
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function cellAddress(row: number, col: number): string {
  return `${columnName(col)}${row + 1}`;
}

/** Parses an A1-style address such as `C12` (a `$` and a sheet prefix are ignored). */
export function parseCellAddress(address: string): { row: number; col: number } | null {
  const match = /^(?:.*!)?\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(address.trim());
  if (!match) return null;
  let col = 0;
  for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  const row = Number(match[2]);
  if (row < 1) return null;
  return { row: row - 1, col: col - 1 };
}

/** A block of cells, zero-based and inclusive. */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export function rangeAddress(range: CellRange): string {
  const start = cellAddress(range.top, range.left);
  const end = cellAddress(range.bottom, range.right);
  return start === end ? start : `${start}:${end}`;
}

/**
 * Parses an A1-style range such as `C3:F20` or a single cell. Whole columns (`C:F`) and whole rows (`3:20`)
 * span `within`. A `$` and a sheet prefix are ignored, and the corners may be given in any order.
 */
export function parseRangeAddress(address: string, within: CellRange): CellRange | null {
  const parts = address.replace(/^.*!/, '').replace(/\$/g, '').trim().split(':');
  if (parts.length > 2) return null;
  const [a, b = a] = parts.map((p) => p.trim());
  const cellA = parseCellAddress(a);
  const cellB = parseCellAddress(b);
  if (cellA && cellB) return spanning(cellA, cellB);
  if (/^[A-Za-z]{1,3}$/.test(a) && /^[A-Za-z]{1,3}$/.test(b)) {
    const colA = parseCellAddress(`${a}1`)!.col;
    const colB = parseCellAddress(`${b}1`)!.col;
    return { top: within.top, bottom: within.bottom, left: Math.min(colA, colB), right: Math.max(colA, colB) };
  }
  if (/^\d{1,7}$/.test(a) && /^\d{1,7}$/.test(b) && Number(a) > 0 && Number(b) > 0) {
    const [rowA, rowB] = [Number(a) - 1, Number(b) - 1];
    return { top: Math.min(rowA, rowB), bottom: Math.max(rowA, rowB), left: within.left, right: within.right };
  }
  return null;
}

/** The smallest range containing both cells. */
export function spanning(a: { row: number; col: number }, b: { row: number; col: number }): CellRange {
  return { top: Math.min(a.row, b.row), left: Math.min(a.col, b.col), bottom: Math.max(a.row, b.row), right: Math.max(a.col, b.col) };
}

/** The overlap of two ranges, or null when they do not touch. */
export function intersectRanges(a: CellRange, b: CellRange): CellRange | null {
  const range = { top: Math.max(a.top, b.top), left: Math.max(a.left, b.left), bottom: Math.min(a.bottom, b.bottom), right: Math.min(a.right, b.right) };
  return range.top <= range.bottom && range.left <= range.right ? range : null;
}
