import { describe, expect, it } from 'vitest';
import { buildPrintable } from '../src/drawing';
import { base45Decode, base45Encode, decodePayload, encodePayload, PayloadError, sourceRowOf } from '../src/payload';
import { gridCellRect } from '../src/layout';
import { boxInCell, digitBoxes, letterBoxes, PRINT_VERSION, writingLine } from '../src/spec';
import { normalizeSheet } from '../src/sheet';
import { numberTemplate, sampleTemplate, textTemplate } from './sim/scenario';

describe('base45', () => {
  it('round-trips arbitrary bytes, including odd lengths', () => {
    for (const length of [0, 1, 2, 3, 17, 64]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 97 + 13) & 0xff);
      expect(base45Decode(base45Encode(bytes))).toEqual(bytes);
    }
  });

  it('matches the RFC 9285 example', () => {
    expect(base45Encode(new TextEncoder().encode('AB'))).toBe('BB8');
  });

  it('rejects text outside the alphabet', () => {
    expect(() => base45Decode('abc')).toThrow();
  });
});

describe('page payload', () => {
  it('round-trips and reproduces the printed box geometry exactly', () => {
    const printable = buildPrintable(sampleTemplate({ rows: 12 }));
    for (const page of printable.pages) {
      const decoded = decodePayload(page.code);
      expect(decoded).toEqual(page.payload);
      const boxes = decoded.boxes.map((b) => {
        const cell = gridCellRect(decoded.grid, b.pageRow, b.col, b.rowSpan, b.colSpan);
        return { row: sourceRowOf(decoded, b.pageRow), col: b.col, box: boxInCell(cell) };
      });
      expect(boxes).toEqual(page.layout.boxes.map((b) => ({ row: b.row, col: b.col, box: b.box })));
    }
  });

  it('keeps merged boxes and multi-page row mapping', () => {
    const template = sampleTemplate({ rows: 60, settings: { fit: 'width' } });
    template.sheet = normalizeSheet({ ...template.sheet, merges: [{ row: 3, col: 1, rowSpan: 1, colSpan: 2 }] });
    const printable = buildPrintable(template);
    expect(printable.pages.length).toBeGreaterThan(1);
    const second = decodePayload(printable.pages[1].code);
    expect(second.headerRows).toBe(1);
    expect(sourceRowOf(second, 0)).toBe(0);
    expect(sourceRowOf(second, 1)).toBe(printable.pages[1].layout.rows[1]);
    const first = decodePayload(printable.pages[0].code);
    expect(first.boxes.find((b) => b.pageRow === 3 && b.col === 1)).toMatchObject({ colSpan: 2 });
  });

  it('round-trips number fields and reproduces their digit boxes exactly', () => {
    const template = numberTemplate({ rows: 30, tokens: ['[##]', '[#,#]', '[ ]', '[000.00]'], settings: { fit: 'width' } });
    for (const page of buildPrintable(template).pages) {
      const decoded = decodePayload(page.code);
      expect(decoded).toEqual(page.payload);
      expect(decoded.boxes).toHaveLength(page.layout.boxes.length);
      const numbers = decoded.numbers!.map((n) => {
        const cell = gridCellRect(decoded.grid, n.pageRow, n.col, n.rowSpan, n.colSpan);
        return { row: sourceRowOf(decoded, n.pageRow), col: n.col, field: n.field, boxes: digitBoxes(cell, n.field, decoded.version).boxes };
      });
      const printed = page.layout.numbers.map((n) => ({ row: n.row, col: n.col, field: n.field, boxes: n.boxes }));
      expect(numbers.sort((a, b) => a.row - b.row || a.col - b.col)).toEqual(printed.sort((a, b) => a.row - b.row || a.col - b.col));
    }
  });

  it('round-trips letter fields and writing lines and reproduces where they were printed', () => {
    const template = textTemplate({ rows: 80, tokens: ['[____]', '[...]', '[##]', '[________]'], settings: { fit: 'width' } });
    template.overrides = { '3,1': 'line', '4,2': { letters: 3 } };
    const pages = buildPrintable(template).pages;
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const decoded = decodePayload(page.code);
      expect(decoded).toEqual(page.payload);
      const cell = (f: { pageRow: number; col: number; rowSpan: number; colSpan: number }) => gridCellRect(decoded.grid, f.pageRow, f.col, f.rowSpan, f.colSpan);
      const letters = decoded.letters!.map((l) => ({ row: sourceRowOf(decoded, l.pageRow), col: l.col, count: l.count, boxes: letterBoxes(cell(l), l.count, decoded.version) }));
      expect(letters).toEqual(page.layout.letters.map((l) => ({ row: l.row, col: l.col, count: l.count, boxes: l.boxes })));
      const lines = decoded.lines!.map((l) => ({ row: sourceRowOf(decoded, l.pageRow), col: l.col, line: writingLine(cell(l), decoded.version) }));
      expect(lines).toEqual(page.layout.lines.map((l) => ({ row: l.row, col: l.col, line: l.line })));
    }
    const first = decodePayload(pages[0].code);
    expect(first.lines!.find((l) => sourceRowOf(first, l.pageRow) === 3 && l.col === 1)).toBeDefined();
    expect(first.letters!.find((l) => sourceRowOf(first, l.pageRow) === 4 && l.col === 2)).toMatchObject({ count: 3 });
  });

  it('stays small with a column of number fields', () => {
    const { pages } = buildPrintable(numberTemplate({ rows: 40, tokens: ['[##]'] }));
    expect(encodePayload(pages[0].payload).length).toBeLessThan(100);
  });

  it('stays small with columns of different fields', () => {
    const { pages } = buildPrintable(textTemplate({ rows: 40, tokens: ['[____]', '[...]', '[#,#]', '[________]', '[##]'] }));
    expect(encodePayload(pages[0].payload).length).toBeLessThan(110);
  });

  it('stays small for a typical list', () => {
    const { pages } = buildPrintable(sampleTemplate({ rows: 40 }));
    expect(encodePayload(pages[0].payload).length).toBeLessThan(80);
  });

  it('tells codes from a newer print format apart from invalid ones', () => {
    const bytes = base45Decode(buildPrintable(sampleTemplate({ rows: 4 })).pages[0].code);
    const withVersion = (v: number) => base45Encode(Uint8Array.of(v, ...bytes.slice(1)));
    const reason = (v: number) => {
      try {
        decodePayload(withVersion(v));
        return 'ok';
      } catch (e) {
        return e instanceof PayloadError ? e.reason : 'other';
      }
    };
    expect(reason(PRINT_VERSION)).toBe('ok');
    expect(reason(PRINT_VERSION + 1)).toBe('newer');
    expect(reason(0)).toBe('invalid');
  });
});
