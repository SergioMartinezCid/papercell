import { describe, expect, it } from 'vitest';
import { findToken, parseToken } from '../src/tokens';

describe('cell tokens', () => {
  it('reads a token that is the whole cell', () => {
    expect(parseToken('[ ]')).toEqual({ kind: 'mark' });
    expect(parseToken('  [   ] ')).toEqual({ kind: 'mark' });
    expect(parseToken('\u2610')).toEqual({ kind: 'mark' });
    expect(parseToken('[-]')).toEqual({ kind: 'blank' });
    expect(parseToken('[ - ]')).toEqual({ kind: 'blank' });
  });

  it('ignores ordinary text', () => {
    for (const text of ['', 'x', '[]', '[x]', '[--]', 'a [-]', '[-] b', 'Q[1]', '-']) expect(parseToken(text), text).toBeNull();
  });

  it('finds the first token anywhere in a note', () => {
    expect(findToken('Author:\nleave [-] here')).toEqual({ kind: 'blank' });
    expect(findToken('[x] then [ ] then [-]')).toEqual({ kind: 'mark' });
    expect(findToken('no token [] here')).toBeNull();
  });
});
