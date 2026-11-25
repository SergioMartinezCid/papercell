/**
 * Makes the sample photos behind "Try a sample photo": a sample sheet per language, printed (its SVG rendered with
 * resvg, using the system's fonts), filled in by a simulated hand and photographed by the simulated phone camera of
 * the core tests. Writes the photos to public/sample/ and the sheets to src/help/samples.json, then scans each photo
 * and compares what is read with what was written.
 *
 *     pnpm sample:photos [--seed 1]
 *
 * It fails when a value is read wrong without being flagged for review: try another seed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import {
  buildPrintable,
  DEFAULT_SETTINGS,
  drawingToSvg,
  normalizeSheet,
  scanPage,
  templateFingerprint,
  type PageDrawing,
  type SheetCell,
  type Template,
} from '@papercell/core';
import { drawDigit, drawLetter, drawText } from '../../../packages/core/test/sim/handwriting';
import { drawMark, INKS, type MarkStyle } from '../../../packages/core/test/sim/marks';
import { photograph, type PhotoParams } from '../../../packages/core/test/sim/photo';
import { mulberry32, pick } from '../../../packages/core/test/sim/random';
import type { RgbImage } from '../../../packages/core/test/sim/raster';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Pixels per mm of the printout. */
const PX_PER_MM = 8;
const QUALITY = 82;

interface Row {
  item: string;
  checked: boolean;
  count: string;
  initials: string;
  note: string;
}

interface Sample {
  title: string;
  header: [string, string, string, string, string];
  rows: Row[];
}

const row = (item: string, checked: boolean, count: string, initials: string, note = ''): Row => ({ item, checked, count, initials, note });

const SAMPLES: Record<'en' | 'es', Sample> = {
  en: {
    title: 'Stock check (sample)',
    header: ['Item', 'Checked', 'Count', 'Initials', 'Notes'],
    rows: [
      row('Printer paper', true, '12', 'AMR'),
      row('Pens', true, '35', 'AMR'),
      row('Pencils', true, '40', 'AMR'),
      row('Markers', true, '6', 'AMR', 'ORDER MORE'),
      row('Erasers', true, '18', 'AMR'),
      row('Staplers', true, '4', 'AMR', '1 BROKEN'),
      row('Scissors', true, '9', 'JL'),
      row('Glue sticks', true, '15', 'JL'),
      row('Folders', true, '27', 'JL'),
      row('Sticky notes', true, '8', 'JL'),
      row('Tape', false, '', '', 'NOT FOUND'),
      row('Batteries', true, '3', 'JL', 'ORDER MORE'),
    ],
  },
  es: {
    title: 'Revisión de material (ejemplo)',
    header: ['Artículo', 'Revisado', 'Cantidad', 'Iniciales', 'Notas'],
    rows: [
      row('Folios', true, '12', 'AMR'),
      row('Bolígrafos', true, '35', 'AMR'),
      row('Lápices', true, '40', 'AMR'),
      row('Rotuladores', true, '6', 'AMR', 'COMPRAR'),
      row('Gomas', true, '18', 'AMR'),
      row('Grapadoras', true, '4', 'AMR', '1 ROTA'),
      row('Tijeras', true, '9', 'JL'),
      row('Pegamento', true, '15', 'JL'),
      row('Carpetas', true, '27', 'JL'),
      row('Notas adhesivas', true, '8', 'JL'),
      row('Celo', false, '', '', 'NO HAY'),
      row('Pilas', true, '3', 'JL', 'COMPRAR'),
    ],
  },
};

/** A phone photo in good light: a little turned and tilted, slightly warm light, slight blur. */
const PHOTO: PhotoParams = {
  width: 1500,
  height: 2000,
  rotation: -2.5,
  tilt: 0.012,
  coverage: 0.9,
  curl: 0.6,
  gradient: 0.86,
  softShadow: 0.12,
  hardShadow: 1,
  tint: [1, 0.97, 0.9],
  table: [0.46, 0.35, 0.25],
  blur: 1,
  noise: 0.01,
};

function template(sample: Sample): Template {
  const header: SheetCell[] = sample.header.map((text) => ({ text, style: { bold: true, background: '#e7f5ff' } }));
  const body: SheetCell[][] = sample.rows.map((r) => [{ text: r.item }, { text: '' }, { text: '[##]' }, { text: '[___]' }, { text: '[...]' }]);
  return {
    sheet: normalizeSheet({
      cells: [header, ...body],
      colWidths: [150, 76, 76, 100, 240],
      rowHeights: [30, ...body.map(() => 38)],
    }),
    overrides: {},
    settings: { ...DEFAULT_SETTINGS, title: sample.title },
    anchor: { row: 0, col: 0 },
  };
}

