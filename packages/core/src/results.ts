/** Turning read marks back into spreadsheet cells. */

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
  /** Zero-based spreadsheet position of `values[0][0]`. */
  topLeft: { row: number; col: number };
  /** Cells in the output that are not boxes and whose text is unknown (they come out empty). */
  unknownCells: number;
}

export function buildOutput(input: OutputInput, options: OutputOptions): Output {
  const byCell = new Map(input.marks.map((m) => [`${m.row},${m.col}`, m.marked]));
  let r0 = 0;
  let c0 = 0;
  let r1 = input.sourceRows - 1;
  let c1 = input.sourceCols - 1;
  if (options.shape === 'boxes' && input.marks.length > 0) {
    r0 = Math.min(...input.marks.map((m) => m.row));
    r1 = Math.max(...input.marks.map((m) => m.row));
    c0 = Math.min(...input.marks.map((m) => m.col));
    c1 = Math.max(...input.marks.map((m) => m.col));
  }
  let unknownCells = 0;
  const values: string[][] = [];
  for (let r = r0; r <= r1; r++) {
    const row: string[] = [];
    for (let c = c0; c <= c1; c++) {
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
  return { values, topLeft: { row: input.anchor.row + r0, col: input.anchor.col + c0 }, unknownCells };
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
