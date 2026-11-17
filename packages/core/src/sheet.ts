/** A rectangular range copied from a spreadsheet: text, light formatting and geometry. */
import { findToken, parseToken, type CellToken, type NumberField } from './tokens';

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
  /** The cell's note (comment), never printed. */
  note?: string;
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
  /** Rows and columns hidden in the spreadsheet: they keep their place in the range but are not printed. */
  hiddenRows?: number[];
  hiddenCols?: number[];
}

/**
 * How a cell is treated:
 * - `text`: printed, never scanned.
 * - `mark`: printed as an empty box and read back as marked / empty.
 * - `number`: printed as a row of boxes, one per digit, and read back as the number written in them.
 * - `letters`: printed as a row of boxes, one per capital letter, and read back as the text written in them.
 * - `line`: printed as a line to write on; what is written there is shown to be typed in, not read.
 * - `blank`: printed as an empty cell and not scanned.
 * - `covered`: hidden under a merged cell.
 * - `hidden`: in a row or column hidden in the spreadsheet.
 */
export type CellKind = 'text' | 'mark' | 'number' | 'letters' | 'line' | 'blank' | 'covered' | 'hidden';

/** Kinds of cell that are filled in on paper and read back. */
export const FIELD_KINDS: ReadonlySet<CellKind> = new Set(['mark', 'number', 'letters', 'line']);

/** A kind chosen by hand in the app for a cell that has no text. */
export type KindOverride = 'mark' | 'blank' | 'line' | { number: NumberField } | { letters: number };

/** Per-cell overrides chosen by the user, keyed by `cellKey(row, col)`. */
export type KindOverrides = Record<string, KindOverride>;

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
  hiddenRows?: number[];
  hiddenCols?: number[];
}): Sheet {
  const rowCount = input.cells.length;
  const colCount = Math.max(0, ...input.cells.map((r) => r.length));
  const cells = input.cells.map((row) => {
    const out = row.map((c) => ({ text: c.text ?? '', ...(c.style ? { style: c.style } : {}), ...(c.note ? { note: c.note } : {}) }));
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
  const hiddenRows = lines(input.hiddenRows, rowCount);
  const hiddenCols = lines(input.hiddenCols, colCount);
  return { cells, colWidths, rowHeights, merges, ...(hiddenRows.length ? { hiddenRows } : {}), ...(hiddenCols.length ? { hiddenCols } : {}) };
}

/** Distinct valid line indices, in order. */
function lines(indices: number[] | undefined, count: number): number[] {
  return [...new Set(indices ?? [])].filter((i) => Number.isInteger(i) && i >= 0 && i < count).sort((a, b) => a - b);
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * The token that sets a cell's kind: the cell's whole text, otherwise the first token in the note of a cell
 * without text. Notes of cells with text are ignored: the text is printed.
 */
export function cellToken(cell: SheetCell): CellToken | null {
  if (cell.text.trim() !== '') return parseToken(cell.text);
  return cell.note ? findToken(cell.note) : null;
}

export interface CellPlan {
  kinds: CellKind[][];
  /** The field of every `number` cell, keyed by `cellKey(row, col)`. */
  fields: Map<string, NumberField>;
  /** How many boxes every `letters` cell has, keyed by `cellKey(row, col)`. */
  letters: Map<string, number>;
}

/** The kind of every cell (see `planCells`). */
export function classifyCells(sheet: Sheet, overrides: KindOverrides = {}): CellKind[][] {
  return planCells(sheet, overrides).kinds;
}

/**
 * Decides the kind of every cell. Cells with text are printed only. Other cells take, in this order, the
 * kind chosen by hand (`overrides`), the one their token sets (see `tokens.ts`) or else become boxes,
 * except in rows without text (spacer rows), which stay blank. Hidden rows and columns are left out, as if
 * they were not in the range.
 */
export function planCells(sheet: Sheet, overrides: KindOverrides = {}): CellPlan {
  const hiddenRows = new Set(sheet.hiddenRows);
  const hiddenCols = new Set(sheet.hiddenCols);
  const tokens = sheet.cells.map((row) => row.map(cellToken));
  const kinds: CellKind[][] = sheet.cells.map((row, r) =>
    row.map((cell, c) => (hiddenRows.has(r) || hiddenCols.has(c) ? 'hidden' : cell.text.trim() !== '' && !tokens[r][c] ? 'text' : 'blank')),
  );
  for (const m of sheet.merges) {
    for (let r = m.row; r < m.row + m.rowSpan; r++) {
      for (let c = m.col; c < m.col + m.colSpan; c++) {
        if ((r !== m.row || c !== m.col) && kinds[r][c] !== 'hidden') kinds[r][c] = 'covered';
      }
    }
  }
  const fields = new Map<string, NumberField>();
  const letters = new Map<string, number>();
  kinds.forEach((row, r) => {
    const spacer = !row.some((k) => k === 'text');
    row.forEach((kind, c) => {
      if (kind !== 'blank') return;
      const key = cellKey(r, c);
      const override = overrides[key];
      const token = tokens[r][c];
      if (override !== undefined) {
        if (typeof override !== 'object') row[c] = override;
        else if ('number' in override) {
          fields.set(key, override.number);
          row[c] = 'number';
        } else {
          letters.set(key, override.letters);
          row[c] = 'letters';
        }
      } else if (token) {
        if (token.kind === 'number') fields.set(key, token.field);
        if (token.kind === 'letters') letters.set(key, token.count);
        row[c] = token.kind;
      } else row[c] = spacer ? 'blank' : 'mark';
    });
  });
  return { kinds, fields, letters };
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
