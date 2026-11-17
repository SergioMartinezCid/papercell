/**
 * How well are letter fields and writing lines read from photos?
 *
 * Fills a list of letter fields (one capital per box) and writing lines (a few words), photographs it
 * (simulated: angle, curl, light, blur, noise) and compares what is read. Letters are written two ways: pen
 * strokes (test/sim/handwriting.ts) and, when EMNIST is in the cache (scripts/train_letters.py downloads it),
 * real handwritten capitals from the EMNIST test set, which the model never saw while training. Writing
 * lines are not read, only whether something is written on them.
 *
 *   pnpm bench:text [photosPerCondition]
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Rect } from '../src/layout';
import { INKS } from '../test/sim/marks';
import { uniform, type Rng } from '../test/sim/random';
import { fillRect, type Rgb, type RgbImage } from '../test/sim/raster';
import { runTextCase, textTemplate, type LetterWriter } from '../test/sim/scenario';

const photos = Number(process.argv[2] ?? 8);
const template = textTemplate({ rows: 20, tokens: ['[______]', '[...]'] });
const CAPITALS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** EMNIST test capitals by letter, as 28×28 ink images (upright). */
function emnistCapitals(): Map<string, number[][]> | null {
  const dir = join(homedir(), '.cache', 'papercell', 'emnist');
  const images = join(dir, 'emnist-byclass-test-images-idx3-ubyte.gz');
  const labels = join(dir, 'emnist-byclass-test-labels-idx1-ubyte.gz');
  if (!existsSync(images) || !existsSync(labels)) return null;
  const pixels = gunzipSync(readFileSync(images)).subarray(16);
  const tags = gunzipSync(readFileSync(labels)).subarray(8);
  const byLetter = new Map<string, number[][]>();
  for (let i = 0; i < tags.length; i++) {
    // ByClass labels 10–35 are the capitals; images are stored transposed.
    if (tags[i] < 10 || tags[i] > 35) continue;
    const letter = CAPITALS[tags[i] - 10];
    const image = Array.from({ length: 784 }, (_, k) => pixels[i * 784 + (k % 28) * 28 + Math.floor(k / 28)] / 255);
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), image]);
  }
  return byLetter;
}

function emnistWriter(letters: Map<string, number[][]>): LetterWriter {
  return (img: RgbImage, box: Rect, letter: string, ink: Rgb, p: number, rng: Rng) => {
    const samples = letters.get(letter)!;
    const pixels = samples[Math.floor(rng() * samples.length)];
    // EMNIST characters fill about 24 of the 28 pixels.
    const size = (box.h * uniform(rng, 0.65, 0.9)) / 24;
    const x0 = box.x + box.w / 2 - 14 * size + uniform(rng, -0.5, 0.5);
    const y0 = box.y + box.h / 2 - 14 * size + uniform(rng, -0.4, 0.4);
    pixels.forEach((v, i) => {
      if (v > 0.05) fillRect(img, { x: x0 + (i % 28) * size, y: y0 + Math.floor(i / 28) * size, w: size, h: size }, ink, p, v);
    });
  };
}

const writers: Array<{ name: string; write?: LetterWriter; alphabet: string }> = [{ name: 'strokes', alphabet: `${CAPITALS}Ñ` }];
const emnist = emnistCapitals();
if (emnist) writers.push({ name: 'EMNIST test', write: emnistWriter(emnist), alphabet: CAPITALS });
else console.log('EMNIST is not in the cache: run scripts/train_letters.py once to read real handwriting too.\n');

const inks: Array<[string, Rgb]> = [
  ['black', INKS.black],
  ['blue', INKS.blue],
  ['red', INKS.red],
];

console.log(`${photos} photos per condition, ${template.sheet.cells.length - 1} rows: a 6-letter field and a writing line each\n`);
console.log('Letters        Photos  Ink    Fields  Wrong  Silent  Flagged  Letters wrong | Lines  Missed  False  Flagged');
for (const writer of writers) {
  for (const difficulty of ['easy', 'hard'] as const) {
    for (const [inkName, ink] of inks) {
      const t = { fields: 0, wrong: 0, silent: 0, flagged: 0, letters: 0, letterWrong: 0, lines: 0, missed: 0, falseWritten: 0, lineFlagged: 0, failed: 0 };
      for (let i = 0; i < photos; i++) {
        const r = runTextCase({ template, seed: 6000 + i, difficulty, ink, writer: writer.write, alphabet: writer.alphabet });
        if (!r.ok) {
          t.failed++;
          continue;
        }
        t.fields += r.fields;
        t.wrong += r.wrong;
        t.silent += r.silentWrong;
        t.flagged += r.uncertain;
        t.letters += r.letters;
        t.letterWrong += r.letterMistakes.filter((m) => m.written !== ' ').length;
        t.lines += r.lines;
        t.missed += r.missed;
        t.falseWritten += r.falseWritten;
        t.lineFlagged += r.lineFlagged;
      }
      const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`.padStart(6);
      console.log(
        `${writer.name.padEnd(14)} ${difficulty.padEnd(6)}  ${inkName.padEnd(6)} ${String(t.fields).padStart(6)} ${pct(t.wrong, t.fields)} ${pct(t.silent, t.fields)}  ${pct(t.flagged, t.fields)}  ${pct(t.letterWrong, t.letters).padStart(13)} | ` +
          `${String(t.lines).padStart(5)} ${pct(t.missed, t.lines)} ${pct(t.falseWritten, t.lines)}  ${pct(t.lineFlagged, t.lines)}` +
          (t.failed ? `  (${t.failed} photos not read)` : ''),
      );
    }
  }
}
