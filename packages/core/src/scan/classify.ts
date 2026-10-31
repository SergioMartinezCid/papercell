/** Deciding which boxes are marked, per page, with a band of doubt around the threshold. */

export interface Threshold {
  /** Fill at or above this value counts as marked. */
  value: number;
  /** Fills closer than this to the threshold are flagged for review. */
  margin: number;
  /** Whether the page showed two clearly different groups (marked and empty). */
  separated: boolean;
}

/** Used when every box looks alike (all empty or all marked). */
const FALLBACK: Threshold = { value: 0.3, margin: 0.08, separated: false };
const MIN_GAP = 0.2;
/**
 * Where the threshold sits between the empty and the marked group. Empty boxes are consistently
 * light while hand marks vary a lot, so the threshold stays closer to the empty group.
 */
const POSITION = 0.3;

export function chooseThreshold(fills: number[]): Threshold {
  const s = [...fills].sort((a, b) => a - b);
  const n = s.length;
  if (n < 2) return FALLBACK;
  // Otsu: the split that best separates two groups.
  const prefix = [0];
  for (const v of s) prefix.push(prefix[prefix.length - 1] + v);
  let best = { between: -1, m0: 0, m1: 0 };
  for (let k = 1; k < n; k++) {
    const m0 = prefix[k] / k;
    const m1 = (prefix[n] - prefix[k]) / (n - k);
    const between = (k / n) * ((n - k) / n) * (m1 - m0) ** 2;
    if (between > best.between) best = { between, m0, m1 };
  }
  if (best.m1 - best.m0 < MIN_GAP) return FALLBACK;
  const value = clamp(best.m0 + POSITION * (best.m1 - best.m0), 0.15, 0.5);
  return { value, margin: Math.max(0.05, 0.4 * (value - best.m0)), separated: true };
}

export function classify(fill: number, t: Threshold): { marked: boolean; uncertain: boolean } {
  return { marked: fill >= t.value, uncertain: Math.abs(fill - t.value) < t.margin };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
