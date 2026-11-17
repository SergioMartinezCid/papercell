import { describe, expect, it } from 'vitest';
import { fieldToken, findToken, parseField, parseToken } from '../src/tokens';

describe('cell tokens', () => {
  it('reads a token that is the whole cell', () => {
    expect(parseToken('[ ]')).toEqual({ kind: 'mark' });
    expect(parseToken('  [   ] ')).toEqual({ kind: 'mark' });
    expect(parseToken('\u2610')).toEqual({ kind: 'mark' });
    expect(parseToken('[-]')).toEqual({ kind: 'blank' });
    expect(parseToken('[ - ]')).toEqual({ kind: 'blank' });
  });

  it('reads number fields, with # or 0 for digits but not both', () => {
    expect(parseToken('[##]')).toEqual({ kind: 'number', field: { digits: 2, decimals: 0, separator: '' } });
    expect(parseToken('[#,#]')).toEqual({ kind: 'number', field: { digits: 1, decimals: 1, separator: ',' } });
    expect(parseToken('[000.00]')).toEqual({ kind: 'number', field: { digits: 3, decimals: 2, separator: '.' } });
    for (const text of ['[#0]', '[0,#]', '[#,]', '[,#]', '[#.#.#]', '[# #]', `[${'#'.repeat(13)}]`]) expect(parseToken(text), text).toBeNull();
    expect(fieldToken({ digits: 2, decimals: 1, separator: ',' })).toBe('[##,#]');
    expect(parseField('00.0')).toEqual({ digits: 2, decimals: 1, separator: '.' });
    expect(parseField('[#]')).toEqual({ digits: 1, decimals: 0, separator: '' });
    expect(parseField('[ ]')).toBeNull();
  });

  it('ignores ordinary text', () => {
    for (const text of ['', 'x', '[]', '[x]', '[--]', 'a [-]', '[-] b', 'Q[1]', '-', '[12]', '[#a]']) expect(parseToken(text), text).toBeNull();
  });

  it('finds the first token anywhere in a note', () => {
    expect(findToken('Author:\nleave [-] here')).toEqual({ kind: 'blank' });
    expect(findToken('[x] then [ ] then [-]')).toEqual({ kind: 'mark' });
    expect(findToken('no token [] here')).toBeNull();
    expect(findToken('Teacher:\nscore [#,#] out of 10')).toEqual({ kind: 'number', field: { digits: 1, decimals: 1, separator: ',' } });
  });
});
