#!/usr/bin/env python3
"""Trains the handwritten digit reader and writes it to src/scan/digitModel.ts.

Only needed to change the model; the app uses the generated file. Needs Python 3 with numpy and scipy:

    python3 scripts/train_digits.py [--epochs 12] [--seed 1]

Training data: the MNIST database of handwritten digits (Y. LeCun, C. Cortes, C. J. C. Burges), CC BY-SA 3.0,
downloaded once to ~/.cache/papercell/mnist. Digits are distorted while training (slant, size, stroke
width, resolution, blur, ink and noise) so that the model copes with digits read from phone photos, and
some 7s get a bar and some 1s a flag, as many people write them (MNIST has few). For more variety of styles,
a quarter of the training digits are drawn with pen strokes from test/sim/glyphs.json.

`normalize` must stay identical to `normalizeDigit` in src/scan/digits.ts: it turns a crop of a written
box into the 28x28 input of the network.
"""
import argparse
import base64
import gzip
import json
import os
import sys
import time
import urllib.request

import numpy as np
from scipy import ndimage

MNIST_URL = 'https://ossci-datasets.s3.amazonaws.com/mnist/'
CACHE = os.path.expanduser('~/.cache/papercell/mnist')
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'scan', 'digitModel.ts')
GLYPHS = os.path.join(os.path.dirname(__file__), '..', 'test', 'sim', 'glyphs.json')
STROKE_SHARE = 0.25

SIZE = 28
FIT = 20
INK_LEVEL = 0.3


# ---------------------------------------------------------------- data

def load(name):
    path = os.path.join(CACHE, name + '.gz')
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        urllib.request.urlretrieve(MNIST_URL + name + '.gz', path)
    with gzip.open(path, 'rb') as f:
        data = f.read()
    if 'labels' in name:
        return np.frombuffer(data, np.uint8, offset=8).astype(np.int64)
    return np.frombuffer(data, np.uint8, offset=16).reshape(-1, 28, 28).astype(np.float32) / 255


# ---------------------------------------------------------------- normalization (mirrors digits.ts)

def resample_matrix(n_in, n_out):
    """Rows: output pixels; columns: weights of input pixels. Area average when shrinking, linear when growing."""
    m = np.zeros((n_out, n_in), np.float32)
    scale = n_in / n_out
    if scale >= 1:
        for o in range(n_out):
            a, b = o * scale, (o + 1) * scale
            for i in range(int(np.floor(a)), min(n_in, int(np.ceil(b)))):
                m[o, i] = min(b, i + 1) - max(a, i)
            m[o] /= m[o].sum()
    else:
        for o in range(n_out):
            x = (o + 0.5) * scale - 0.5
            i0 = int(np.floor(x))
            t = x - i0
            for i, w in ((i0, 1 - t), (i0 + 1, t)):
                m[o, min(max(i, 0), n_in - 1)] += w
    return m


