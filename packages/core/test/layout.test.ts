import { describe, expect, it } from 'vitest';
import { buildPrintable, drawingToSvg } from '../src/drawing';
import { contentRect, layoutSheet } from '../src/layout';
import { markerMatrix } from '../src/markers';
import { MARKER_DICTIONARY, paperFormat } from '../src/spec';
import { AR } from '../src/vendor/js-aruco2/aruco.js';
import { cellAddress, classifyCells, normalizeSheet, otherSeparatorField, parseCellAddress, parseRangeAddress, planCells, rangeAddress } from '../src/sheet';
import { numberTemplate, sampleTemplate, textTemplate } from './sim/scenario';

const text = (rows: string[][]) => normalizeSheet({ cells: rows.map((r) => r.map((t) => ({ text: t }))) });
const within = (inner: { x: number; y: number; w: number; h: number }, outer: typeof inner) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w + 1e-9 && inner.y + inner.h <= outer.y + outer.h + 1e-9;

describe('classifyCells', () => {
  it('treats text as printed only, empty cells as boxes and fully empty rows as spacers', () => {
    const kinds = classifyCells(text([['Name', 'A', 'B'], ['x', '', ''], ['', '', ''], ['y', '', 'note']]));
    expect(kinds).toEqual([
      ['text', 'text', 'text'],
      ['text', 'mark', 'mark'],
      ['blank', 'blank', 'blank'],
      ['text', 'mark', 'text'],
    ]);
  });

  it('applies overrides and hides cells under merges', () => {
    const sheet = normalizeSheet({ ...text([['a', '', ''], ['b', '', '']]), merges: [{ row: 0, col: 1, rowSpan: 1, colSpan: 2 }] });
    const kinds = classifyCells(sheet, { '1,2': 'blank' });
    expect(kinds).toEqual([
      ['text', 'mark', 'covered'],
      ['text', 'mark', 'blank'],
    ]);
  });

  it('takes kinds from tokens in cells and notes, after choices made by hand', () => {
    const c = (text: string, note?: string) => ({ text, ...(note ? { note } : {}) });
    const sheet = normalizeSheet({
      cells: [
        [c('Name'), c('A'), c('B'), c('C')],
        [c('x'), c('[-]'), c('', '[-] absent'), c('')],
        [c('y'), c(' [ ] '), c('', 'Ann:\nleave [-] here'), c('', 'nothing to see')],
        [c(''), c('\u2610'), c('', '[ ]'), c('')],
        [c('z'), c('Q[1]'), c('[-]', '[ ]'), c('text', '[-]')],
      ],
    });
    expect(classifyCells(sheet, { '1,1': 'mark' })).toEqual([
      ['text', 'text', 'text', 'text'],
      ['text', 'mark', 'blank', 'mark'],
      ['text', 'mark', 'blank', 'mark'],
      ['blank', 'mark', 'mark', 'blank'],
      ['text', 'text', 'blank', 'text'],
    ]);
  });

  it('leaves hidden rows and columns out', () => {
    const sheet = normalizeSheet({ ...text([['Name', 'old', 'A'], ['x', '1', ''], ['gone', '', ''], ['y', '', '']]), hiddenRows: [2], hiddenCols: [1] });
    expect(classifyCells(sheet)).toEqual([
      ['text', 'hidden', 'text'],
      ['text', 'hidden', 'mark'],
      ['hidden', 'hidden', 'hidden'],
      ['text', 'hidden', 'mark'],
    ]);
  });
});

describe('number fields', () => {
  it('finds a field whose decimals follow another separator than the spreadsheet', () => {
    const sheet = normalizeSheet({ cells: [[{ text: '[##]' }, { text: '[0,0]' }], [{ text: '', note: 'mark: [##.#]' }, { text: '[#.#]' }]] });
    expect(otherSeparatorField(sheet, ',')).toEqual({ digits: 2, decimals: 1, separator: '.' });
    expect(otherSeparatorField(sheet, '.')).toEqual({ digits: 1, decimals: 1, separator: ',' });
    expect(otherSeparatorField(text([['[##]', '[#,##]']]), ',')).toBeNull();
  });

  it('prints one box per digit inside the cell, with a slot for the separator', () => {
    const layout = layoutSheet(numberTemplate({ rows: 3, tokens: ['[##,#]'] }), 29);
    expect(layout.numberCount).toBe(3);
    const n = layout.pages[0].numbers[0];
    expect(n.boxes).toHaveLength(3);
    for (const b of n.boxes) expect(within(b, n.cell)).toBe(true);
    for (let i = 1; i < 3; i++) expect(n.boxes[i].x).toBeGreaterThan(n.boxes[i - 1].x + n.boxes[i - 1].w);
    expect(n.separator!.x).toBeCloseTo(n.boxes[1].x + n.boxes[1].w, 9);
    expect(n.separator!.x + n.separator!.w).toBeCloseTo(n.boxes[2].x, 9);
  });

  it('shrinks the boxes to fit a narrow cell', () => {
    const template = numberTemplate({ rows: 3, tokens: ['[####]'] });
    template.sheet = normalizeSheet({ ...template.sheet, colWidths: [160, 40] });
    const n = layoutSheet(template, 29).pages[0].numbers[0];
    for (const b of n.boxes) expect(within(b, n.cell)).toBe(true);
    expect(n.boxes[3].x + n.boxes[3].w - n.boxes[0].x).toBeLessThanOrEqual(n.cell.w * 0.92 + 1e-9);
  });

  it('counts number fields as input rows, not header rows', () => {
    const sheet = text([['Name', 'Score'], ['', '[##]'], ['x', '']]);
    expect(layoutSheet({ ...sampleTemplate(), sheet }, 29).headerRows).toBe(1);
  });
});

