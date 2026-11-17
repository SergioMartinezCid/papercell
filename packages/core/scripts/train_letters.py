#!/usr/bin/env python3
"""Trains the handwritten letter reader and writes it to src/scan/letterModel.ts.

Only needed to change the model; the app uses the generated file. Needs Python 3 with numpy and scipy:

    python3 scripts/train_letters.py [--epochs 15] [--seed 1]

It reads one capital letter or digit per box: 0-9, A-Z and Ñ (see CLASSES). Training data: the capital
letters and digits of EMNIST (G. Cohen, S. Afshar, J. Tapson, A. van Schaik, "EMNIST: an extension of MNIST
to handwritten letters", 2017), from NIST Special Database 19, downloaded once to ~/.cache/papercell/emnist.
EMNIST has no Ñ and no accents: Ñ is made by writing a tilde over its Ns, and some vowels get an accent so
that accented capitals read as their plain letter. Characters are distorted while training like the digits
(see train_digits.py, which this shares its normalization, network and export with), and a fifth of them are
drawn with pen strokes from test/sim/glyphs.json.
"""
import argparse
import gzip
import json
import os
import sys
import time
import urllib.request
import zipfile

import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_digits import (GLYPHS, Net, Trainer, augment, dequantized, draw_line, evaluate, export_model, normalize,  # noqa: E402
                          smooth)

EMNIST_URL = 'https://biometrics.nist.gov/cs_links/EMNIST/gzip.zip'
CACHE = os.path.expanduser('~/.cache/papercell/emnist')
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'scan', 'letterModel.ts')
CLASSES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZÑ'
N_TILDE = CLASSES.index('Ñ')
VOWELS = [CLASSES.index(v) for v in 'AEIOU']
STROKE_SHARE = 0.2
ACCENT_SHARE = 0.15
PER_EPOCH = 100_000


# ---------------------------------------------------------------- data

def load(part):
    """EMNIST ByClass digits and capitals (`part` is train or test), upright, with labels in CLASSES order."""
    names = [f'emnist-byclass-{part}-{kind}-idx{n}-ubyte.gz' for kind, n in (('images', 3), ('labels', 1))]
    if not all(os.path.exists(os.path.join(CACHE, name)) for name in names):
        os.makedirs(CACHE, exist_ok=True)
        archive = os.path.join(CACHE, 'gzip.zip')
        if not os.path.exists(archive):
            urllib.request.urlretrieve(EMNIST_URL, archive)
        with zipfile.ZipFile(archive) as z:
            for name in names:
                with open(os.path.join(CACHE, name), 'wb') as f:
                    f.write(z.read('gzip/' + name))
    with gzip.open(os.path.join(CACHE, names[0]), 'rb') as f:
        images = np.frombuffer(f.read(), np.uint8, offset=16).reshape(-1, 28, 28)
    with gzip.open(os.path.join(CACHE, names[1]), 'rb') as f:
        labels = np.frombuffer(f.read(), np.uint8, offset=8).astype(np.int64)
    # ByClass: 0-9 digits, 10-35 capitals, 36-61 small letters (left out). Images are stored transposed.
    keep = labels < 36
    return images[keep].transpose(0, 2, 1).astype(np.float32) / 255, labels[keep]


# ---------------------------------------------------------------- marks over letters

def pen_width(img):
    """Typical stroke width of a character image, in pixels."""
    inside = ndimage.distance_transform_edt(img > 0.4)
    return max(1.2, 2 * np.percentile(inside[inside > 0], 90)) if inside.any() else 1.5


def with_mark(img, mark, rng):
    """The character with a tilde (`tilde`) or an acute accent (`acute`) written above it, normalized."""
    ys, xs = np.nonzero(img > 0.3)
    if len(ys) == 0:
        return normalize(img)
    char = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = char.shape
    gap = h * rng.uniform(0.25, 0.5)
    pad = 4
    canvas = np.zeros((int(h + gap) + 2 * pad, w + 2 * pad), np.float32)
    canvas[-pad - h:-pad, pad:pad + w] = char
    pen = pen_width(char) * rng.uniform(0.7, 1.1)
    cx = pad + w / 2 + rng.uniform(-0.1, 0.1) * w
    cy = pad + gap * rng.uniform(0.35, 0.55)
    if mark == 'tilde':
        half = w * rng.uniform(0.3, 0.48)
        amp = gap * rng.uniform(0.08, 0.3)
        tilt = rng.uniform(-0.15, 0.15) * half
        points = [(cx - half, cy + amp * 0.6 + tilt), (cx - half / 2, cy - amp), (cx, cy), (cx + half / 2, cy + amp),
                  (cx + half, cy - amp * 0.6 - tilt)]
        points = smooth([(x + rng.normal(0, 0.03 * half), y + rng.normal(0, 0.05 * gap)) for x, y in points])
    else:
        length = gap * rng.uniform(0.45, 0.8)
        angle = np.radians(rng.uniform(25, 70))
        points = [(cx - length / 2 * np.cos(angle), cy + length / 2 * np.sin(angle)),
                  (cx + length / 2 * np.cos(angle), cy - length / 2 * np.sin(angle))]
    for a, b in zip(points, points[1:]):
        draw_line(canvas, a, b, pen)
    return normalize(canvas)


# ---------------------------------------------------------------- pen strokes

