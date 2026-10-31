/**
 * HTML tables, as spreadsheets put them on the clipboard (Google Sheets, LibreOffice, Excel):
 * text, merged cells, column widths, row heights and inline formatting.
 */
import { DEFAULT_FONT_SIZE, normalizeSheet, type CellStyle, type Merge, type Sheet, type SheetCell } from '../sheet';

/** Reads the first table under `root` (a parsed document or element); null when there is none. */
export function sheetFromHtmlTable(root: ParentNode): Sheet | null {
  const table = root.querySelector('table');
  if (!table) return null;
  const tableStyle = parseStyle(table.getAttribute('style'));
  const baseFontSize = fontSizePt(tableStyle['font-size']) ?? DEFAULT_FONT_SIZE;

  const colWidths: number[] = [];
  for (const col of Array.from(table.querySelectorAll('col'))) {
    const span = Number(col.getAttribute('span') ?? 1) || 1;
    const width = px(col.getAttribute('width')) ?? px(parseStyle(col.getAttribute('style')).width);
    for (let i = 0; i < span; i++) colWidths.push(width ?? 0);
  }

  const cells: SheetCell[][] = [];
  const rowHeights: number[] = [];
  const merges: Merge[] = [];
  const taken = new Set<string>();
  const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
  rows.forEach((tr, r) => {
    cells[r] ??= [];
    rowHeights[r] = px(parseStyle(tr.getAttribute('style')).height) ?? px(tr.getAttribute('height')) ?? 0;
    let c = 0;
    for (const td of Array.from(tr.children)) {
      if (td.tagName !== 'TD' && td.tagName !== 'TH') continue;
      while (taken.has(`${r},${c}`)) c++;
      const rowSpan = Math.max(1, Number(td.getAttribute('rowspan') ?? 1) || 1);
      const colSpan = Math.max(1, Number(td.getAttribute('colspan') ?? 1) || 1);
      cells[r][c] = { text: textOf(td).replace(/ /g, ' ').trim(), style: styleOf(td, baseFontSize) };
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          taken.add(`${r + dr},${c + dc}`);
          if (dr || dc) {
            cells[r + dr] ??= [];
            cells[r + dr][c + dc] = { text: '' };
          }
        }
      }
      if (rowSpan > 1 || colSpan > 1) merges.push({ row: r, col: c, rowSpan, colSpan });
      c += colSpan;
    }
  });
  const dense = Array.from({ length: Math.max(rows.length, cells.length) }, (_, r) =>
    Array.from({ length: Math.max(0, ...cells.map((row) => row?.length ?? 0)) }, (_, c) => cells[r]?.[c] ?? { text: '' }),
  );
  if (dense.length === 0) return null;
  return normalizeSheet({ cells: dense, colWidths, rowHeights, merges });
}

function textOf(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) out += child.textContent ?? '';
    else if (child.nodeType === 1) {
      const el = child as Element;
      if (el.tagName === 'BR') out += '\n';
      else if (el.tagName !== 'STYLE' && el.tagName !== 'SCRIPT') out += textOf(el);
    }
  });
  return out;
}

function styleOf(td: Element, baseFontSize: number): CellStyle | undefined {
  const own = parseStyle(td.getAttribute('style'));
  // Rich-text cells keep their formatting on a single inner element.
  const only = td.children.length === 1 ? parseStyle(td.children[0].getAttribute('style')) : {};
  const get = (key: string) => only[key] ?? own[key];
  const style: CellStyle = {};
  const weight = get('font-weight');
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600 || td.querySelector(':scope > b, :scope > strong')) style.bold = true;
  if (get('font-style') === 'italic' || td.querySelector(':scope > i, :scope > em')) style.italic = true;
  const align = get('text-align') ?? td.getAttribute('align') ?? undefined;
  if (align === 'left' || align === 'center' || align === 'right') style.align = align;
  const bg = own['background-color'] ?? own.background ?? td.getAttribute('bgcolor') ?? undefined;
  if (bg && !isWhite(bg)) style.background = bg;
  const color = get('color');
  if (color && !isBlack(color)) style.color = color;
  const size = fontSizePt(get('font-size'));
  if (size && size !== baseFontSize) style.fontSize = size;
  else if (baseFontSize !== DEFAULT_FONT_SIZE) style.fontSize = baseFontSize;
  return Object.keys(style).length ? style : undefined;
}

function parseStyle(text: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (text ?? '').split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim().toLowerCase();
  }
  return out;
}

function px(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^([\d.]+)\s*(px|pt)?$/.exec(value.trim());
  if (!m) return undefined;
  const v = Number(m[1]);
  return m[2] === 'pt' ? (v * 96) / 72 : v;
}

function fontSizePt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^([\d.]+)\s*(px|pt)$/.exec(value.trim());
  if (!m) return undefined;
  const v = Number(m[1]);
  return m[2] === 'px' ? (v * 72) / 96 : v;
}

function isWhite(color: string): boolean {
  return ['#fff', '#ffffff', 'white', 'transparent', 'rgb(255,255,255)', 'rgb(255, 255, 255)', 'inherit'].includes(color);
}

function isBlack(color: string): boolean {
  return ['#000', '#000000', 'black', 'rgb(0,0,0)', 'rgb(0, 0, 0)', 'inherit'].includes(color);
}
