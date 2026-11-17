/**
 * How well are handwritten numbers read from photos?
 *
 * Fills a list of number fields with digits, photographs it (simulated: angle, curl, light, blur, noise) and
 * compares what is read. Digits are written two ways: pen strokes (test/sim/handwriting.ts) and, when the
 * MNIST data is in the cache (scripts/train_digits.py downloads it), real handwritten digits from the MNIST
 * test set, which the model never saw while training.
 *
 *   pnpm bench:numbers [photosPerCondition]
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Rect } from '../src/layout';
import { INKS } from '../test/sim/marks';
import { uniform, type Rng } from '../test/sim/random';
import { fillRect, type Rgb, type RgbImage } from '../test/sim/raster';
import { numberTemplate, runNumberCase, type DigitWriter } from '../test/sim/scenario';

const photos = Number(process.argv[2] ?? 8);
const template = numberTemplate({ rows: 20, tokens: ['[##]', '[#,#]', '[###]'] });

/** MNIST test digits by label, as 28×28 ink images. */
function mnistDigits(): number[][][] | null {
  const dir = join(homedir(), '.cache', 'papercell', 'mnist');
  const images = join(dir, 't10k-images-idx3-ubyte.gz');
  const labels = join(dir, 't10k-labels-idx1-ubyte.gz');
  if (!existsSync(images) || !existsSync(labels)) return null;
  const pixels = gunzipSync(readFileSync(images)).subarray(16);
  const tags = gunzipSync(readFileSync(labels)).subarray(8);
  const byLabel: number[][][] = Array.from({ length: 10 }, () => []);
  for (let i = 0; i < tags.length; i++) byLabel[tags[i]].push(Array.from(pixels.subarray(i * 784, (i + 1) * 784), (v) => v / 255));
  return byLabel;
}

function mnistWriter(digits: number[][][]): DigitWriter {
  return (img: RgbImage, box: Rect, digit: number, ink: Rgb, p: number, rng: Rng) => {
    const pixels = digits[digit][Math.floor(rng() * digits[digit].length)];
    // The digit is 20 of the 28 pixels high.
    const size = (box.h * uniform(rng, 0.6, 0.85)) / 20;
    const x0 = box.x + box.w / 2 - 14 * size + uniform(rng, -0.6, 0.6);
    const y0 = box.y + box.h / 2 - 14 * size + uniform(rng, -0.4, 0.4);
    pixels.forEach((v, i) => {
      if (v > 0.05) fillRect(img, { x: x0 + (i % 28) * size, y: y0 + Math.floor(i / 28) * size, w: size, h: size }, ink, p, v);
    });
  };
}

const writers: Array<{ name: string; write?: DigitWriter }> = [{ name: 'strokes' }];
const mnist = mnistDigits();
if (mnist) writers.push({ name: 'MNIST test digits', write: mnistWriter(mnist) });
else console.log('MNIST is not in the cache: run scripts/train_digits.py once to read real handwriting too.\n');

const inks: Array<[string, Rgb]> = [
  ['black', INKS.black],
  ['blue', INKS.blue],
  ['red', INKS.red],
];

console.log(`${photos} photos per condition, ${template.sheet.cells.length - 1} rows × 3 fields each\n`);
console.log('Digits             Photos  Ink    Fields  Wrong  Silent  Flagged');
for (const writer of writers) {
  for (const difficulty of ['easy', 'hard'] as const) {
    for (const [inkName, ink] of inks) {
      const total = { fields: 0, wrong: 0, silent: 0, flagged: 0, failed: 0 };
      for (let i = 0; i < photos; i++) {
        const r = runNumberCase({ template, seed: 5000 + i, difficulty, ink, writer: writer.write });
        if (!r.ok) {
          total.failed++;
          continue;
        }
        total.fields += r.fields;
        total.wrong += r.wrong;
        total.silent += r.silentWrong;
        total.flagged += r.uncertain;
      }
      const pct = (n: number) => `${((100 * n) / Math.max(1, total.fields)).toFixed(1)}%`.padStart(6);
      console.log(
        `${writer.name.padEnd(18)} ${difficulty.padEnd(6)}  ${inkName.padEnd(6)} ${String(total.fields).padStart(6)} ${pct(total.wrong)} ${pct(total.silent)}  ${pct(total.flagged)}` +
          (total.failed ? `  (${total.failed} photos not read)` : ''),
      );
    }
  }
}