def stroke_char(strokes, rng, letter, size=56):
    """A character drawn with pen strokes (in a unit box), as a normalized image."""
    h = size * rng.uniform(0.55, 0.8)
    w = h * (rng.uniform(0.6, 0.95) if letter else rng.uniform(0.5, 0.75))
    slant = rng.uniform(-0.1, 0.3)
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
        glyphs = json.load(f)
    styles = [glyphs['digits'][int(c)] if c.isdigit() else glyphs['letters'][c] for c in CLASSES]
    labels = rng.integers(0, len(CLASSES), count)
    images = [stroke_char(styles[c][rng.integers(len(styles[c]))], rng, not CLASSES[c].isdigit()) for c in labels]
    return np.stack(images), labels


# ---------------------------------------------------------------- sampling

class Sampler:
    """Training characters with every class equally likely: EMNIST ones (an N with a tilde for Ñ, some vowels
    with an accent), distorted most of the time, or pen-stroke ones."""

    def __init__(self, x, y, strokes, rng):
        self.x = x
        self.by_class = [np.nonzero(y == c)[0] for c in range(36)]
        self.strokes = strokes
        self.rng = rng

    def one(self, label):
        rng = self.rng
        if rng.random() < STROKE_SHARE:
            sx, sy = self.strokes
            k = rng.choice(np.nonzero(sy == label)[0])
            return augment(sx[k], rng), label
        source = self.by_class[CLASSES.index('N') if label == N_TILDE else label]
        img = self.x[source[rng.integers(len(source))]]
        if label == N_TILDE:
            img = with_mark(img, 'tilde', rng)
        elif label in VOWELS and rng.random() < ACCENT_SHARE:
            img = with_mark(img, 'acute', rng)
        else:
            img = normalize(img)
        return (augment(img, rng, label) if rng.random() < 0.85 else img), label

    def batch(self, n):
        labels = self.rng.integers(0, len(CLASSES), n)
        images, ys = zip(*(self.one(c) for c in labels))
        return np.stack(images), np.array(ys)


def test_set(x, y, per_class, rng, distort):
    """Up to `per_class` EMNIST test characters per class (Ñ from Ns), plain or distorted."""
    images, labels = [], []
    for c in range(len(CLASSES)):
        source = np.nonzero(y == (CLASSES.index('N') if c == N_TILDE else c))[0]
        for k in rng.choice(source, min(per_class, len(source)), replace=False):
            img = with_mark(x[k], 'tilde', rng) if c == N_TILDE else normalize(x[k])
            images.append(augment(img, rng, c) if distort else img)
            labels.append(c)
    return np.stack(images), np.array(labels)


def confusions(net, x, y, top=12):
    pred = np.concatenate([net.forward(x[i:i + 500]).argmax(1) for i in range(0, len(x), 500)])
    pairs = {}
    for a, b in zip(y, pred):
        if a != b:
            pairs[(CLASSES[a], CLASSES[b])] = pairs.get((CLASSES[a], CLASSES[b]), 0) + 1
    worst = sorted(pairs.items(), key=lambda kv: -kv[1])[:top]
    return ', '.join(f'{a}→{b} {n}' for (a, b), n in worst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--epochs', type=int, default=15)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--widths', default='24,48,128')
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    widths = tuple(int(v) for v in args.widths.split(','))

    train_x, train_y = load('train')
    test_x, test_y = load('test')
    test_plain = test_set(test_x, test_y, 400, np.random.default_rng(1000), False)
    test_aug = test_set(test_x, test_y, 400, np.random.default_rng(1001), True)
    strokes = stroke_pool(30000, rng)
    stroke_x, stroke_y = stroke_pool(3000, np.random.default_rng(args.seed + 1000))
    stroke_test = (np.stack([augment(img, np.random.default_rng(2000 + i)) for i, img in enumerate(stroke_x)]), stroke_y)
    sampler = Sampler(train_x, train_y, strokes, rng)

    net = Net(rng, len(CLASSES), widths)
    trainer = Trainer(net)
    batch = 128
    for epoch in range(args.epochs):
        started = time.time()
        lr = 1e-3 * (0.5 ** (epoch // 5))
        loss_sum = 0.0
        for _ in range(PER_EPOCH // batch):
            x, y = sampler.batch(batch)
            loss_sum += trainer.step(x, y, lr, rng)
        print(f'epoch {epoch + 1}: loss {loss_sum / (PER_EPOCH // batch * batch):.4f}, test {evaluate(net, *test_plain):.4f}, '
              f'distorted test {evaluate(net, *test_aug):.4f}, strokes {evaluate(net, *stroke_test):.4f} '
              f'({time.time() - started:.0f} s)', flush=True)

    dequantized(net)
    plain, distorted = evaluate(net, *test_plain), evaluate(net, *test_aug)
    print(f'int8: test {plain:.4f}, distorted test {distorted:.4f}, strokes {evaluate(net, *stroke_test):.4f}')
    print('confusions (distorted):', confusions(net, *test_aug))
    export_model(net, args.out, 'LETTER_MODEL', [
        'Weights of the handwritten letter reader (see letters.ts), generated by scripts/train_letters.py: do not edit.',
        f'Classes: {CLASSES}. EMNIST test accuracy {plain:.2%}, {distorted:.2%} with photo-like distortions.',
        'Trained on EMNIST (G. Cohen, S. Afshar, J. Tapson, A. van Schaik, 2017), from NIST Special Database 19.',
    ])


if __name__ == '__main__':
    sys.exit(main())
