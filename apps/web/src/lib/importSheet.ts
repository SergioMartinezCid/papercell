/** Getting a sheet from the clipboard or a file. */
import { sheetFromDelimited, sheetFromHtmlTable, type Sheet } from '@papercell/core';

/** Prefers the HTML flavour (keeps sizes, merges and formatting) over plain text. */
export function sheetFromClipboard(data: DataTransfer | null): Sheet | null {
  if (!data) return null;
  const html = data.getData('text/html');
  if (html) {
    const sheet = sheetFromHtmlTable(new DOMParser().parseFromString(html, 'text/html'));
    if (sheet) return sheet;
  }
  const text = data.getData('text/plain');
  return text.trim() ? sheetFromDelimited(text.replace(/\n$/, '')) : null;
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