describe('letter fields and writing lines', () => {
  it('take their kind from tokens, notes and choices made by hand', () => {
    const sheet = normalizeSheet({
      cells: [
        [{ text: 'Name' }, { text: 'Code' }, { text: 'Comment' }],
        [{ text: 'x' }, { text: '[_____]' }, { text: '[...]' }],
        [{ text: 'y' }, { text: '', note: 'code [___]' }, { text: '', note: 'Comments: […]' }],
        [{ text: 'z' }, { text: '' }, { text: '' }],
      ],
    });
    const plan = planCells(sheet, { '3,1': { letters: 2 }, '3,2': 'line' });
    expect(plan.kinds.slice(1)).toEqual([
      ['text', 'letters', 'line'],
      ['text', 'letters', 'line'],
      ['text', 'letters', 'line'],
    ]);
    expect([...plan.letters]).toEqual([
      ['1,1', 5],
      ['2,1', 3],
      ['3,1', 2],
    ]);
  });

  it('prints one box per letter and a line inside the cell', () => {
    const layout = layoutSheet(textTemplate({ rows: 3, tokens: ['[______]', '[...]'] }), 29);
    expect(layout.letterCount).toBe(3);
    expect(layout.lineCount).toBe(3);
    expect(layout.headerRows).toBe(1);
    const [letters] = layout.pages[0].letters;
    expect(letters.boxes).toHaveLength(6);
    for (const b of letters.boxes) expect(within(b, letters.cell)).toBe(true);
    expect(layout.minCharHeight).toBeCloseTo(letters.boxes[0].h, 9);
    const [{ cell, line }] = layout.pages[0].lines;
    expect(line.x).toBeGreaterThan(cell.x);
    expect(line.x + line.w).toBeLessThan(cell.x + cell.w);
    expect(line.y).toBeGreaterThan(cell.y + cell.h / 2);
    expect(line.y).toBeLessThan(cell.y + cell.h);
  });
});

describe('hidden rows and columns', () => {
  it('keep their place in the range but take no room on paper', () => {
    const sheet = normalizeSheet({ ...text([['Name', 'old', 'A'], ['x', '1', ''], ['gone', '', ''], ['y', '', '']]), hiddenRows: [2], hiddenCols: [1] });
    const layout = layoutSheet({ ...sampleTemplate(), sheet }, 29);
    const [page] = layout.pages;
    expect(page.rows).toEqual([0, 1, 2, 3]);
    expect(page.grid.rowEdges[3] - page.grid.rowEdges[2]).toBe(0);
    expect(page.grid.colEdges[2] - page.grid.colEdges[1]).toBe(0);
    expect(page.cells.some((c) => c.row === 2 || c.col === 1)).toBe(false);
    expect(page.boxes.map((b) => [b.row, b.col])).toEqual([
      [1, 2],
      [3, 2],
    ]);
  });
});

