/**
 * Notes copied from Google Sheets. They are not in the HTML it copies, only in its own clipboard type,
 * `application/x-vnd.google-spreadsheet-compact-table+json`, which is not documented. What is used of it, as
 * observed in Sheets' copies:
 * - "15": size of the range, `{"1": rows, "2": columns}`.
 * - "2": one number per cell, row by row, whose bits say what the cell has; `NOTE_BIT` means a note.
 * - "14": the notes of the cells that have one, in the same order.
 * Lists are run-length coded: a negative number −n stands for n repetitions of the value after it.
 */
import type { Sheet } from '../sheet';

export const GOOGLE_SHEETS_CLIPBOARD_TYPE = 'application/x-vnd.google-spreadsheet-compact-table+json';

const NOTE_BIT = 256;

/** Notes by cell (`notes[row][col]`, undefined without a note), or null when the data cannot be read. */
export function notesFromGoogleSheets(json: string): Array<Array<string | undefined>> | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const size = record['15'] as Record<string, unknown> | undefined;
  const rows = Number(size?.['1']);
  const cols = Number(size?.['2']);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return null;
  const notes: Array<Array<string | undefined>> = Array.from({ length: rows }, () => new Array(cols).fill(undefined));
  if (record['14'] === undefined) return notes;
  const flags = expand(record['2']);
  const texts = expand(record['14']);
  if (!flags || !texts || flags.length !== rows * cols) return null;
  const withNote = flags.flatMap((f, cell) => (typeof f === 'number' && f & NOTE_BIT ? [cell] : []));
  if (withNote.length !== texts.length) return null;
  withNote.forEach((cell, i) => {
    const text = texts[i];
    if (typeof text === 'string' && text.trim()) notes[Math.floor(cell / cols)][cell % cols] = text.trim();
  });
  return notes;
}

/** A run-length coded list, expanded; null when it is not a list. */
function expand(list: unknown): unknown[] | null {
  if (!Array.isArray(list)) return null;
  const out: unknown[] = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (typeof v === 'number' && v < 0) {
      const value = list[++i];
      for (let k = 0; k < -v; k++) out.push(value);
    } else out.push(v);
  }
  return out;
}

/** The sheet with these notes on its cells; unchanged when the notes are for a range of another size. */
export function withNotes(sheet: Sheet, notes: Array<Array<string | undefined>>): Sheet {
  if (notes.length !== sheet.cells.length || notes.some((row, r) => row.length !== sheet.cells[r].length)) return sheet;
  return { ...sheet, cells: sheet.cells.map((row, r) => row.map((cell, c) => (notes[r][c] ? { ...cell, note: notes[r][c] } : cell))) };
}
