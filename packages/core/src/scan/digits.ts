/**
 * Reading handwritten digits: a crop of a digit box is normalized like the MNIST digits the network was
 * trained on (see scripts/train_digits.py, whose `normalize` this mirrors), then classified by a small
 * convolutional network.
 */
import { DIGIT_MODEL } from './digitModel';

const SIZE = 28;
const FIT = 20;
/** Share of the darkest ink that counts as part of the digit when finding its extent. */
const INK_LEVEL = 0.3;

/**
 * Turns a crop of a box (`ink`, row by row, 1 = ink) into the 28×28 network input: the digit scaled to fit a
 * 20×20 square, centred by mass. An empty crop gives all zeros.
 */
export function normalizeDigit(ink: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(SIZE * SIZE);
  const bg = median(ink);
  let peak = 0;
  for (const v of ink) peak = Math.max(peak, v - bg);
  if (peak <= 1e-6) return out;
  const v = ink.map((x) => Math.min(1, Math.max(0, (x - bg) / peak)));
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (v[y * width + x] <= INK_LEVEL) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return out;
  const h = y1 - y0 + 1;
  const w = x1 - x0 + 1;
  const s = FIT / Math.max(h, w);
  const oh = Math.max(1, Math.floor(h * s + 0.5));
  const ow = Math.max(1, Math.floor(w * s + 0.5));
  const ry = resampleMatrix(h, oh);
  const rx = resampleMatrix(w, ow);
  // small = ry · crop · rxᵀ
  const tmp = new Float64Array(oh * w);
  for (let o = 0; o < oh; o++) {
    for (const [i, wt] of ry[o]) {
      for (let x = 0; x < w; x++) tmp[o * w + x] += wt * v[(y0 + i) * width + x0 + x];
    }
  }
  const small = new Float64Array(oh * ow);
  for (let y = 0; y < oh; y++) {
    for (let o = 0; o < ow; o++) {
      let sum = 0;
      for (const [i, wt] of rx[o]) sum += wt * tmp[y * w + i];
      small[y * ow + o] = sum;
    }
  }
  let total = 0;
  let cy = 0;
  let cx = 0;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const m = small[y * ow + x];
      total += m;
      cy += m * y;
      cx += m * x;
    }
  }
  cy /= total;
  cx /= total;
  const top = Math.min(Math.max(Math.floor(SIZE / 2 - cy), 0), SIZE - oh);
  const left = Math.min(Math.max(Math.floor(SIZE / 2 - cx), 0), SIZE - ow);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) out[(top + y) * SIZE + left + x] = small[y * ow + x];
  }
  return out;
}

/** For each output pixel, the input pixels and their weights: area average when shrinking, linear when growing. */
function resampleMatrix(nIn: number, nOut: number): Array<Array<[number, number]>> {
  const scale = nIn / nOut;
  return Array.from({ length: nOut }, (_, o) => {
    if (scale >= 1) {
      const a = o * scale;
      const b = (o + 1) * scale;
      const row: Array<[number, number]> = [];
      for (let i = Math.floor(a); i < Math.min(nIn, Math.ceil(b)); i++) row.push([i, Math.min(b, i + 1) - Math.max(a, i)]);
      const sum = row.reduce((s, [, wt]) => s + wt, 0);
      return row.map(([i, wt]) => [i, wt / sum] as [number, number]);
    }
    const x = (o + 0.5) * scale - 0.5;
    const i0 = Math.floor(x);
    const t = x - i0;
    const clamp = (i: number) => Math.min(Math.max(i, 0), nIn - 1);
    return [
      [clamp(i0), 1 - t],
      [clamp(i0 + 1), t],
    ];
  });
}

function median(values: Float32Array): number {
  const s = Float32Array.from(values).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Layer {
  shape: number[];
  weights: Float32Array;
  bias: Float32Array;
}

let network: Layer[] | null = null;

function layers(): Layer[] {
  if (network) return network;
  network = [DIGIT_MODEL.conv1, DIGIT_MODEL.conv2, DIGIT_MODEL.dense1, DIGIT_MODEL.dense2].map((l) => {
    const q = new Int8Array(bytes(l.weights).buffer);
    const scales = new Float32Array(bytes(l.scales).buffer);
    const per = q.length / l.shape[0];
    const weights = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) weights[i] = q[i] * scales[Math.floor(i / per)];
    return { shape: l.shape, weights, bias: new Float32Array(bytes(l.bias).buffer) };
  });
  return network;
}

function bytes(base64: string): Uint8Array {
  const text = atob(base64);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

/** Valid convolution with ReLU: input `c` × `h` × `w`, weights `f` × `c` × `k` × `k`. */
function conv(input: Float32Array, c: number, h: number, w: number, layer: Layer): { out: Float32Array; h: number; w: number } {
  const [f, , k] = layer.shape;
  const oh = h - k + 1;
  const ow = w - k + 1;
  const out = new Float32Array(f * oh * ow);
  for (let o = 0; o < f; o++) {
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        let sum = layer.bias[o];
        for (let ch = 0; ch < c; ch++) {
          for (let i = 0; i < k; i++) {
            const row = (ch * h + y + i) * w + x;
            const wrow = ((o * c + ch) * k + i) * k;
            for (let j = 0; j < k; j++) sum += layer.weights[wrow + j] * input[row + j];
          }
        }
        out[(o * oh + y) * ow + x] = Math.max(0, sum);
      }
    }
  }
  return { out, h: oh, w: ow };
}

function pool(input: Float32Array, c: number, h: number, w: number): { out: Float32Array; h: number; w: number } {
  const oh = h >> 1;
  const ow = w >> 1;
  const out = new Float32Array(c * oh * ow);
  for (let ch = 0; ch < c; ch++) {
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const i = (ch * h + 2 * y) * w + 2 * x;
        out[(ch * oh + y) * ow + x] = Math.max(input[i], input[i + 1], input[i + w], input[i + w + 1]);
      }
    }
  }
  return { out, h: oh, w: ow };
}

function dense(input: Float32Array, layer: Layer, relu: boolean): Float32Array {
  const [n, m] = layer.shape;
  const out = new Float32Array(n);
  for (let o = 0; o < n; o++) {
    let sum = layer.bias[o];
    for (let i = 0; i < m; i++) sum += layer.weights[o * m + i] * input[i];
    out[o] = relu ? Math.max(0, sum) : sum;
  }
  return out;
}

/** Probabilities of the digits 0–9 for a normalized 28×28 input. */
export function classifyDigit(input: Float32Array): number[] {
  const [c1, c2, d1, d2] = layers();
  let a = conv(input, 1, SIZE, SIZE, c1);
  a = pool(a.out, c1.shape[0], a.h, a.w);
  a = conv(a.out, c1.shape[0], a.h, a.w, c2);
  a = pool(a.out, c2.shape[0], a.h, a.w);
  const logits = dense(dense(a.out, d1, true), d2, false);
  const max = Math.max(...logits);
  const exp = Array.from(logits, (z) => Math.exp(z - max));
  const sum = exp.reduce((s, e) => s + e, 0);
  return exp.map((e) => e / sum);
}
