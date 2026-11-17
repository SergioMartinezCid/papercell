/**
 * Tokens that say what a cell is. A token counts when it is the whole text of a cell, or anywhere in the
 * cell's note (the first one counts, so the note can explain it). Square brackets keep ordinary text from
 * matching by accident.
 * - `[ ]` (or `☐`): a box to mark.
 * - `[-]`: blank: printed empty and not read.
 */
export type CellToken = { kind: 'mark' } | { kind: 'blank' };

const TOKEN = /\[(\s+|\s*-\s*)\]|☐/g;
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

function tokenOf(match: RegExpMatchArray): CellToken | null {
  if (match[1] === undefined) return { kind: 'mark' };
  const inner = match[1].trim();
  if (inner === '') return { kind: 'mark' };
  if (inner === '-') return { kind: 'blank' };
  return null;
}
