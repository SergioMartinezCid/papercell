/**
 * Does printing cell background colours affect reading the boxes?
 *
 * Every condition prints the same list with alternating row colours and is photographed with the
 * same simulated photos (same seeds: same marks, angles, shadows, blur and noise), so differences
 * come from the backgrounds alone.
 *
 *   pnpm bench:backgrounds [photosPerCondition]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BackgroundMode } from '../src/layout';
import { runCase, sampleTemplate } from '../test/sim/scenario';

interface Condition {
  name: string;
  backgrounds: BackgroundMode;
  stripe: string | null;
  header: string | null;
}

const CONDITIONS: Condition[] = [
  { name: 'No backgrounds', backgrounds: 'none', stripe: null, header: null },
  { name: 'Text cells, light grey #f3f3f3', backgrounds: 'text', stripe: '#f3f3f3', header: '#cccccc' },
  { name: 'Text cells, grey #d9d9d9', backgrounds: 'text', stripe: '#d9d9d9', header: '#b7b7b7' },
  { name: 'Text cells, light blue #cfe2f3', backgrounds: 'text', stripe: '#cfe2f3', header: '#9fc5e8' },
  { name: 'Text cells, dark grey #b7b7b7', backgrounds: 'text', stripe: '#b7b7b7', header: '#999999' },
  { name: 'All cells, light grey #f3f3f3', backgrounds: 'all', stripe: '#f3f3f3', header: '#cccccc' },
  { name: 'All cells, grey #d9d9d9', backgrounds: 'all', stripe: '#d9d9d9', header: '#b7b7b7' },
  { name: 'All cells, light blue #cfe2f3', backgrounds: 'all', stripe: '#cfe2f3', header: '#9fc5e8' },
  { name: 'All cells, dark grey #b7b7b7', backgrounds: 'all', stripe: '#b7b7b7', header: '#999999' },
];

const photos = Number(process.argv[2] ?? 24);
const seeds = Array.from({ length: photos }, (_, i) => 1000 + i);

interface Row {
  condition: string;
  pages: number;
  read: number;
  boxes: number;
  wrong: number;
  silent: number;
  uncertain: number;
  emptyP99: number;
  emptyMax: number;
  stripedEmptyMax: number;
  markedMin: number;
  markedP1: number;
  worstGap: number;
  msPerPage: number;
}

// Run everything first, then compare only the photos whose page code was read in every condition.
const runs = CONDITIONS.map((c) => {
  const template = sampleTemplate({ rows: 30, stripe: c.stripe, headerBackground: c.header, settings: { backgrounds: c.backgrounds } });
  const results = seeds.map((seed) => runCase({ template, seed, difficulty: seed % 2 ? 'hard' : 'easy' }));
  const failed = results.filter((r) => !r.ok).map((r) => r.error);
  console.log(`${c.name}: ${results.length - failed.length}/${results.length} pages read${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`);
  return { c, results };
});
const common = seeds.map((_, i) => runs.every((r) => r.results[i].ok));

const rows: Row[] = runs.map(({ c, results }) => {
  const ok = results.filter((_, i) => common[i]);
  const empty = ok.flatMap((r) => r.emptyFills);
  const marked = ok.flatMap((r) => r.markedFills);
  return {
    condition: c.name,
    pages: results.length,
    read: results.filter((r) => r.ok).length,
    boxes: ok.reduce((s, r) => s + r.boxes, 0),
    wrong: ok.reduce((s, r) => s + r.wrong, 0),
    silent: ok.reduce((s, r) => s + r.silentWrong, 0),
    uncertain: ok.reduce((s, r) => s + r.uncertain, 0),
    emptyP99: quantile(empty, 0.99),
    emptyMax: Math.max(...empty),
    stripedEmptyMax: ok.some((r) => r.emptyStripedFills.length) ? Math.max(...ok.flatMap((r) => r.emptyStripedFills)) : NaN,
    markedMin: Math.min(...marked),
    markedP1: quantile(marked, 0.01),
    worstGap: Math.min(...ok.map((r) => Math.min(...r.markedFills) - Math.max(...r.emptyFills))),
    msPerPage: ok.reduce((s, r) => s + r.ms, 0) / Math.max(ok.length, 1),
  };
});

const f = (v: number) => (Number.isNaN(v) ? '–' : v.toFixed(3));
const table = [
  '| Condition | Page codes read | Boxes | Wrong | Silent wrong | To review | Empty p99 | Empty max | Empty max (coloured rows) | Marked p1 | Marked min | Worst page gap | ms/page |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.condition} | ${r.read}/${r.pages} | ${r.boxes} | ${r.wrong} | ${r.silent} | ${r.uncertain} | ${f(r.emptyP99)} | ${f(r.emptyMax)} | ${f(r.stripedEmptyMax)} | ${f(r.markedP1)} | ${f(r.markedMin)} | ${f(r.worstGap)} | ${Math.round(r.msPerPage)} |`,
  ),
].join('\n');

const report = `# Background colours and box reading

${photos} simulated photos per condition (half easy, half hard), the same photos for every condition.
Box statistics use only the ${common.filter(Boolean).length} photos whose page code was read in every condition.
Fill is the mean ink darkness inside a box: 0 is blank paper, 1 is solid black.
"Worst page gap" is the smallest distance, on any page, between the lightest marked box and the darkest empty box.

${table}
`;
console.log(`\n${table}`);
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'backgrounds.md'), report);
writeFileSync(join(out, 'backgrounds.json'), JSON.stringify(rows, null, 2));

function quantile(values: number[], q: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}
