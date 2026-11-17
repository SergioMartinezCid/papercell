/**
 * Reading handwritten capital letters (and digits) in letter fields: a crop of a box is normalized like a
 * digit (see `normalizeDigit`), then classified by a network trained on EMNIST (see
 * scripts/train_letters.py).
 */
import { LETTER_MODEL } from './letterModel';
import { classifier } from './network';

/** What the letter network tells apart, in the order of its outputs. */
export const LETTER_CLASSES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZÑ';

/**
 * Letter fields mostly hold letters, so digits count as this much less likely than the network says: O is
 * not taken for 0, nor I for 1, unless the writing clearly is a digit. On EMNIST capitals with photo-like
 * distortions, this halves the letters read wrongly (8% to 4%).
 */
const DIGIT_PRIOR = 0.2;

const letterNetwork = classifier(LETTER_MODEL);

/** Probabilities of each of LETTER_CLASSES for a normalized 28×28 input, in a letter field. */
export function classifyLetter(input: Float32Array): number[] {
  const p = letterNetwork(input).map((v, i) => (LETTER_CLASSES[i] >= '0' && LETTER_CLASSES[i] <= '9' ? v * DIGIT_PRIOR : v));
  const sum = p.reduce((s, v) => s + v, 0);
  return p.map((v) => v / sum);
}
