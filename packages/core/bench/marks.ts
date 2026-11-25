/**
 * How well marked boxes are told from empty ones, on pages marked in many ways: about one box per row,
 * most or all boxes, none; solid fills, scribbles, ticks, crosses, pencil, small red squiggles.
 *
 * Each scenario prints a sheet, marks some share of its boxes, photographs it (half the photos easy,
 * half hard) and reads it. The fill of every box is saved, so a change to how marked boxes are told
 * apart (src/scan/classify.ts) can be checked again in seconds with --replay.
 *
 *   pnpm bench:marks [photos] [scenario-prefix]
 *   pnpm bench:marks --replay [scenario-prefix]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseThreshold, classify } from '../src/scan/classify';
import { INKS, type MarkStyle } from '../test/sim/marks';
import { runCase, sampleTemplate, type CaseOptions } from '../test/sim/scenario';

const MIXED: MarkStyle[] = ['fill', 'scribble', 'cell', 'cross', 'light', 'squiggle'];
const DARK: MarkStyle[] = ['fill', 'scribble'];

/** A grid: 30 rows of 4 boxes. */
const grid = (stripe: string | null = null, backgrounds: 'none' | 'text' | 'all' = 'none') =>
  sampleTemplate({ rows: 30, stripe, headerBackground: stripe ? '#cccccc' : null, settings: { backgrounds } });
/** A checklist: one box per row. */
const list = (rows: number) => sampleTemplate({ rows, options: 1 });

interface Scenario extends Omit<CaseOptions, 'seed' | 'difficulty'> {
  name: string;
  description: string;
}

const SCENARIOS: Scenario[] = [
  { name: 'grid-usual', description: 'Grid, about one box per row, filled or scribbled', template: grid() },
  { name: 'grid-usual-mixed', description: 'Grid, about one box per row, any style', template: grid(), styles: MIXED },
  { name: 'grid-usual-tick', description: 'Grid, about one box per row, ticks', template: grid(), styles: ['tick'] },
  { name: 'grid-usual-red-squiggle', description: 'Grid, about one box per row, small red squiggles', template: grid(), styles: ['squiggle'], ink: INKS.red },
  { name: 'grid-usual-bg-all', description: 'Grid, about one box per row, grey rows (all cells)', template: grid('#d9d9d9', 'all') },
  { name: 'grid-usual-bg-text-dark', description: 'Grid, about one box per row, dark grey rows (text cells)', template: grid('#b7b7b7', 'text') },
  { name: 'grid-50-mixed', description: 'Grid, half the boxes, any style', template: grid(), density: 0.5, styles: MIXED },
  { name: 'grid-90-dark', description: 'Grid, 90% of the boxes, filled or scribbled', template: grid(), density: 0.9, styles: DARK },
  { name: 'grid-90-mixed', description: 'Grid, 90% of the boxes, any style', template: grid(), density: 0.9, styles: MIXED },
  { name: 'grid-90-bg-all-mixed', description: 'Grid, 90% of the boxes, any style, grey rows (all cells)', template: grid('#d9d9d9', 'all'), density: 0.9, styles: MIXED },
  { name: 'grid-100-mixed', description: 'Grid, every box, any style', template: grid(), density: 1, styles: MIXED },
  { name: 'list30-10-mixed', description: 'Checklist of 30, 10% of the boxes, any style', template: list(30), density: 0.1, styles: MIXED },
  { name: 'list30-90-dark', description: 'Checklist of 30, 90% of the boxes, filled or scribbled', template: list(30), density: 0.9, styles: DARK },
  { name: 'list30-90-mixed', description: 'Checklist of 30, 90% of the boxes, any style', template: list(30), density: 0.9, styles: MIXED },
  { name: 'list30-90-tick', description: 'Checklist of 30, 90% of the boxes, ticks', template: list(30), density: 0.9, styles: ['tick'] },
  { name: 'list30-90-fill-tick', description: 'Checklist of 30, 90% of the boxes, filled or ticked', template: list(30), density: 0.9, styles: ['fill', 'tick'] },
  { name: 'list30-90-cross', description: 'Checklist of 30, 90% of the boxes, crosses', template: list(30), density: 0.9, styles: ['cross'] },
  { name: 'list30-90-fill-cross', description: 'Checklist of 30, 90% of the boxes, filled or crossed', template: list(30), density: 0.9, styles: ['fill', 'cross'] },
  { name: 'list30-90-red-squiggle', description: 'Checklist of 30, 90% of the boxes, small red squiggles', template: list(30), density: 0.9, styles: ['squiggle'], ink: INKS.red },
  { name: 'list30-100-dark', description: 'Checklist of 30, every box, filled or scribbled', template: list(30), density: 1, styles: DARK },
  { name: 'list12-90-dark', description: 'Checklist of 12, 90% of the boxes, filled or scribbled', template: list(12), density: 0.9, styles: DARK },
  { name: 'list12-90-mixed', description: 'Checklist of 12, 90% of the boxes, any style', template: list(12), density: 0.9, styles: MIXED },
  { name: 'list30-0', description: 'Checklist of 30, no box marked', template: list(30), density: 0 },
  { name: 'grid-0', description: 'Grid, no box marked', template: grid(), density: 0 },
  { name: 'grid-0-bg-all', description: 'Grid, no box marked, grey rows (all cells)', template: grid('#d9d9d9', 'all'), density: 0 },
];

