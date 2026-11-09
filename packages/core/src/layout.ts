/**
 * Turns a sheet into printable pages. All geometry is in millimetres on the paper, and every
 * grid edge is quantised to 0.1 mm so the page code (QR) reproduces it exactly when scanning.
 */
import { classifyCells, type CellKind, type CellStyle, type KindOverrides, type Sheet } from './sheet';
import { boxInCell, FRAME, paperFormat } from './spec';

export type PaperSize = 'a4' | 'letter';
export type Orientation = 'portrait' | 'landscape';
/** Which cells keep their background colour when printed. Boxes themselves always stay white. */
export type BackgroundMode = 'none' | 'text' | 'all';
/** `page`: shrink to fit everything on one page. `width`: fill the width and add pages as needed. */
export type FitMode = 'page' | 'width';

export interface LayoutSettings {
  paper: PaperSize;
  orientation: Orientation;
  fit: FitMode;
  /** Repeat the leading rows without boxes at the top of every page. */
  repeatHeader: boolean;
  backgrounds: BackgroundMode;
  gridlines: boolean;
  /** Printed in the page header. */
  title: string;
}

export const DEFAULT_SETTINGS: LayoutSettings = {
  paper: 'a4',
  orientation: 'portrait',
  fit: 'page',
  repeatHeader: true,
  backgrounds: 'all',
  gridlines: true,
  title: '',
};

