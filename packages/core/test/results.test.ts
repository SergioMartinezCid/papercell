import { describe, expect, it } from 'vitest';
import { chooseThreshold, classify } from '../src/scan/classify';
import { buildOutput, toCsv, toTsv } from '../src/results';

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

  it('escapes TSV and CSV', () => {
    expect(toTsv([['a\tb', 'c'], ['d', '"e"']])).toBe('"a\tb"\tc\nd\t"""e"""');
    expect(toCsv([['a,b', 'c']])).toBe('"a,b",c');
  });
});
