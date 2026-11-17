/**
 * The small convolutional network that reads one handwritten character from its normalized 28×28 image (see
 * `normalizeDigit`): conv 5×5 → ReLU → max pool → conv 3×3 → ReLU → max pool → dense → ReLU → dense → softmax.
 * Its weights come from the training scripts (scripts/train_digits.py, scripts/train_letters.py).
 */

const SIZE = 28;

export interface ModelLayer {
  shape: number[];
  /** int8 weights, base64. */
  weights: string;
  /** float32 scale of each output channel, base64 little-endian. */
  scales: string;
  /** float32 biases, base64 little-endian. */
  bias: string;
}

export interface Model {
  conv1: ModelLayer;
  conv2: ModelLayer;
  dense1: ModelLayer;
  dense2: ModelLayer;
}

/** A function giving the probability of each class for a normalized input; the weights are unpacked on first use. */
export function classifier(model: Model): (input: Float32Array) => number[] {
  let network: Layer[] | null = null;
  return (input) => {
    network ??= [model.conv1, model.conv2, model.dense1, model.dense2].map(unpack);
    return classify(network, input);
  };
}

interface Layer {
  shape: number[];
  weights: Float32Array;
  bias: Float32Array;
}

function unpack(l: ModelLayer): Layer {
  const q = new Int8Array(bytes(l.weights).buffer);
  const scales = new Float32Array(bytes(l.scales).buffer);
  const per = q.length / l.shape[0];
  const weights = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) weights[i] = q[i] * scales[Math.floor(i / per)];
  return { shape: l.shape, weights, bias: new Float32Array(bytes(l.bias).buffer) };
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

function classify([c1, c2, d1, d2]: Layer[], input: Float32Array): number[] {
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
