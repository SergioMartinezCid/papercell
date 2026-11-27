/** .xlsx import (loaded on demand: the parser is large). */
import { findToken, normalizeSheet, notesFromXlsx, parseCellAddress, type CellStyle, type Merge, type Sheet, type SheetCell } from '@papercell/core';
import type { Cell, Worksheet } from 'exceljs';

export interface XlsxSheet {
  name: string;
  sheet: Sheet;
  /** Where the sheet's used range starts (0-based), which is where the results go back. */
  origin: { row: number; col: number };
}

export async function sheetsFromXlsx(buffer: ArrayBuffer): Promise<XlsxSheet[]> {
  const mod = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') } & typeof import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  // ExcelJS loses the notes of cells saved with nothing else, as Excel saves empty cells with a note.
  const notes = await notesFromXlsx(buffer).catch(() => null);
  return workbook.worksheets
    .filter((ws) => ws.state === 'visible' && ws.actualRowCount > 0)
    .map((ws) => ({ name: ws.name, ...worksheetToSheet(ws, notes?.get(ws.name)) }));
}

function worksheetToSheet(ws: Worksheet, notes: Map<string, string> | undefined): { sheet: Sheet; origin: { row: number; col: number } } {
  // Used range: from the first to the last row/column with content or a token in a note (1-based, as ExcelJS counts).
  let top = Infinity;
  let left = Infinity;
  let bottom = 0;
  let right = 0;
  const include = (r: number, c: number) => {
    top = Math.min(top, r);
    bottom = Math.max(bottom, r);
    left = Math.min(left, c);
    right = Math.max(right, c);
  };
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (cell.text !== '' || cell.isMerged || hasToken(noteText(cell.note))) include(r, c);
    });
  });
  for (const [address, note] of notes ?? []) {
    const at = parseCellAddress(address);
    if (at && hasToken(note)) include(at.row + 1, at.col + 1);
  }
  if (!Number.isFinite(top)) return { sheet: normalizeSheet({ cells: [] }), origin: { row: 0, col: 0 } };

  const cells: SheetCell[][] = [];
  const rowHeights: number[] = [];
  const hiddenRows: number[] = [];
  for (let r = top; r <= bottom; r++) {
    const row = ws.getRow(r);
    rowHeights.push(row.height ? (row.height * 96) / 72 : 21);
    if (row.hidden) hiddenRows.push(r - top);
    const out: SheetCell[] = [];
    for (let c = left; c <= right; c++) {
      const cell = ws.getCell(r, c);
      const isSlave = cell.isMerged && cell.master.address !== cell.address;
      const note = notes?.get(cell.address) ?? noteText(cell.note);
      out.push(isSlave ? { text: '' } : { text: cell.text ?? '', style: styleOf(cell), ...(note ? { note } : {}) });
    }
    cells.push(out);
  }
  const colWidths: number[] = [];
  const hiddenCols: number[] = [];
  for (let c = left; c <= right; c++) {
    const column = ws.getColumn(c);
    colWidths.push(column.width ? Math.round(column.width * 7 + 5) : 100);
    if (column.hidden) hiddenCols.push(c - left);
  }
  const merges: Merge[] = [];
  for (const range of Object.keys((ws as unknown as { _merges: Record<string, unknown> })._merges ?? {})) {
    const model = (ws as unknown as { _merges: Record<string, { model: { top: number; left: number; bottom: number; right: number } }> })._merges[range].model;
    merges.push({ row: model.top - top, col: model.left - left, rowSpan: model.bottom - model.top + 1, colSpan: model.right - model.left + 1 });
  }
  return { sheet: normalizeSheet({ cells, colWidths, rowHeights, merges, hiddenRows, hiddenCols }), origin: { row: top - 1, col: left - 1 } };
}

function styleOf(cell: Cell): CellStyle | undefined {
  const style: CellStyle = {};
  if (cell.font?.bold) style.bold = true;
  if (cell.font?.italic) style.italic = true;
  if (cell.font?.size && cell.font.size !== 10) style.fontSize = cell.font.size;
  const color = argb(cell.font?.color?.argb);
  if (color && color !== '#000000') style.color = color;
  const align = cell.alignment?.horizontal;
  if (align === 'left' || align === 'center' || align === 'right') style.align = align;
  const fill = cell.fill;
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const bg = argb(fill.fgColor?.argb);
    if (bg && bg !== '#ffffff') style.background = bg;
  }
  return Object.keys(style).length ? style : undefined;
}

function hasToken(note: string | undefined): boolean {
  return !!note && findToken(note) !== null;
}

/** A cell note as plain text (ExcelJS gives either a string or rich text). */
function noteText(note: Cell['note']): string | undefined {
  if (!note) return undefined;
  const text = typeof note === 'string' ? note : (note.texts ?? []).map((t) => t.text).join('');
  return text.trim() || undefined;
}

function argb(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{8}$/i.test(value) ? `#${value.slice(2).toLowerCase()}` : undefined;
}
