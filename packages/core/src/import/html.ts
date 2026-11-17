/**
 * HTML tables, as spreadsheets put them on the clipboard (Google Sheets, LibreOffice, Excel):
 * text, notes, merged cells, column widths, row heights, hidden rows and columns, and formatting (inline,
 * or in style rules for cells and classes, where Excel puts it).
 */
import { DEFAULT_FONT_SIZE, normalizeSheet, type CellStyle, type Merge, type Sheet, type SheetCell } from '../sheet';
import { notesFromOnlyOffice } from './onlyOffice';

/** Reads the first table under `root` (a parsed document or element); null when there is none. */
export function sheetFromHtmlTable(root: ParentNode): Sheet | null {
  const table = root.querySelector('table');
  if (!table) return null;
  const tableStyle = parseStyle(table.getAttribute('style'));
  const baseFontSize = fontSizePt(tableStyle['font-size']) ?? DEFAULT_FONT_SIZE;
  const rules = cellRules(root);

  const colWidths: number[] = [];
  const hiddenCols: number[] = [];
  for (const col of Array.from(table.querySelectorAll('col'))) {
    const span = Number(col.getAttribute('span') ?? 1) || 1;
    const style = parseStyle(col.getAttribute('style'));
    const width = px(col.getAttribute('width')) ?? px(style.width);
    for (let i = 0; i < span; i++) {
      if (style.display === 'none') hiddenCols.push(colWidths.length);
      colWidths.push(width ?? 0);
    }
  }

  const cells: SheetCell[][] = [];
  const rowHeights: number[] = [];
  const merges: Merge[] = [];
  const taken = new Set<string>();
  const hiddenRows: number[] = [];
  const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
  rows.forEach((tr, r) => {
    cells[r] ??= [];
    const rowStyle = parseStyle(tr.getAttribute('style'));
    rowHeights[r] = px(rowStyle.height) ?? px(tr.getAttribute('height')) ?? 0;
    if (rowStyle.display === 'none') hiddenRows.push(r);
    let c = 0;
    for (const td of Array.from(tr.children)) {
      if (td.tagName !== 'TD' && td.tagName !== 'TH') continue;
      while (taken.has(`${r},${c}`)) c++;
      const rowSpan = Math.max(1, Number(td.getAttribute('rowspan') ?? 1) || 1);
      const colSpan = Math.max(1, Number(td.getAttribute('colspan') ?? 1) || 1);
      const note = noteOf(td);
      cells[r][c] = { text: textOf(td).replace(/ /g, ' ').trim(), style: styleOf(td, rules, baseFontSize), ...(note ? { note } : {}) };
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
  // ONLYOFFICE gives widths on the cells only, and notes only in data of its own.
  if (colWidths.length === 0 && rows[0]) {
    for (const td of Array.from(rows[0].children)) {
      const span = Math.max(1, Number(td.getAttribute('colspan') ?? 1) || 1);
      const width = px(parseStyle(td.getAttribute('style')).width) ?? px(td.getAttribute('width'));
      for (let i = 0; i < span; i++) {
        if (width === 0) hiddenCols.push(colWidths.length);
        colWidths.push(width === undefined ? 0 : width / span);
      }
    }
  }
  for (const note of notesFromOnlyOffice(table) ?? []) {
    const cell = dense[note.row]?.[note.col];
    if (cell && !cell.note) dense[note.row][note.col] = { ...cell, note: note.text };
  }
  return normalizeSheet({ cells: dense, colWidths, rowHeights, merges, hiddenRows, hiddenCols });
}

/** Elements that are not part of the cell's text: LibreOffice writes a cell's note as `<comment>`. */
const NOT_TEXT = new Set(['STYLE', 'SCRIPT', 'COMMENT']);

function textOf(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) out += child.textContent ?? '';
    else if (child.nodeType === 1) {
      const el = child as Element;
      if (el.tagName === 'BR') out += '\n';
      else if (!NOT_TEXT.has(el.tagName)) out += textOf(el);
    }
  });
  return out;
}

function noteOf(td: Element): string {
  return Array.from(td.querySelectorAll('comment'))
    .map((c) => (c.textContent ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

type Declarations = Record<string, string>;

interface CellRules {
  /** Declarations for every cell (`td { … }`). */
  td: Declarations;
  /** Declarations by class name (`.xl65 { … }`). */
  classes: Map<string, Declarations>;
}

/** Style rules that apply to cells, from the `<style>` blocks. */
function cellRules(root: ParentNode): CellRules {
  const rules: CellRules = { td: {}, classes: new Map() };
  for (const el of Array.from(root.querySelectorAll('style'))) {
    const css = (el.textContent ?? '').replace(/<!--|-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const declarations = parseStyle(body);
      for (const selector of selectors.split(',').map((x) => x.trim().toLowerCase())) {
        const cls = /^(?:td)?\.([\w-]+)$/.exec(selector)?.[1];
        if (selector === 'td') Object.assign(rules.td, declarations);
        else if (cls) rules.classes.set(cls, { ...rules.classes.get(cls), ...declarations });
      }
    }
  }
  return rules;
}

function styleOf(td: Element, rules: CellRules, baseFontSize: number): CellStyle | undefined {
  const classes = (td.getAttribute('class') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const own: Declarations = Object.assign({}, rules.td, ...classes.map((c) => rules.classes.get(c) ?? {}), parseStyle(td.getAttribute('style')));
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
  return ['#000', '#000000', 'black', 'windowtext', 'auto', 'rgb(0,0,0)', 'rgb(0, 0, 0)', 'inherit'].includes(color);
}