export interface Template {
  sheet: Sheet;
  overrides: KindOverrides;
  settings: LayoutSettings;
  /** Zero-based position of the range's top-left cell in its spreadsheet. */
  anchor: { row: number; col: number };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaperFormat {
  /** 0–3: A4 portrait, A4 landscape, Letter portrait, Letter landscape. Also selects the marker ids. */
  code: number;
  paper: PaperSize;
  orientation: Orientation;
  width: number;
  height: number;
}

/** Space left for the grid between the page frame and its markers (see `spec.ts`). */
export function contentRect(format: PaperFormat, qrSide: number): Rect {
  const top = FRAME.margin + Math.max(FRAME.marker, qrSide) + FRAME.gap;
  const bottom = format.height - FRAME.margin - FRAME.marker - FRAME.gap;
  return { x: FRAME.margin, y: top, w: format.width - 2 * FRAME.margin, h: bottom - top };
}

/** Largest scale in mm per sheet pixel: a 21 px row becomes 8.8 mm. */
export const MAX_SCALE = 0.42;

/** Grid geometry of one page, in tenths of a millimetre. */
export interface PageGrid {
  originX: number;
  originY: number;
  /** Column edges relative to the origin, starting at 0. */
  colEdges: number[];
  /** Row edges relative to the origin, starting at 0. */
  rowEdges: number[];
}

export function gridCellRect(grid: PageGrid, pageRow: number, col: number, rowSpan = 1, colSpan = 1): Rect {
  const x0 = grid.originX + grid.colEdges[col];
  const x1 = grid.originX + grid.colEdges[col + colSpan];
  const y0 = grid.originY + grid.rowEdges[pageRow];
  const y1 = grid.originY + grid.rowEdges[pageRow + rowSpan];
  return { x: x0 / 10, y: y0 / 10, w: (x1 - x0) / 10, h: (y1 - y0) / 10 };
}

export interface PageCell {
  /** Row and column in the source range. */
  row: number;
  col: number;
  pageRow: number;
  rowSpan: number;
  colSpan: number;
  rect: Rect;
  kind: Exclude<CellKind, 'covered'>;
  text: string;
  style?: CellStyle;
}

export interface PageBox {
  row: number;
  col: number;
  pageRow: number;
  rowSpan: number;
  colSpan: number;
  cell: Rect;
  box: Rect;
}

export interface PageLayout {
  index: number;
  count: number;
  format: PaperFormat;
  /** Millimetres per sheet pixel. */
  scale: number;
  grid: PageGrid;
  /** Source row of every page row. */
  rows: number[];
  /** Leading page rows that repeat the header (source rows 0..headerRows-1). */
  headerRows: number;
  cells: PageCell[];
  boxes: PageBox[];
}

export interface SheetLayout {
  format: PaperFormat;
  scale: number;
  kinds: CellKind[][];
  pages: PageLayout[];
  /** Number of leading rows without boxes. */
  headerRows: number;
  boxCount: number;
  /** Smallest box side in mm (0 when there are no boxes). */
  minBoxSide: number;
}

/**
 * Lays the sheet out on pages. `qrSide` is the side of the QR code in mm, which sets the height of
 * the page header.
 */
export function layoutSheet(template: Template, qrSide: number): SheetLayout {
  const { sheet, settings } = template;
  const format = paperFormat(settings.paper, settings.orientation);
  const kinds = classifyCells(sheet, template.overrides);
  const content = contentRect(format, qrSide);
  const rowCount = sheet.rowHeights.length;
  const totalWidthPx = sheet.colWidths.reduce((a, b) => a + b, 0);
  const totalHeightPx = sheet.rowHeights.reduce((a, b) => a + b, 0);

  let headerRows = 0;
  while (headerRows < rowCount && !kinds[headerRows].includes('mark')) headerRows++;
  if (headerRows === rowCount) headerRows = 0;

  let scale = Math.min(MAX_SCALE, content.w / Math.max(totalWidthPx, 1));
  if (settings.fit === 'page') scale = Math.min(scale, content.h / Math.max(totalHeightPx, 1));
  // Stay clear of rounding at the page edges.
  scale *= 0.999;

  const rowMm = (r: number) => Math.round(sheet.rowHeights[r] * scale * 10) / 10;
  const heightOf = (rows: number[]) => rows.reduce((a, r) => a + rowMm(r), 0);
  const header = Array.from({ length: headerRows }, (_, i) => i);
  const repeat = settings.repeatHeader && headerRows > 0 && heightOf(header) < content.h / 2;

  // Split rows into pages without breaking vertical merges.
  const pageRows: number[][] = [];
  let next = 0;
  while (next < rowCount) {
    const rows = pageRows.length > 0 && repeat ? [...header] : [];
    if (pageRows.length > 0 && repeat && next < headerRows) next = headerRows;
    let used = heightOf(rows);
    const first = next;
    while (next < rowCount && (next === first || used + rowMm(next) <= content.h + 1e-6)) {
      used += rowMm(next);
      rows.push(next);
      next++;
    }
    const crossing = sheet.merges.find((m) => m.row < next && m.row + m.rowSpan > next && m.row > first);
    if (crossing && next < rowCount) {
      while (rows.length > 0 && rows[rows.length - 1] >= crossing.row) rows.pop();
      next = crossing.row;
    }
    pageRows.push(rows);
  }

  // Sizes are rounded before adding them up, so equal rows stay equal (and compress well in the QR).
  const colEdges = cumulative(sheet.colWidths.map((px) => Math.round(px * scale * 10)));
  const originX = Math.round(content.x * 10 + (content.w * 10 - colEdges[colEdges.length - 1]) / 2);

  const pages = pageRows.map((rows, index): PageLayout => {
    const rowEdges = cumulative(rows.map((r) => Math.round(sheet.rowHeights[r] * scale * 10)));
    const grid: PageGrid = { originX, originY: Math.round(content.y * 10), colEdges, rowEdges };
    let pageHeaderRows = 0;
    while (pageHeaderRows < Math.min(rows.length, headerRows) && rows[pageHeaderRows] === pageHeaderRows) pageHeaderRows++;
    const cells: PageCell[] = [];
    const boxes: PageBox[] = [];
    rows.forEach((row, pageRow) => {
      sheet.cells[row].forEach((cell, col) => {
        const kind = kinds[row][col];
        if (kind === 'covered') return;
        const merge = sheet.merges.find((m) => m.row === row && m.col === col);
        const lastPageRow = merge ? lastRowOnPage(rows, pageRow, merge.row + merge.rowSpan - 1) : pageRow;
        const rowSpan = lastPageRow - pageRow + 1;
        const colSpan = merge?.colSpan ?? 1;
        const rect = gridCellRect(grid, pageRow, col, rowSpan, colSpan);
        cells.push({ row, col, pageRow, rowSpan, colSpan, rect, kind, text: cell.text, style: cell.style });
        if (kind === 'mark') boxes.push({ row, col, pageRow, rowSpan, colSpan, cell: rect, box: boxInCell(rect) });
      });
    });
    return { index, count: pageRows.length, format, scale, grid, rows, headerRows: pageHeaderRows, cells, boxes };
  });

  const allBoxes = pages.flatMap((p) => p.boxes);
  return {
    format,
    scale,
    kinds,
    pages,
    headerRows,
    boxCount: allBoxes.length,
    minBoxSide: allBoxes.length ? Math.min(...allBoxes.map((b) => b.box.w)) : 0,
  };
}

function cumulative(values: number[]): number[] {
  const out = [0];
  for (const v of values) out.push(out[out.length - 1] + v);
  return out;
}

/** Index of the last page row that is still inside a merge ending at `lastSourceRow`. */
function lastRowOnPage(rows: number[], from: number, lastSourceRow: number): number {
  let i = from;
  while (i + 1 < rows.length && rows[i + 1] === rows[i] + 1 && rows[i + 1] <= lastSourceRow) i++;
  return i;
}
