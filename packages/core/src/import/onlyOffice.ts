/**
 * Notes copied from ONLYOFFICE. Its HTML has none, but the table carries the range in ONLYOFFICE's own binary
 * format too, base64 in its class (`xslData;XLSY;v2;<length>;<data>`). That format is not documented; what is
 * used of it, as observed in its copies:
 * - Each note is a record: 0x14 and its length, then the cell's row (0x00 0x04 and an int32) and column
 *   (0x01 0x04, int32) in the sheet, then its data (0x02 0x06, length), a first entry (0x03, length) and the
 *   text (0x00, byte length, UTF-16LE).
 * - The copied range's address (e.g. `B2:D4`) is in it as UTF-16LE text, and gives where the range starts.
 * Nothing else is read from it.
 */
import { parseCellAddress } from '../sheet';

export interface OnlyOfficeNote {
  /** Position in the copied range. */
  row: number;
  col: number;
  text: string;
}

/** The notes of a table copied from ONLYOFFICE, or null when it is not one (or cannot be read). */
export function notesFromOnlyOffice(table: Element): OnlyOfficeNote[] | null {
  const parts = (table.getAttribute('class') ?? '').split(';');
  if (parts[0] !== 'xslData' || parts.length < 5) return null;
  let data: Uint8Array;
  try {
    data = Uint8Array.from(atob(parts[4]), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
  const origin = rangeStart(data);
  if (!origin) return null;
  const view = new DataView(data.buffer);
  const notes: OnlyOfficeNote[] = [];
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => data[i + k] === b);
  for (let i = 0; i + 36 <= data.length; i++) {
    if (data[i] !== 0x14 || !at(i + 5, 0x00, 0x04) || !at(i + 11, 0x01, 0x04) || !at(i + 17, 0x02, 0x06) || data[i + 23] !== 0x03 || data[i + 28] !== 0x00) continue;
    const row = view.getInt32(i + 7, true);
    const col = view.getInt32(i + 13, true);
    const length = view.getInt32(i + 29, true);
    if (length < 0 || length % 2 || i + 33 + length > data.length) continue;
    const text = utf16(data.subarray(i + 33, i + 33 + length)).trim();
    if (text) notes.push({ row: row - origin.row, col: col - origin.col, text });
  }
  return notes;
}

/** Top-left cell of the first range address written in the data as UTF-16LE text (at either byte alignment). */
function rangeStart(data: Uint8Array): { row: number; col: number } | null {
  let best: { at: number; cell: { row: number; col: number } } | null = null;
  for (const offset of [0, 1]) {
    let run = '';
    let from = offset;
    for (let i = offset; i + 1 <= data.length; i += 2) {
      const code = i + 1 < data.length ? data[i] | (data[i + 1] << 8) : 0;
      if (code >= 0x20 && code < 0x7f) {
        if (!run) from = i;
        run += String.fromCharCode(code);
        continue;
      }
      const match = /^([A-Z]{1,3}\d{1,7})(?::[A-Z]{1,3}\d{1,7})?$/.exec(run);
      const cell = match && parseCellAddress(match[1]);
      if (cell && (!best || from < best.at)) best = { at: from, cell };
      if (cell) break;
      run = '';
    }
  }
  return best?.cell ?? null;
}

function utf16(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  return out;
}
