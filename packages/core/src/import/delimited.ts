/** CSV / TSV text (also what spreadsheets put on the clipboard as plain text). */
import { normalizeSheet, type Sheet } from '../sheet';

/** Splits delimited text into rows of fields, honouring double-quoted fields. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const src = text.replace(/\r\n?/g, '\n');
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Tab when present, otherwise whichever of comma or semicolon appears more on the first line. */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  if (first.includes('\t')) return '\t';
  const commas = first.split(',').length;
  const semicolons = first.split(';').length;
  return semicolons > commas ? ';' : ',';
}

export function sheetFromDelimited(text: string, delimiter = detectDelimiter(text)): Sheet {
  const rows = parseDelimited(text, delimiter);
  return normalizeSheet({ cells: rows.map((r) => r.map((t) => ({ text: t }))) });
}
