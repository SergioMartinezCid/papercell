/** Turning read marks back into spreadsheet cells. */

import { intersectRanges, type CellRange } from './sheet';

export interface MarkValue {
  row: number;
  col: number;
  marked: boolean;
}

export interface OutputOptions {
  /** `boxes`: the smallest block containing every box. `range`: the whole original range. */
  shape: 'boxes' | 'range';
  markedValue: string;
  emptyValue: string;
}

export const DEFAULT_OUTPUT: OutputOptions = { shape: 'boxes', markedValue: '1', emptyValue: '' };

export interface OutputInput {
  sourceRows: number;
  sourceCols: number;
  /** Zero-based position of the range in its spreadsheet. */
  anchor: { row: number; col: number };
  /** Every box read so far. */
  marks: MarkValue[];
  /** Text of the source range, when known. Cells that are not boxes are copied from it. */
  texts?: string[][];
}

export interface Output {
  values: string[][];
  /** The cells in `values`, relative to the source range. */
  block: CellRange;
  /** Zero-based spreadsheet position of `values[0][0]`. */
  topLeft: { row: number; col: number };
  /** Cells in the output that are not boxes and whose text is unknown (they come out empty). */
  unknownCells: number;
}

/** The block that `shape` outputs, relative to the source range. */
export function outputBlock(input: OutputInput, shape: OutputOptions['shape']): CellRange {
  if (shape === 'boxes' && input.marks.length > 0) {
    return {
      top: Math.min(...input.marks.map((m) => m.row)),
      left: Math.min(...input.marks.map((m) => m.col)),
      bottom: Math.max(...input.marks.map((m) => m.row)),
      right: Math.max(...input.marks.map((m) => m.col)),
    };
  }
  return { top: 0, left: 0, bottom: input.sourceRows - 1, right: input.sourceCols - 1 };
}

/**
 * The output block as spreadsheet values. `selection` (relative to the source range, clipped to it) replaces
 * the block chosen by `options.shape`, to output only part of the range.
 */
export function buildOutput(input: OutputInput, options: OutputOptions, selection?: CellRange): Output {
  const byCell = new Map(input.marks.map((m) => [`${m.row},${m.col}`, m.marked]));
  const whole = outputBlock(input, 'range');
  const block = (selection && intersectRanges(selection, whole)) ?? outputBlock(input, options.shape);
  let unknownCells = 0;
  const values: string[][] = [];
  for (let r = block.top; r <= block.bottom; r++) {
    const row: string[] = [];
    for (let c = block.left; c <= block.right; c++) {
      const marked = byCell.get(`${r},${c}`);
      if (marked !== undefined) row.push(marked ? options.markedValue : options.emptyValue);
      else if (input.texts) row.push(input.texts[r]?.[c] ?? '');
      else {
        unknownCells++;
        row.push('');
      }
    }
    values.push(row);
  }
  return { values, block, topLeft: { row: input.anchor.row + block.top, col: input.anchor.col + block.left }, unknownCells };
}

/** Tab-separated text, the format spreadsheets accept when pasting. */
export function toTsv(values: string[][]): string {
  return values.map((row) => row.map((v) => (/[\t\n\r"]/.test(v) ? quote(v) : v)).join('\t')).join('\n');
}

export function toCsv(values: string[][]): string {
  return values.map((row) => row.map((v) => (/[,\n\r"]/.test(v) ? quote(v) : v)).join(',')).join('\r\n');
}

function quote(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}
