/**
 * Hidden rows and columns. LibreOffice leaves them out of the HTML it copies but keeps them in the plain
 * text, so the HTML alone would put every cell after a hidden line at the wrong place in the spreadsheet.
 */
import { normalizeSheet, type Merge, type Sheet, type SheetCell } from '../sheet';

/**
 * Puts back, as hidden lines, the rows and columns that the plain text (`text`, the same range) has and the
 * sheet read from the HTML lacks. Returns the sheet unchanged when nothing is missing, and null when the
 * missing lines cannot be placed with certainty (for example, an empty hidden column next to an empty
 * visible one).
 */
export function restoreHiddenLines(sheet: Sheet, text: string[][]): Sheet | null {
  const rows = sheet.cells.length;
  const cols = sheet.colWidths.length;
  const textRows = text.length;
  const textCols = Math.max(0, ...text.map((r) => r.length));
  // Nothing missing, or a text that is not the same range: the HTML is the better source.
  if ((textRows === rows && textCols === cols) || textRows < rows || textCols < cols) return sheet;

  const h = sheet.cells.map((row) => row.map((c) => clean(c.text)));
  const t = text.map((row) => Array.from({ length: textCols }, (_, c) => clean(row[c] ?? '')));

  // Columns: each visible column must appear, in order, within a text column that may have extra (hidden) rows.
  const column = (j: number) => h.map((row) => row[j]);
  const textColumn = (k: number) => t.map((row) => row[k]);
  const colFits = (j: number, k: number) => isSubsequence(column(j), textColumn(k));
  const colMap = uniqueEmbedding(cols, textCols, colFits);
  if (!colMap) return null;
  // Rows: then each visible row must match a text row exactly in the visible columns.
  const rowFits = (i: number, r: number) => colMap.every((k, j) => t[r][k] === h[i][j]);
  const rowMap = uniqueEmbedding(rows, textRows, rowFits);
  if (!rowMap) return null;

  const rowOf = new Map(rowMap.map((r, i) => [r, i]));
  const colOf = new Map(colMap.map((k, j) => [k, j]));
  const cells: SheetCell[][] = text.map((row, r) =>
    Array.from({ length: textCols }, (_, k) => {
      const i = rowOf.get(r);
      const j = colOf.get(k);
      return i !== undefined && j !== undefined ? sheet.cells[i][j] : { text: (row[k] ?? '').trim() };
    }),
  );
  const merges: Merge[] = sheet.merges.map((m) => {
    const row = rowMap[m.row];
    const col = colMap[m.col];
    return { row, col, rowSpan: rowMap[m.row + m.rowSpan - 1] - row + 1, colSpan: colMap[m.col + m.colSpan - 1] - col + 1 };
  });
  return normalizeSheet({
    cells,
    colWidths: Array.from({ length: textCols }, (_, k) => (colOf.has(k) ? sheet.colWidths[colOf.get(k)!] : 0)),
    rowHeights: Array.from({ length: textRows }, (_, r) => (rowOf.has(r) ? sheet.rowHeights[rowOf.get(r)!] : 0)),
    merges,
    hiddenRows: Array.from({ length: textRows }, (_, r) => r).filter((r) => !rowOf.has(r)),
    hiddenCols: Array.from({ length: textCols }, (_, k) => k).filter((k) => !colOf.has(k)),
  });
}

function clean(text: string): string {
  return text.replace(/ /g, ' ').replace(/\r\n?/g, '\n').trim();
}

function isSubsequence(part: string[], whole: string[]): boolean {
  let i = 0;
  for (const v of whole) if (i < part.length && v === part[i]) i++;
  return i === part.length;
}

/**
 * The increasing map of `n` items onto `m` slots where `fits(item, slot)`, if there is exactly one. Every
 * such map lies between the leftmost and the rightmost greedy maps, so when those two agree it is unique.
 */
function uniqueEmbedding(n: number, m: number, fits: (item: number, slot: number) => boolean): number[] | null {
  const left: number[] = [];
  for (let i = 0, s = 0; i < n; i++, s++) {
    while (s < m && !fits(i, s)) s++;
    if (s >= m) return null;
    left.push(s);
  }
  const right: number[] = new Array(n);
  for (let i = n - 1, s = m - 1; i >= 0; i--, s--) {
    while (s >= 0 && !fits(i, s)) s--;
    if (s < 0) return null;
    right[i] = s;
  }
  return left.every((s, i) => s === right[i]) ? left : null;
}