def normalize(ink):
    """Crop of a box (2D, 1 = ink) → 28x28 network input, like MNIST: the digit fits a 20x20 square, centred by mass."""
    v = ink - np.median(ink)
    peak = v.max()
    out = np.zeros((SIZE, SIZE), np.float32)
    if peak <= 1e-6:
        return out
    v = np.clip(v / peak, 0, 1)
    ys, xs = np.nonzero(v > INK_LEVEL)
    if len(ys) == 0:
        return out
    crop = v[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape
    s = FIT / max(h, w)
    oh, ow = max(1, int(np.floor(h * s + 0.5))), max(1, int(np.floor(w * s + 0.5)))
    small = resample_matrix(h, oh) @ crop @ resample_matrix(w, ow).T
    total = small.sum()
    cy = (small.sum(axis=1) * np.arange(oh)).sum() / total
    cx = (small.sum(axis=0) * np.arange(ow)).sum() / total
    top = int(np.floor(SIZE / 2 - 0.5 - cy + 0.5))
    left = int(np.floor(SIZE / 2 - 0.5 - cx + 0.5))
    top = min(max(top, 0), SIZE - oh)
    left = min(max(left, 0), SIZE - ow)
    out[top:top + oh, left:left + ow] = small
    return out


# ---------------------------------------------------------------- augmentation

def draw_line(img, a, b, pen):
    """Anti-aliased line from a to b ((x, y) in pixels), `pen` pixels wide, drawn over img."""
    ys, xs = np.mgrid[0:img.shape[0], 0:img.shape[1]]
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    t = np.clip(((xs - ax) * dx + (ys - ay) * dy) / max(dx * dx + dy * dy, 1e-9), 0, 1)
    dist = np.hypot(xs - (ax + t * dx), ys - (ay + t * dy))
    np.maximum(img, np.clip(pen / 2 + 0.5 - dist, 0, 1), out=img)


def european(img, label, rng):
    """Adds the bar of a 7 or the flag of a 1 to some of them."""
    if label not in (1, 7) or rng.random() > 0.45:
        return img
    ys, xs = np.nonzero(img > 0.3)
    if len(ys) == 0:
        return img
    out = img.copy()
    top, h = ys.min(), ys.max() - ys.min() + 1
    pen = rng.uniform(1.3, 2.3)
    if label == 7:
        y = int(top + rng.uniform(0.45, 0.6) * h)
        row = np.nonzero(img[y] > 0.3)[0]
        if len(row) == 0:
            return img
        half = rng.uniform(0.18, 0.3) * h
        cx = row.mean() + rng.uniform(-0.05, 0.05) * h
        draw_line(out, (cx - half, y + rng.uniform(-1, 1)), (cx + half, y + rng.uniform(-1, 1)), pen)
    else:
        tx = np.nonzero(img[top] > 0.3)[0].mean()
        # Short and steep: a long, flat flag would make it a 7.
        length = rng.uniform(0.18, 0.35) * h
        angle = np.radians(rng.uniform(30, 60))
        draw_line(out, (tx, top), (tx - length * np.cos(angle), top + length * np.sin(angle)), pen)
    return out


def smooth(points):
    """Catmull-Rom curve through the points (as in test/sim/handwriting.ts)."""
    if len(points) < 3:
        return points
    out = []
    for i in range(len(points) - 1):
        p0, p1, p2, p3 = points[max(0, i - 1)], points[i], points[i + 1], points[min(len(points) - 1, i + 2)]
        for s in range(8):
            t = s / 8
            out.append(tuple(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(points[-1])
    return out


def stroke_digit(glyphs, digit, rng, size=56):
    """A digit drawn with pen strokes in one of its styles, as a 28x28 MNIST-like image."""
    strokes = glyphs[digit][rng.integers(len(glyphs[digit]))]
    h = size * rng.uniform(0.55, 0.8)
    w = h * rng.uniform(0.5, 0.75)
    slant = rng.uniform(-0.1, 0.35)
    wobble = rng.uniform(0.01, 0.04)
    pen = h * rng.uniform(0.07, 0.13)
    img = np.zeros((size, size), np.float32)
    for stroke in strokes:
        points = []
        for u, v in stroke:
            u += wobble * rng.normal()
            v += wobble * rng.normal()
            points.append((size / 2 + (u - 0.5) * w + slant * (0.5 - v) * h, size / 2 + (v - 0.5) * h))
        points = smooth(points)
        for a, b in zip(points, points[1:]):
            draw_line(img, a, b, pen)
    return normalize(img)


def stroke_pool(count, rng):
    with open(GLYPHS) as f:
        glyphs = json.load(f)['digits']
    labels = rng.integers(0, 10, count)
    return np.stack([stroke_digit(glyphs, d, rng) for d in labels]), labels


def augment(img, rng, label=None):
    img = european(img, label, rng)
    big = ndimage.zoom(img, 2, order=1)
    n = 72
    canvas = np.zeros((n, n), np.float32)
    o = (n - big.shape[0]) // 2
    canvas[o:o + big.shape[0], o:o + big.shape[1]] = big
    angle = np.radians(rng.uniform(-12, 12))
    shear = rng.uniform(-0.35, 0.35)
    sx, sy = rng.uniform(0.7, 1.15), rng.uniform(0.85, 1.1)
    rot = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    forward = rot @ np.array([[1, 0], [shear, 1]]) @ np.diag([sy, sx])
    inverse = np.linalg.inv(forward)
    c = np.array([n / 2, n / 2])
    shift = rng.uniform(-3, 3, 2)
    warped = ndimage.affine_transform(canvas, inverse, offset=c - inverse @ (c + shift), order=1)
    r = rng.random()
    if r < 0.25:
        warped = ndimage.grey_erosion(warped, size=(2, 2))
    elif r < 0.55:
        warped = ndimage.grey_dilation(warped, size=(2, 2) if r < 0.45 else (3, 3))
    ys, xs = np.nonzero(warped > 0.3)
    if len(ys) == 0:
        return normalize(warped)
    # Seen at a photo's resolution: the digit ends up 12–36 px tall.
    height = ys.max() - ys.min() + 1
    f = rng.uniform(12, 36) / height
    low = ndimage.zoom(warped, f, order=1)
    low = ndimage.gaussian_filter(low, rng.uniform(0.2, 0.9))
    ink = np.clip(low, 0, 1) * rng.uniform(0.45, 1.0) + rng.uniform(0, 0.08)
    ink += rng.normal(0, rng.uniform(0, 0.04), ink.shape)
    if rng.random() < 0.05:
        y, x = rng.integers(0, ink.shape[0]), rng.integers(0, ink.shape[1])
        ink[y:y + 2, x:x + 2] += rng.uniform(0.3, 0.8)
    return normalize(np.clip(ink, 0, 1).astype(np.float32))


# ---------------------------------------------------------------- network

def im2col(x, k):
    n, c, h, w = x.shape
    win = np.lib.stride_tricks.sliding_window_view(x, (k, k), axis=(2, 3))
    return win.transpose(0, 2, 3, 1, 4, 5).reshape(n * (h - k + 1) * (w - k + 1), c * k * k)


class Conv:
    def __init__(self, cin, cout, k, rng):
        self.k = k
        self.w = (rng.normal(0, np.sqrt(2 / (cin * k * k)), (cout, cin, k, k))).astype(np.float32)
        self.b = np.zeros(cout, np.float32)

    def forward(self, x):
        n, c, h, w = x.shape
        k = self.k
        self.shape = x.shape
        self.cols = im2col(x, k)
        out = self.cols @ self.w.reshape(len(self.b), -1).T + self.b
        return out.reshape(n, h - k + 1, w - k + 1, -1).transpose(0, 3, 1, 2)

    def backward(self, d):
        n, c, h, w = self.shape
        k = self.k
        f = len(self.b)
        dflat = d.transpose(0, 2, 3, 1).reshape(-1, f)
        self.dw = (dflat.T @ self.cols).reshape(self.w.shape)
        self.db = dflat.sum(0)
        dcols = (dflat @ self.w.reshape(f, -1)).reshape(n, h - k + 1, w - k + 1, c, k, k)
        dx = np.zeros(self.shape, np.float32)
        for i in range(k):
            for j in range(k):
                dx[:, :, i:i + h - k + 1, j:j + w - k + 1] += dcols[:, :, :, :, i, j].transpose(0, 3, 1, 2)
        return dx

    def params(self):
        return [(self.w, 'dw'), (self.b, 'db')]


class Dense:
    def __init__(self, nin, nout, rng):
        self.w = rng.normal(0, np.sqrt(2 / nin), (nout, nin)).astype(np.float32)
        self.b = np.zeros(nout, np.float32)

    def forward(self, x):
        self.x = x
        return x @ self.w.T + self.b

    def backward(self, d):
        self.dw = d.T @ self.x
        self.db = d.sum(0)
        return d @ self.w

    def params(self):
        return [(self.w, 'dw'), (self.b, 'db')]


def relu(x):
    return np.maximum(x, 0)


def pool(x):
    n, c, h, w = x.shape
    h2, w2 = h // 2, w // 2
    x = x[:, :, :h2 * 2, :w2 * 2].reshape(n, c, h2, 2, w2, 2)
    out = x.max(axis=(3, 5))
    mask = x == out[:, :, :, None, :, None]
    return out, mask


def unpool(d, mask, shape):
    n, c, h2, _, w2, _ = mask.shape
    dx = np.zeros(shape, np.float32)
    dx[:, :, :h2 * 2, :w2 * 2] = (mask * d[:, :, :, None, :, None]).reshape(n, c, h2 * 2, w2 * 2)
    return dx


class Net:
    """conv 5x5 (16) → relu → pool → conv 3x3 (32) → relu → pool → dense 64 → relu → dense 10."""

    def __init__(self, rng):
        self.c1 = Conv(1, 16, 5, rng)
        self.c2 = Conv(16, 32, 3, rng)
        self.d1 = Dense(32 * 5 * 5, 64, rng)
        self.d2 = Dense(64, 10, rng)
        self.layers = [self.c1, self.c2, self.d1, self.d2]

    def forward(self, x, train=False, rng=None):
        a1 = relu(self.c1.forward(x[:, None]))
        self.a1 = a1
        p1, self.m1 = pool(a1)
        a2 = relu(self.c2.forward(p1))
        self.a2 = a2
        p2, self.m2 = pool(a2)
        self.p2shape = p2.shape
        h = relu(self.d1.forward(p2.reshape(len(x), -1)))
        if train:
            self.drop = (rng.random(h.shape) > 0.3).astype(np.float32) / 0.7
            h = h * self.drop
        self.h = h
        return self.d2.forward(h)

    def backward(self, d):
        d = self.d2.backward(d)
        d = d * self.drop * (self.h > 0)
        d = self.d1.backward(d).reshape(self.p2shape)
        d = unpool(d, self.m2, self.a2.shape) * (self.a2 > 0)
        d = self.c2.backward(d)
        d = unpool(d, self.m1, self.a1.shape) * (self.a1 > 0)
        self.c1.backward(d)


def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


# ---------------------------------------------------------------- export

def quantize(w):
    """Per output channel int8 with a float scale."""
    flat = w.reshape(w.shape[0], -1)
    scale = np.abs(flat).max(1) / 127
    scale[scale == 0] = 1
    q = np.round(flat / scale[:, None]).astype(np.int8)
    return q, scale.astype(np.float32)


def export(net, path, note):
    parts = []
    for name, layer in (('conv1', net.c1), ('conv2', net.c2), ('dense1', net.d1), ('dense2', net.d2)):
        q, scale = quantize(layer.w)
        parts.append(f"  {name}: {{ shape: {list(layer.w.shape)}, weights: '{base64.b64encode(q.tobytes()).decode()}', "
                     f"scales: '{base64.b64encode(scale.tobytes()).decode()}', bias: '{base64.b64encode(layer.b.astype(np.float32).tobytes()).decode()}' }},")
    body = '\n'.join(parts)
    with open(path, 'w') as f:
        f.write(f"""/**
 * Weights of the handwritten digit reader (see digits.ts), generated by scripts/train_digits.py: do not edit.
 * {note}
 * Trained on the MNIST database (Y. LeCun, C. Cortes, C. J. C. Burges), CC BY-SA 3.0.
 * Weights are int8 per output channel (base64), with float32 scales and biases (base64, little-endian).
 */
export const DIGIT_MODEL = {{
{body}
}};
""")


def dequantized(net):
    """Copy of the network with the int8 weights it is exported with, to measure what the app will get."""
    for layer in net.layers:
        q, scale = quantize(layer.w)
        layer.w = (q.astype(np.float32) * scale[:, None]).reshape(layer.w.shape)
    return net


def evaluate(net, x, y):
    correct = 0
    for i in range(0, len(x), 500):
        correct += (net.forward(x[i:i + 500]).argmax(1) == y[i:i + 500]).sum()
    return correct / len(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--epochs', type=int, default=12)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)

    train_x, train_y = load('train-images-idx3-ubyte'), load('train-labels-idx1-ubyte')
    test_x, test_y = load('t10k-images-idx3-ubyte'), load('t10k-labels-idx1-ubyte')
    test_plain = np.stack([normalize(img) for img in test_x])
    test_aug = np.stack([augment(img, np.random.default_rng(1000 + i), test_y[i]) for i, img in enumerate(test_x)])
    pool_x, pool_y = stroke_pool(20000, rng)
    stroke_test_x, stroke_test_y = stroke_pool(2000, np.random.default_rng(args.seed + 1000))
    stroke_test = np.stack([augment(img, np.random.default_rng(2000 + i)) for i, img in enumerate(stroke_test_x)])

    net = Net(rng)
    adam = {id(p): (np.zeros_like(p), np.zeros_like(p)) for layer in net.layers for p, _ in layer.params()}
    step = 0
    batch = 128
    for epoch in range(args.epochs):
        started = time.time()
        lr = 1e-3 * (0.5 ** (epoch // 4))
        order = rng.permutation(len(train_x))
        loss_sum = 0.0
        for i in range(0, len(order), batch):
            idx = order[i:i + batch]
            images, labels = [], []
            for j in idx:
                if rng.random() < STROKE_SHARE:
                    k = rng.integers(len(pool_x))
                    images.append(augment(pool_x[k], rng))
                    labels.append(pool_y[k])
                else:
                    images.append(augment(train_x[j], rng, train_y[j]) if rng.random() < 0.85 else normalize(train_x[j]))
                    labels.append(train_y[j])
            x = np.stack(images)
            y = np.array(labels)
            p = softmax(net.forward(x, train=True, rng=rng))
            loss_sum += -np.log(p[np.arange(len(y)), y] + 1e-9).sum()
            d = p
            d[np.arange(len(y)), y] -= 1
            net.backward((d / len(y)).astype(np.float32))
            step += 1
            for layer in net.layers:
                for param, grad_name in layer.params():
                    g = getattr(layer, grad_name)
                    m, v = adam[id(param)]
                    m *= 0.9
                    m += 0.1 * g
                    v *= 0.999
                    v += 0.001 * g * g
                    param -= (lr * (m / (1 - 0.9 ** step)) / (np.sqrt(v / (1 - 0.999 ** step)) + 1e-8)).astype(np.float32)
        print(f'epoch {epoch + 1}: loss {loss_sum / len(order):.4f}, test {evaluate(net, test_plain, test_y):.4f}, '
              f'distorted test {evaluate(net, test_aug, test_y):.4f}, strokes {evaluate(net, stroke_test, stroke_test_y):.4f} '
              f'({time.time() - started:.0f} s)', flush=True)

    dequantized(net)
    plain, distorted = evaluate(net, test_plain, test_y), evaluate(net, test_aug, test_y)
    print(f'int8: test {plain:.4f}, distorted test {distorted:.4f}')
    export(net, args.out, f'MNIST test accuracy {plain:.2%}, {distorted:.2%} with photo-like distortions.')


if __name__ == '__main__':
    sys.exit(main())
