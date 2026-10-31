/** .xlsx import (loaded on demand: the parser is large). */
import { normalizeSheet, type CellStyle, type Merge, type Sheet, type SheetCell } from '@papercell/core';
import type { Cell, Worksheet } from 'exceljs';

export async function sheetsFromXlsx(buffer: ArrayBuffer): Promise<Array<{ name: string; sheet: Sheet }>> {
  const mod = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') } & typeof import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets
    .filter((ws) => ws.state === 'visible' && ws.actualRowCount > 0)
    .map((ws) => ({ name: ws.name, sheet: worksheetToSheet(ws) }));
}

function worksheetToSheet(ws: Worksheet): Sheet {
  // Used range: from the first to the last row/column with content.
  let top = Infinity;
  let left = Infinity;
  let bottom = 0;
  let right = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (cell.text === '' && !cell.isMerged) return;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r);
      left = Math.min(left, c);
      right = Math.max(right, c);
    });
  });
  if (!Number.isFinite(top)) return normalizeSheet({ cells: [] });

  const cells: SheetCell[][] = [];
  const rowHeights: number[] = [];
  for (let r = top; r <= bottom; r++) {
    const row = ws.getRow(r);
    rowHeights.push(row.height ? (row.height * 96) / 72 : 21);
    const out: SheetCell[] = [];
    for (let c = left; c <= right; c++) {
      const cell = ws.getCell(r, c);
      const isSlave = cell.isMerged && cell.master.address !== cell.address;
      out.push(isSlave ? { text: '' } : { text: cell.text ?? '', style: styleOf(cell) });
    }
    cells.push(out);
  }
  const colWidths: number[] = [];
  for (let c = left; c <= right; c++) {
    const width = ws.getColumn(c).width;
    colWidths.push(width ? Math.round(width * 7 + 5) : 100);
  }
  const merges: Merge[] = [];
  for (const range of Object.keys((ws as unknown as { _merges: Record<string, unknown> })._merges ?? {})) {
    const model = (ws as unknown as { _merges: Record<string, { model: { top: number; left: number; bottom: number; right: number } }> })._merges[range].model;
    merges.push({ row: model.top - top, col: model.left - left, rowSpan: model.bottom - model.top + 1, colSpan: model.right - model.left + 1 });
  }
  return normalizeSheet({ cells, colWidths, rowHeights, merges });
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

function argb(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{8}$/i.test(value) ? `#${value.slice(2).toLowerCase()}` : undefined;
}