describe('addresses', () => {
  it('converts between A1 notation and indexes', () => {
    expect(cellAddress(0, 0)).toBe('A1');
    expect(cellAddress(9, 27)).toBe('AB10');
    expect(parseCellAddress('ab10')).toEqual({ row: 9, col: 27 });
    expect(parseCellAddress("'List'!$C$2")).toEqual({ row: 1, col: 2 });
    expect(parseCellAddress('nope')).toBeNull();
  });

  it('parses and formats ranges', () => {
    const within = { top: 2, left: 1, bottom: 19, right: 6 };
    expect(parseRangeAddress('C3:F20', within)).toEqual({ top: 2, left: 2, bottom: 19, right: 5 });
    expect(parseRangeAddress("'List'!$F$20:c3", within)).toEqual({ top: 2, left: 2, bottom: 19, right: 5 });
    expect(parseRangeAddress('d7', within)).toEqual({ top: 6, left: 3, bottom: 6, right: 3 });
    expect(parseRangeAddress('D:E', within)).toEqual({ top: 2, left: 3, bottom: 19, right: 4 });
    expect(parseRangeAddress('5:4', within)).toEqual({ top: 3, left: 1, bottom: 4, right: 6 });
    for (const bad of ['', 'C3:', 'C3:F', 'A1:B2:C3', '0:3']) expect(parseRangeAddress(bad, within)).toBeNull();
    expect(rangeAddress({ top: 2, left: 2, bottom: 19, right: 5 })).toBe('C3:F20');
    expect(rangeAddress({ top: 6, left: 3, bottom: 6, right: 3 })).toBe('D7');
  });
});

describe('markerMatrix', () => {
  it('prints the codes of the detector dictionary', () => {
    const dictionary = new AR.Dictionary(MARKER_DICTIONARY);
    for (let id = 0; id < 16; id++) {
      const bits = markerMatrix(id)
        .slice(1, -1)
        .flatMap((row) => row.slice(1, -1).map((black) => (black ? '0' : '1')))
        .join('');
      expect(bits).toBe(dictionary.codeList[id]);
    }
    expect(() => markerMatrix(16)).toThrow(RangeError);
  });
});

describe('layoutSheet', () => {
  it('fits a list on one page and keeps every box inside the content area', () => {
    const layout = layoutSheet(sampleTemplate({ rows: 40 }), 20);
    expect(layout.pages).toHaveLength(1);
    const content = contentRect(paperFormat('a4', 'portrait'), 20);
    for (const b of layout.pages[0].boxes) {
      expect(b.box.x).toBeGreaterThanOrEqual(content.x);
      expect(b.box.y + b.box.h).toBeLessThanOrEqual(content.y + content.h);
    }
    expect(layout.boxCount).toBe(160);
  });

  it('repeats the header rows on following pages in width mode', () => {
    const layout = layoutSheet(sampleTemplate({ rows: 80, settings: { fit: 'width' } }), 20);
    expect(layout.pages.length).toBeGreaterThan(1);
    for (const page of layout.pages) expect(page.rows[0]).toBe(0);
    const bodyRows = layout.pages.flatMap((p) => p.rows.slice(p.headerRows));
    expect(bodyRows).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
  });

  it('prints backgrounds according to the setting', () => {
    const rects = (backgrounds: 'none' | 'text' | 'all') => {
      const t = sampleTemplate({ rows: 4, stripe: '#cfe2f3', settings: { backgrounds } });
      return buildPrintable(t).pages[0].drawing.shapes.filter((s) => s.kind === 'rect');
    };
    expect(rects('none')).toHaveLength(0);
    expect(rects('text')).toHaveLength(2);
    // Two striped rows of five cells, then their eight boxes kept white.
    expect(rects('all').filter((r) => r.fill === '#cfe2f3')).toHaveLength(10);
    expect(rects('all').filter((r) => r.fill === '#ffffff')).toHaveLength(8);
  });

  it('keeps boxes in coloured cells white, with a margin inside the cell', () => {
    const t = sampleTemplate({ rows: 4, stripe: '#cfe2f3', settings: { backgrounds: 'all' } });
    const page = buildPrintable(t).pages[0];
    const white = page.drawing.shapes.flatMap((s) => (s.kind === 'rect' && s.fill === '#ffffff' ? [s] : []));
    for (const box of page.layout.boxes.filter((b) => b.row % 2 === 0)) {
      const area = white.find((r) => r.x <= box.box.x && r.x + r.w >= box.box.x + box.box.w && r.y <= box.box.y && r.y + r.h >= box.box.y + box.box.h);
      expect(area).toBeDefined();
      expect(area!.x).toBeGreaterThanOrEqual(box.cell.x);
      expect(area!.x + area!.w).toBeLessThanOrEqual(box.cell.x + box.cell.w);
      expect(area!.y).toBeGreaterThanOrEqual(box.cell.y);
      expect(area!.y + area!.h).toBeLessThanOrEqual(box.cell.y + box.cell.h);
    }
  });

  it('renders an SVG sized in millimetres', () => {
    const svg = drawingToSvg(buildPrintable(sampleTemplate({ rows: 3 })).pages[0].drawing);
    expect(svg).toMatch(/^<svg [^>]*width="210mm" height="297mm"/);
    expect(svg).toContain('Item 3');
  });
});
