import { describe, expect, it } from 'vitest';
import { buildPrintable } from '../src/drawing';
import { base45Decode, base45Encode, decodePayload, encodePayload, PayloadError, sourceRowOf } from '../src/payload';
import { gridCellRect } from '../src/layout';
import { boxInCell, PRINT_VERSION } from '../src/spec';
import { normalizeSheet } from '../src/sheet';
import { sampleTemplate } from './sim/scenario';

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
