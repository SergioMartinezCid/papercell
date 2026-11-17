/**
 * Tokens that say what a cell is. A token counts when it is the whole text of a cell, or anywhere in the
 * cell's note (the first one counts, so the note can explain it). Square brackets keep ordinary text from
 * matching by accident.
 * - `[ ]` (or `☐`): a box to mark.
 * - `[-]`: blank: printed empty and not read.
 * - `[##]`, `[#,#]`, `[##.##]`…: a number written by hand, one digit per printed box; `#` stands for a digit
 *   and `,` or `.` for the decimal separator, printed between the boxes. `0` can be used instead of `#`
 *   (`[00]`, `[0,0]`), but not mixed with it.
 */

export interface NumberField {
  /** Boxes before the separator. */
  digits: number;
  /** Boxes after the separator. */
  decimals: number;
  /** Printed between the two groups of boxes and used in the value read; empty without decimals. */
  separator: '' | '.' | ',';
}

export type CellToken = { kind: 'mark' } | { kind: 'blank' } | { kind: 'number'; field: NumberField };

/** Most digits in one number field. */
export const MAX_FIELD_DIGITS = 12;

const TOKEN = /\[(\s+|\s*-\s*|#+(?:[.,]#+)?|0+(?:[.,]0+)?)\]|☐/g;
const WHOLE = new RegExp(`^(?:${TOKEN.source})$`);

/** The token that is the whole of `text`, if any. */
export function parseToken(text: string): CellToken | null {
  const match = WHOLE.exec(text.trim());
  return match ? tokenOf(match) : null;
}

/** The first token in a note. */
export function findToken(note: string): CellToken | null {
  for (const match of note.matchAll(TOKEN)) {
    const token = tokenOf(match);
    if (token) return token;
  }
  return null;
}

/** A number field written as a token, e.g. `[##,#]`. */
export function fieldToken(field: NumberField): string {
  return `[${'#'.repeat(field.digits)}${field.decimals ? field.separator + '#'.repeat(field.decimals) : ''}]`;
}

/** Parses a number field written as a token, with or without its brackets (`##,#`). */
export function parseField(text: string): NumberField | null {
  const t = text.trim();
  const token = parseToken(t.startsWith('[') ? t : `[${t}]`);
  return token?.kind === 'number' ? token.field : null;
}

export function sameField(a: NumberField, b: NumberField): boolean {
  return a.digits === b.digits && a.decimals === b.decimals && a.separator === b.separator;
}

function tokenOf(match: RegExpMatchArray): CellToken | null {
  if (match[1] === undefined) return { kind: 'mark' };
  const inner = match[1].trim();
  if (inner === '') return { kind: 'mark' };
  if (inner === '-') return { kind: 'blank' };
  const [whole, fraction = ''] = inner.split(/[.,]/);
  if (whole.length + fraction.length > MAX_FIELD_DIGITS) return null;
  const separator = fraction ? (inner[whole.length] as '.' | ',') : '';
  return { kind: 'number', field: { digits: whole.length, decimals: fraction.length, separator } };
}
