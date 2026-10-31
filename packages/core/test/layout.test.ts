import { describe, expect, it } from 'vitest';
import { buildPrintable, drawingToSvg } from '../src/drawing';
import { contentRect, layoutSheet, paperFormat } from '../src/layout';
import { MARKER_DICTIONARY, markerMatrix } from '../src/markers';
import { AR } from '../src/vendor/js-aruco2/aruco.js';
import { cellAddress, classifyCells, normalizeSheet, parseCellAddress, parseRangeAddress, rangeAddress } from '../src/sheet';
import { sampleTemplate } from './sim/scenario';

const text = (rows: string[][]) => normalizeSheet({ cells: rows.map((r) => r.map((t) => ({ text: t }))) });

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
    const count = (backgrounds: 'none' | 'text' | 'all') => {
      const t = sampleTemplate({ rows: 4, stripe: '#cfe2f3', settings: { backgrounds } });
      return buildPrintable(t).pages[0].drawing.shapes.filter((s) => s.kind === 'rect').length;
    };
    expect(count('none')).toBe(0);
    expect(count('text')).toBe(2);
    expect(count('all')).toBe(10);
  });

  it('renders an SVG sized in millimetres', () => {
    const svg = drawingToSvg(buildPrintable(sampleTemplate({ rows: 3 })).pages[0].drawing);
    expect(svg).toMatch(/^<svg [^>]*width="210mm" height="297mm"/);
    expect(svg).toContain('Item 3');
  });
});
