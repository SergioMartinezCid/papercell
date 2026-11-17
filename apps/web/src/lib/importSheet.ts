/** Getting a sheet from the clipboard or a file. */
import { parseDelimited, restoreHiddenLines, sheetFromDelimited, sheetFromHtmlTable, type Sheet } from '@papercell/core';

export interface ClipboardImport {
  sheet: Sheet;
  /** `hidden-lines`: the range has hidden rows or columns that could not be placed, so only its text was kept. */
  warning?: 'hidden-lines';
}

/** Prefers the HTML flavour (keeps sizes, merges, formatting and notes) over plain text. */
export function sheetFromClipboard(data: DataTransfer | null): ClipboardImport | null {
  if (!data) return null;
  const text = data.getData('text/plain').replace(/\r?\n$/, '');
  const html = data.getData('text/html');
  const sheet = html ? sheetFromHtmlTable(new DOMParser().parseFromString(html, 'text/html')) : null;
  if (sheet) {
    // Spreadsheets copy plain text as tab-separated values, which still has hidden rows and columns.
    if (!text.trim()) return { sheet };
    const restored = restoreHiddenLines(sheet, parseDelimited(text, '\t'));
    return restored ? { sheet: restored } : { sheet: sheetFromDelimited(text, '\t'), warning: 'hidden-lines' };
  }
  return text.trim() ? { sheet: sheetFromDelimited(text) } : null;
}

export interface FileImport {
  sheets: Array<{ name: string; sheet: Sheet }>;
}

export async function sheetsFromFile(file: File): Promise<FileImport> {
  if (/\.xlsx$/i.test(file.name)) {
    const { sheetsFromXlsx } = await import('./xlsx');
    return { sheets: await sheetsFromXlsx(await file.arrayBuffer()) };
  }
  const text = await file.text();
  return { sheets: [{ name: file.name, sheet: sheetFromDelimited(text.replace(/\r?\n$/, ''), /\.tsv$/i.test(file.name) ? '\t' : undefined) }] };
}
