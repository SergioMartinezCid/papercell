import { describe, expect, it } from 'vitest';
import { chooseThreshold, classify } from '../src/scan/classify';
import { buildOutput, outputBlock, toCsv, toTsv } from '../src/results';

describe('chooseThreshold', () => {
  it('splits marked from empty boxes and flags values in between', () => {
    const t = chooseThreshold([0.01, 0.02, 0.03, 0.02, 0.8, 0.85, 0.75]);
    expect(t.separated).toBe(true);
    expect(classify(0.02, t)).toEqual({ marked: false, uncertain: false });
    expect(classify(0.8, t)).toEqual({ marked: true, uncertain: false });
    expect(classify(0.2, t).uncertain).toBe(true);
    // Hand marks vary a lot, so a half-filled box is still a confident mark.
    expect(classify(0.4, t)).toEqual({ marked: true, uncertain: false });
  });

  it('falls back to a fixed threshold when all boxes look alike', () => {
    expect(classify(0.03, chooseThreshold([0.01, 0.02, 0.03])).marked).toBe(false);
    expect(classify(0.8, chooseThreshold([0.8, 0.82, 0.79])).marked).toBe(true);
  });

  it('tells light marks apart when the empty boxes are even', () => {
    // Small marks with a coloured pen, as measured on photos: close to the empty boxes, but far more
    // than the empty boxes differ from each other.
    const empty = Array.from({ length: 40 }, (_, i) => 0.01 + (i % 5) * 0.005);
    const marks = [0.12, 0.16, 0.2, 0.25, 0.28];
    const t = chooseThreshold([...empty, ...marks]);
    expect(t.separated).toBe(true);
    for (const f of empty) expect(classify(f, t)).toEqual({ marked: false, uncertain: false });
    for (const f of marks.slice(1)) expect(classify(f, t)).toEqual({ marked: true, uncertain: false });
    expect(classify(0.12, t).marked).toBe(true);
  });

  it('does not split a page of only empty boxes', () => {
    const uneven = Array.from({ length: 60 }, (_, i) => (i / 59) * 0.08);
    expect(chooseThreshold(uneven).separated).toBe(false);
    const withSpecks = [...Array.from({ length: 40 }, (_, i) => 0.01 + (i % 5) * 0.005), 0.05, 0.06];
    expect(chooseThreshold(withSpecks).separated).toBe(false);
  });
});

describe('buildOutput', () => {
  const marks = [
    { row: 1, col: 1, marked: true },
    { row: 1, col: 2, marked: false },
    { row: 2, col: 1, marked: false },
    { row: 2, col: 2, marked: true },
  ];
  const base = { sourceRows: 3, sourceCols: 3, anchor: { row: 4, col: 1 }, marks };

  it('outputs the block of boxes with its position in the spreadsheet', () => {
    const out = buildOutput(base, { shape: 'boxes', markedValue: '1', emptyValue: '' });
    expect(out.values).toEqual([
      ['1', ''],
      ['', '1'],
    ]);
    expect(out.topLeft).toEqual({ row: 5, col: 2 });
    expect(out.unknownCells).toBe(0);
  });

  it('fills the whole range, copying known text and counting unknown cells', () => {
    const texts = [
      ['Item', 'A', 'B'],
      ['x', '', ''],
      ['y', '', ''],
    ];
    const withText = buildOutput({ ...base, texts }, { shape: 'range', markedValue: 'TRUE', emptyValue: 'FALSE' });
    expect(withText.values).toEqual([
      ['Item', 'A', 'B'],
      ['x', 'TRUE', 'FALSE'],
      ['y', 'FALSE', 'TRUE'],
    ]);
    expect(buildOutput(base, { shape: 'range', markedValue: '1', emptyValue: '' }).unknownCells).toBe(5);
  });

  it('outputs only the selected part, clipped to the range', () => {
    const options = { shape: 'boxes', markedValue: '1', emptyValue: '0' } as const;
    const column = buildOutput(base, options, { top: 0, left: 2, bottom: 2, right: 2 });
    expect(column.values).toEqual([[''], ['0'], ['1']]);
    expect(column.topLeft).toEqual({ row: 4, col: 3 });
    expect(column.unknownCells).toBe(1);
    const clipped = buildOutput(base, options, { top: 2, left: 1, bottom: 9, right: 9 });
    expect(clipped.values).toEqual([['0', '1']]);
    expect(clipped.topLeft).toEqual({ row: 6, col: 2 });
    expect(clipped.block).toEqual({ top: 2, left: 1, bottom: 2, right: 2 });
    // A selection entirely outside the range falls back to the shape.
    expect(buildOutput(base, options, { top: 5, left: 5, bottom: 6, right: 6 }).values).toEqual([
      ['1', '0'],
      ['0', '1'],
    ]);
  });

  it('gives the block of each shape', () => {
    expect(outputBlock(base, 'boxes')).toEqual({ top: 1, left: 1, bottom: 2, right: 2 });
    expect(outputBlock(base, 'range')).toEqual({ top: 0, left: 0, bottom: 2, right: 2 });
    expect(outputBlock({ ...base, marks: [] }, 'boxes')).toEqual({ top: 0, left: 0, bottom: 2, right: 2 });
  });

  it('escapes TSV and CSV', () => {
    expect(toTsv([['a\tb', 'c'], ['d', '"e"']])).toBe('"a\tb"\tc\nd\t"""e"""');
    expect(toCsv([['a,b', 'c']])).toBe('"a,b",c');
  });
});
