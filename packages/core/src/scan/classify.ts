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

/** Used when every box looks alike (all empty or all marked). */
const FALLBACK: Threshold = { value: 0.3, margin: 0.08, doubtFrom: 0.3, separated: false };
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
  const s = [...fills].sort((a, b) => a - b);
  const n = s.length;
  if (n < 2) return FALLBACK;
  // Otsu: the split that best separates two groups.
  const prefix = [0];
  for (const v of s) prefix.push(prefix[prefix.length - 1] + v);
  let best = { between: -1, k: 0, m0: 0, m1: 0 };
  for (let k = 1; k < n; k++) {
    const m0 = prefix[k] / k;
    const m1 = (prefix[n] - prefix[k]) / (n - k);
    const between = (k / n) * ((n - k) / n) * (m1 - m0) ** 2;
    if (between > best.between) best = { between, k, m0, m1 };
  }
  const gap = best.m1 - best.m0;
  const spread = spreadOf(s.slice(0, best.k));
  if (gap < Math.min(CLEAR_GAP, Math.max(MIN_GAP, MIN_CONTRAST * spread))) return FALLBACK;
  const value = clamp(best.m0 + POSITION * gap, LOWEST, 0.5);
  const doubtFrom = Math.max(LOWEST, best.m0 + MIN_CONTRAST * spread);
  return { value, margin: Math.max(0.05, 0.4 * (value - best.m0)), doubtFrom, separated: true };
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
