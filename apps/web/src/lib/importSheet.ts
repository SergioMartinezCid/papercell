/** Getting a sheet from the clipboard or a file. */
import {
  copiedFromExcel,
  GOOGLE_SHEETS_CLIPBOARD_TYPE,
  notesFromGoogleSheets,
  parseDelimited,
  restoreHiddenLines,
  sheetFromDelimited,
  sheetFromHtmlTable,
  withNotes,
  type Sheet,
} from '@papercell/core';

export interface ClipboardImport {
  sheet: Sheet;
  /** `hidden-lines`: the range has hidden rows or columns that could not be placed, so only its text was kept. */
  warning?: 'hidden-lines';
  /** Copied from Excel, which leaves the notes out, and with them any token written in one. */
  withoutNotes?: boolean;
}

/** Prefers the HTML flavour (keeps sizes, merges, formatting and notes) over plain text. */
export function sheetFromClipboard(data: DataTransfer | null): ClipboardImport | null {
  if (!data) return null;
  const text = data.getData('text/plain').replace(/\r?\n$/, '');
  const html = data.getData('text/html');
  const doc = html ? new DOMParser().parseFromString(html, 'text/html') : null;
  let sheet = doc ? sheetFromHtmlTable(doc) : null;
  // Google Sheets copies notes only in a clipboard type of its own.
  const notes = sheet && notesFromGoogleSheets(data.getData(GOOGLE_SHEETS_CLIPBOARD_TYPE));
  if (sheet && notes) sheet = withNotes(sheet, notes);
  if (sheet) {
    const withoutNotes = doc ? copiedFromExcel(doc) : false;
    // Spreadsheets copy plain text as tab-separated values, which still has hidden rows and columns.
    if (!text.trim()) return { sheet, withoutNotes };
    const restored = restoreHiddenLines(sheet, parseDelimited(text, '\t'));
    return restored ? { sheet: restored, withoutNotes } : { sheet: sheetFromDelimited(text, '\t'), warning: 'hidden-lines' };
  }
  return text.trim() ? { sheet: sheetFromDelimited(text) } : null;
}

export interface FileImport {
  /** `origin`: where the sheet starts in the spreadsheet, when the file says (0-based). */
  sheets: Array<{ name: string; sheet: Sheet; origin?: { row: number; col: number } }>;
}

export async function sheetsFromFile(file: File): Promise<FileImport> {
  if (/\.xlsx$/i.test(file.name)) {
    const { sheetsFromXlsx } = await import('./xlsx');
    return { sheets: await sheetsFromXlsx(await file.arrayBuffer()) };
  }
  const text = await file.text();
  return { sheets: [{ name: file.name, sheet: sheetFromDelimited(text.replace(/\r?\n$/, ''), /\.tsv$/i.test(file.name) ? '\t' : undefined) }] };
}
