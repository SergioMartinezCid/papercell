/** Planar homographies: 3×3 matrices stored row by row. */
import type { Point } from './image';

export type Homography = number[];

export function applyHomography(h: Homography, x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

export function multiply(a: Homography, b: Homography): Homography {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function invert(h: Homography): Homography {
  const [a, b, c, d, e, f, g, i, j] = h;
  const A = e * j - f * i;
  const B = -(d * j - f * g);
  const C = d * i - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Singular homography');
  return [
    A / det,
    -(b * j - c * i) / det,
    (b * f - c * e) / det,
    B / det,
    (a * j - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * i - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function scaling(sx: number, sy = sx): Homography {
  return [sx, 0, 0, 0, sy, 0, 0, 0, 1];
}

/**
 * Least-squares homography mapping `from[i]` to `to[i]` (at least 4 pairs), using normalised
 * direct linear transformation with h33 = 1.
 */
export function solveHomography(from: Point[], to: Point[]): Homography {
  if (from.length < 4 || from.length !== to.length) throw new Error('Need at least 4 point pairs');
  const tFrom = normalisation(from);
  const tTo = normalisation(to);
  const a = from.map((p) => applyHomography(tFrom, p.x, p.y));
  const b = to.map((p) => applyHomography(tTo, p.x, p.y));

  // Normal equations (MᵀM) h = Mᵀv for the 8 unknowns.
  const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atv = new Array<number>(8).fill(0);
  const addRow = (row: number[], v: number) => {
    for (let r = 0; r < 8; r++) {
      atv[r] += row[r] * v;
      for (let c = 0; c < 8; c++) ata[r][c] += row[r] * row[c];
    }
  };
  for (let k = 0; k < a.length; k++) {
    const { x, y } = a[k];
    const { x: u, y: v } = b[k];
    addRow([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    addRow([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solveLinear(ata, atv);
  const hn = [...h, 1];
  return normalise(multiply(invert(tTo), multiply(hn, tFrom)));
}

function normalise(h: Homography): Homography {
  return h.map((v) => v / h[8]);
}

/** Similarity moving the centroid to the origin and the mean distance to √2. */
function normalisation(points: Point[]): Homography {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const mean = points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length || 1;
  const s = Math.SQRT2 / mean;
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
}

/** Gaussian elimination with partial pivoting. */
function solveLinear(m: number[][], v: number[]): number[] {
  const n = v.length;
  const a = m.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('Degenerate point configuration');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}
