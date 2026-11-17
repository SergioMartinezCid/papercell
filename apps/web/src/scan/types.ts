import type { PageScan, ReadNumber, ScanError } from '@papercell/core';

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
  /** Number values entered or confirmed while reviewing, keyed by `row,col`. */
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

/** Number fields of a page (none on pages scanned before they existed). */
export function numbersOf(item: ScanItem): ReadNumber[] {
  return item.scan?.numbers ?? [];
}

/** Final value of a number field: the reviewer's, otherwise what was read. */
export function numberValue(item: ScanItem, n: ReadNumber): string {
  return item.values?.[boxKey(n.row, n.col)] ?? n.value;
}

export function numberNeedsCheck(item: ScanItem, n: ReadNumber): boolean {
  return n.uncertain && item.values?.[boxKey(n.row, n.col)] === undefined;
}

/** Boxes and number fields still to check on a page. */
export function checksLeft(item: ScanItem): number {
  return (item.scan?.boxes.filter((b) => needsCheck(item, b)).length ?? 0) + numbersOf(item).filter((n) => numberNeedsCheck(item, n)).length;
}