/** The page as printed, with real text (the core tests' rasterizer draws text as plain strokes). */
function print(drawing: PageDrawing): { img: RgbImage; p: number } {
  const width = Math.round(drawing.width * PX_PER_MM);
  const rendered = new Resvg(drawingToSvg(drawing), {
    fitTo: { mode: 'width', value: width },
    background: 'white',
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  }).render();
  const data = new Float32Array(rendered.width * rendered.height * 3);
  const px = rendered.pixels;
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    data[i] = px[j] / 255;
    data[i + 1] = px[j + 1] / 255;
    data[i + 2] = px[j + 2] / 255;
  }
  return { img: { width: rendered.width, height: rendered.height, data }, p: rendered.width / drawing.width };
}

function make(lang: 'en' | 'es', seed: number) {
  const sample = SAMPLES[lang];
  const tpl = template(sample);
  const page = buildPrintable(tpl).pages[0];
  const rng = mulberry32(seed);
  const ink = INKS.blue;
  const { img, p: P } = print(page.drawing);
  const truth = new Map<string, string>();
  const at = (r: number, c: number) => `${r},${c}`;

  for (const b of page.layout.boxes) {
    const r = sample.rows[b.row - 1];
    truth.set(at(b.row, b.col), r.checked ? 'marked' : 'empty');
    if (r.checked) drawMark(img, b.box, b.cell, pick<MarkStyle>(rng, ['scribble', 'scribble', 'fill']), ink, P, rng);
  }
  for (const n of page.layout.numbers) {
    const value = sample.rows[n.row - 1].count;
    truth.set(at(n.row, n.col), value);
    // Written aligned left, as most people do.
    [...value].forEach((d, i) => drawDigit(img, n.boxes[i], Number(d), ink, P, rng));
  }
  for (const f of page.layout.letters) {
    const value = sample.rows[f.row - 1].initials;
    truth.set(at(f.row, f.col), value);
    [...value].forEach((ch, i) => drawLetter(img, f.boxes[i], ch, ink, P, rng));
  }
  for (const l of page.layout.lines) {
    const value = sample.rows[l.row - 1].note;
    truth.set(at(l.row, l.col), value ? 'written' : 'empty');
    if (value) drawText(img, l.cell, l.line, value, ink, P, rng);
  }

  const photo = photograph(img, P, PHOTO, rng);
  const file = `sample/stock-check-${lang}.jpg`;
  const encoded = jpeg.encode({ data: Buffer.from(photo.data.buffer), width: photo.width, height: photo.height }, QUALITY).data;
  mkdirSync(join(WEB, 'public', 'sample'), { recursive: true });
  writeFileSync(join(WEB, 'public', file), encoded);

  // Read the photo back as the app would.
  const decoded = jpeg.decode(encoded, { useTArray: true, formatAsRGBA: true });
  const outcome = scanPage({ width: decoded.width, height: decoded.height, data: new Uint8ClampedArray(decoded.data.buffer) });
  if (!outcome.ok) throw new Error(`${lang}: the sample photo cannot be read (${outcome.error})`);
  const read: Array<{ key: string; value: string; uncertain: boolean }> = [
    ...outcome.scan.boxes.map((b) => ({ key: at(b.row, b.col), value: b.marked ? 'marked' : 'empty', uncertain: b.uncertain })),
    ...outcome.scan.numbers.map((n) => ({ key: at(n.row, n.col), value: n.value, uncertain: n.uncertain })),
    ...outcome.scan.letters.map((f) => ({ key: at(f.row, f.col), value: f.value, uncertain: f.uncertain })),
    ...outcome.scan.lines.map((l) => ({ key: at(l.row, l.col), value: l.written ? 'written' : 'empty', uncertain: l.uncertain })),
  ];
  const flagged = read.filter((r) => r.uncertain);
  const wrong = read.filter((r) => r.value !== truth.get(r.key));
  const silent = wrong.filter((r) => !r.uncertain);
  console.log(
    `${lang}: ${file} (${Math.round(encoded.length / 1024)} KB), ${read.length} cells read, ${flagged.length} to check, ` +
      `${wrong.length} wrong (${silent.length} not flagged)`,
  );
  for (const r of read.filter((r) => r.uncertain || r.value !== truth.get(r.key))) {
    console.log(`  ${r.key}: read "${r.value}", written "${truth.get(r.key)}"${r.uncertain ? ', to check' : ''}`);
  }
  return { ok: silent.length === 0, entry: { templateId: templateFingerprint(tpl), photo: file, template: tpl } };
}

// Seeds that give a correct read with one value to check, to show what reviewing is like.
const seedArg = process.argv.indexOf('--seed');
const seed = seedArg >= 0 ? Number(process.argv[seedArg + 1]) : null;
const en = make('en', seed ?? 5);
const es = make('es', seed === null ? 108 : seed + 100);
writeFileSync(join(WEB, 'src', 'help', 'samples.json'), JSON.stringify({ en: en.entry, es: es.entry }, null, 1) + '\n');
if (!en.ok || !es.ok) {
  console.error('Some value is read wrong without a flag: try another --seed.');
  process.exit(1);
}