/** A page as read: every box's fill, whether it was marked and how. */
interface Page {
  seed: number;
  difficulty: 'easy' | 'hard';
  error?: string;
  boxes: Array<{ fill: number; marked: boolean; drawn: string }>;
}

const args = process.argv.slice(2);
const replay = args.includes('--replay');
const rest = args.filter((a) => a !== '--replay');
const photos = !replay && rest[0] && /^\d+$/.test(rest[0]) ? Number(rest.shift()) : 12;
const prefix = rest[0] ?? '';
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
const fillsDir = join(out, 'marks');
mkdirSync(fillsDir, { recursive: true });

const rows: string[] = [];
const total = { pages: 0, boxes: 0, wrong: 0, silent: 0, silentPages: 0, flaggedRight: 0 };
for (const scenario of SCENARIOS.filter((s) => s.name.startsWith(prefix))) {
  const file = join(fillsDir, `${scenario.name}.json`);
  let pages: Page[];
  if (replay) {
    if (!existsSync(file)) continue;
    pages = JSON.parse(readFileSync(file, 'utf8')) as Page[];
  } else {
    pages = Array.from({ length: photos }, (_, i) => {
      const seed = 5000 + i;
      const difficulty = i % 2 ? 'hard' : 'easy';
      const r = runCase({ ...scenario, seed, difficulty });
      return { seed, difficulty, error: r.error, boxes: r.readings };
    });
    writeFileSync(file, JSON.stringify(pages));
  }
  // Decided again from the fills, so that a replay uses the current rule.
  const read = pages.filter((p) => !p.error);
  const s = { boxes: 0, wrong: 0, silent: 0, silentPages: 0, flaggedRight: 0 };
  const silentBy: Record<string, number> = {};
  for (const page of read) {
    const threshold = chooseThreshold(page.boxes.map((b) => b.fill));
    let silentHere = false;
    for (const b of page.boxes) {
      const { marked, uncertain } = classify(b.fill, threshold);
      s.boxes++;
      if (marked !== b.marked) {
        s.wrong++;
        if (!uncertain) {
          s.silent++;
          silentHere = true;
          silentBy[b.drawn] = (silentBy[b.drawn] ?? 0) + 1;
        }
      } else if (uncertain) s.flaggedRight++;
    }
    if (silentHere) s.silentPages++;
  }
  const by = Object.entries(silentBy)
    .map(([drawn, n]) => `${n} ${drawn}`)
    .join(', ');
  rows.push(`| ${scenario.description} | ${read.length}/${pages.length} | ${s.boxes} | ${s.wrong} | ${s.silent}${by ? ` (${by})` : ''} | ${s.silentPages} | ${s.flaggedRight} |`);
  console.log(`${scenario.name}: ${read.length}/${pages.length} pages read, ${s.wrong} wrong, ${s.silent} not flagged, ${s.flaggedRight} flagged though right`);
  total.pages += read.length;
  for (const k of ['boxes', 'wrong', 'silent', 'silentPages', 'flaggedRight'] as const) total[k] += s[k];
}

const table = [
  '| Scenario | Page codes read | Boxes | Wrong | Wrong, not flagged | Pages with one | Flagged though right |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  `| **All** | ${total.pages} | ${total.boxes} | ${total.wrong} | ${total.silent} | ${total.silentPages} | ${total.flaggedRight} |`,
].join('\n');
const report = `# Marked and empty boxes

Simulated photos per scenario, half easy and half hard. "Wrong, not flagged" are the mistakes that would
reach the spreadsheet, with what was drawn in those boxes.

${table}
`;
console.log(`\n${table}`);
writeFileSync(join(out, 'marks.md'), report);
