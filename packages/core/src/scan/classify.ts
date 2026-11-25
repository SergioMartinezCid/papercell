/** Deciding which boxes are marked, per page, with a band of doubt around the threshold. */

export interface Threshold {
  /** Fill at or above this value counts as marked. */
  value: number;
  /** Fills closer than this to the threshold are flagged for review. */
  margin: number;
  /**
   * Fills from here up to the threshold are flagged too: they stand out from the empty boxes like a
   * light mark, even on a page where most marks are much darker.
   */
  doubtFrom: number;
  /** Whether the page showed two clearly different groups (marked and empty). */
  separated: boolean;
}

/**
 * Used when every box looks alike (all empty or all marked) or no group looks like empty boxes. Empty boxes read
 * below about 0.13 even in poor photos, and nearly all marks above 0.16.
 */
const FALLBACK: Threshold = { value: 0.15, margin: 0.04, doubtFrom: 0.15, separated: false };
/** The empty boxes read at most this on average: a lower group any darker is light marks, not empty boxes. */
const EMPTY_MAX = 0.2;
/** Two groups this far apart are always told apart. */
const CLEAR_GAP = 0.2;
/**
 * Closer groups (light or small marks) are told apart when the gap is at least MIN_GAP and
 * MIN_CONTRAST times the spread of the empty group. Empty boxes on one page look very alike, so light
 * marks stand out from them, while the two halves of a page of only empty boxes never do.
 */
const MIN_GAP = 0.1;
const MIN_CONTRAST = 6;
/**
 * Where the threshold sits between the empty and the marked group. Empty boxes are consistently
 * light while hand marks vary a lot, so the threshold stays closer to the empty group.
 */
const POSITION = 0.3;
/** Lowest threshold, so specks and smudges in empty boxes stay below it. */
const LOWEST = 0.1;

export function chooseThreshold(fills: number[]): Threshold {
  // The empty boxes are the lowest group. Split the boxes in two, then the lower part again and again: the deepest
  // clear split is the one between the empty boxes and the lightest marks. On a page with most boxes marked, the
  // first split often falls between light and dark marks instead. Splits that are not clear are looked through
  // until a clear one is found, as on a page of light marks spread out, where the first split falls among them.
  let group = [...fills].sort((a, b) => a - b);
  let found: { group: number[]; split: Split } | null = null;
  for (let split = otsu(group); split; split = otsu(group)) {
    if (clear(group, split)) found = { group, split };
    else if (found) break;
    group = group.slice(0, split.k);
  }
  if (!found || found.split.m0 > EMPTY_MAX) return FALLBACK;
  const { m0, m1, k } = found.split;
  const spread = spreadOf(found.group.slice(0, k));
  const value = clamp(m0 + POSITION * (m1 - m0), LOWEST, 0.5);
  const doubtFrom = Math.max(LOWEST, m0 + MIN_CONTRAST * spread);
  return { value, margin: Math.max(0.05, 0.4 * (value - m0)), doubtFrom, separated: true };
}

interface Split {
  /** Size of the lower group. */
  k: number;
  /** Mean of the lower and the upper group. */
  m0: number;
  m1: number;
}

/** Otsu: the split of sorted values that best separates two groups. */
function otsu(s: number[]): Split | null {
  const n = s.length;
  if (n < 2) return null;
  const prefix = [0];
  for (const v of s) prefix.push(prefix[prefix.length - 1] + v);
  let best = { between: -1, k: 0, m0: 0, m1: 0 };
  for (let k = 1; k < n; k++) {
    const m0 = prefix[k] / k;
    const m1 = (prefix[n] - prefix[k]) / (n - k);
    const between = (k / n) * ((n - k) / n) * (m1 - m0) ** 2;
    if (between > best.between) best = { between, k, m0, m1 };
  }
  return best;
}

/** Whether the two groups of a split are clearly apart: far, or close but each tight (see MIN_CONTRAST). */
function clear(s: number[], split: Split): boolean {
  return split.m1 - split.m0 >= Math.min(CLEAR_GAP, Math.max(MIN_GAP, MIN_CONTRAST * spreadOf(s.slice(0, split.k))));
}

/**
 * Standard deviation of a sorted group without its darkest 5%, so that a light mark or a speck that
 * fell into the group does not widen it. Empty boxes in two shades (cell colours inside the boxes)
 * still count as spread out.
 */
function spreadOf(sorted: number[]): number {
  const kept = sorted.slice(0, Math.max(1, sorted.length - Math.round(0.05 * sorted.length)));
  const mean = kept.reduce((sum, v) => sum + v, 0) / kept.length;
  return Math.sqrt(kept.reduce((sum, v) => sum + (v - mean) ** 2, 0) / kept.length);
}

export function classify(fill: number, t: Threshold): { marked: boolean; uncertain: boolean } {
  const doubtful = Math.abs(fill - t.value) < t.margin || (fill >= t.doubtFrom && fill < t.value);
  return { marked: fill >= t.value, uncertain: doubtful };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
