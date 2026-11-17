import { fieldToken, lettersToken, type PageScan, type Rect, type ScanError } from '@papercell/core';

/** A page scan without the straightened image (sent separately as a JPEG). */
export type ScanSummary = Omit<PageScan, 'page'>;

export type ScanFailure = ScanError | 'unreadable-image';

export interface WorkerRequest {
  id: string;
  file: Blob;
}

export type WorkerResponse =
  | { id: string; ok: true; scan: ScanSummary; preview: Blob }
  /** `thumb`: what the scanner saw (the page code area, or the whole photo when the page was not found). */
  | { id: string; ok: false; error: ScanFailure; thumb?: Blob };

export interface ScanItem {
  id: string;
  name: string;
  addedAt: number;
  status: 'processing' | 'done' | 'error';
  error?: ScanFailure;
  scan?: ScanSummary;
  /** The straightened page (JPEG), and an object URL for it. */
  preview?: Blob;
  previewUrl?: string;
  /** For a photo that could not be read: object URL of what the scanner saw. */
  thumbUrl?: string;
  /** Decisions made while reviewing, keyed by `row,col`: true = marked. */
  decisions: Record<string, boolean>;
  /** Values of number fields, letter fields and writing lines entered or confirmed while reviewing, keyed by `row,col`. */
  values?: Record<string, string>;
}

export function boxKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** Final state of a box: the reviewer's decision, otherwise what was read. */
export function isMarked(item: ScanItem, box: { row: number; col: number; marked: boolean }): boolean {
  return item.decisions[boxKey(box.row, box.col)] ?? box.marked;
}

export function needsCheck(item: ScanItem, box: { row: number; col: number; uncertain: boolean }): boolean {
  return box.uncertain && item.decisions[boxKey(box.row, box.col)] === undefined;
}

/** A number field, letter field or writing line of a page: what is filled in there is text either way. */
export interface PageField {
  row: number;
  col: number;
  kind: 'number' | 'letters' | 'line';
  /** Its token, e.g. `[##,#]`. */
  token: string;
  /** Its boxes on the page (none for a line). */
  boxes: Rect[];
  /** Where it is on the page: around its boxes, or where a line's writing was looked for. */
  area: Rect;
  /** What was read: empty for a line, whose writing is typed in. */
  read: string;
  /** A person must check it: something read is doubtful, or a line has writing to type in. */
  doubtful: boolean;
  /** For number fields: what a value must look like. */
  format?: RegExp;
}

/** Number fields, letter fields and writing lines of a page (pages scanned before they existed have none). */
export function fieldsOf(item: ScanItem): PageField[] {
  const scan = item.scan;
  if (!scan) return [];
  const numbers = (scan.numbers ?? []).map((n): PageField => {
    const { digits, decimals, separator } = n.field;
    const boxes = n.digits.map((d) => d.box);
    return {
      row: n.row,
      col: n.col,
      kind: 'number',
      token: fieldToken(n.field),
      boxes,
      area: around(boxes),
      read: n.value,
      doubtful: n.uncertain,
      format: new RegExp(`^\\d{1,${digits}}${decimals ? `(\\${separator}\\d{1,${decimals}})?` : ''}$`),
    };
  });
  const letters = (scan.letters ?? []).map((l): PageField => {
    const boxes = l.letters.map((d) => d.box);
    return { row: l.row, col: l.col, kind: 'letters', token: lettersToken(l.count), boxes, area: around(boxes), read: l.value, doubtful: l.uncertain };
  });
  const lines = (scan.lines ?? []).map(
    (l): PageField => ({ row: l.row, col: l.col, kind: 'line', token: '[...]', boxes: [], area: l.area, read: '', doubtful: l.written || l.uncertain }),
  );
  return [...numbers, ...letters, ...lines];
}

/** Final value of a field: the reviewer's, otherwise what was read. */
export function fieldValue(item: ScanItem, f: PageField): string {
  return (item.values?.[boxKey(f.row, f.col)] ?? f.read).trim();
}

export function fieldNeedsCheck(item: ScanItem, f: PageField): boolean {
  return f.doubtful && item.values?.[boxKey(f.row, f.col)] === undefined;
}

/** Boxes and fields still to check on a page. */
export function checksLeft(item: ScanItem): number {
  return (item.scan?.boxes.filter((b) => needsCheck(item, b)).length ?? 0) + fieldsOf(item).filter((f) => fieldNeedsCheck(item, f)).length;
}

/** The smallest rectangle around some boxes. */
export function around(boxes: Rect[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}
