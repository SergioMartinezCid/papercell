/**
 * Pages printed by earlier versions must keep scanning. Each fixture is a page as an earlier printer drew it
 * (see `fixtures/README.md`); it is read here with the current code.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PageDrawing } from '../src/drawing';
import { gridCellRect, type Rect } from '../src/layout';
import { decodePayload, type PagePayload } from '../src/payload';
import { scanPage } from '../src/scan/scanPage';
import { boxInCell, PRINT_VERSION } from '../src/spec';
import { drawMark, INKS } from './sim/marks';
import { photograph, randomPhotoParams } from './sim/photo';
import { mulberry32 } from './sim/random';
import { rasterize } from './sim/raster';

interface Fixture {
  version: number;
  code: string;
  payload: PagePayload;
  boxes: Array<{ row: number; col: number; box: Rect }>;
  drawing: PageDrawing;
}

const root = new URL('./fixtures/', import.meta.url);
const versionDirs = readdirSync(root).filter((d) => /^v\d+$/.test(d));
const fixtures = versionDirs.flatMap((dir) =>
  readdirSync(new URL(`${dir}/`, root))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: `${dir}/${f}`, fixture: JSON.parse(readFileSync(new URL(`${dir}/${f}`, root), 'utf8')) as Fixture })),
);

describe('pages printed by earlier versions', () => {
  it('has printed pages of every version, including the current one', () => {
    for (let v = 1; v <= PRINT_VERSION; v++) expect(versionDirs, `fixtures/v${v}`).toContain(`v${v}`);
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const { name, fixture } of fixtures) {
    describe(name, () => {
      it('decodes the page code', () => {
        expect(decodePayload(fixture.code)).toEqual(fixture.payload);
      });

      it('expects the boxes where they were printed', () => {
        const { payload } = fixture;
        const expected = payload.boxes.map((b) => boxInCell(gridCellRect(payload.grid, b.pageRow, b.col, b.rowSpan, b.colSpan), payload.version));
        expect(expected).toHaveLength(fixture.boxes.length);
        expected.forEach((box, i) => {
          for (const k of ['x', 'y', 'w', 'h'] as const) expect(box[k]).toBeCloseTo(fixture.boxes[i].box[k], 6);
        });
      });

      it('scans a photo of the page', () => {
        const rng = mulberry32(7);
        const pxPerMm = 8;
        const image = rasterize(fixture.drawing, pxPerMm);
        const marked = new Set<string>();
        fixture.boxes.forEach((b, i) => {
          if (i % 3 !== 0) return;
          drawMark(image, b.box, b.box, 'fill', INKS.black, pxPerMm, rng);
          marked.add(`${b.row},${b.col}`);
        });
        const outcome = scanPage(photograph(image, pxPerMm, randomPhotoParams(rng, 'easy'), rng));
        if (!outcome.ok) throw new Error(`scan failed: ${outcome.error}`);
        expect(outcome.scan.payload).toEqual(fixture.payload);
        const wrong = outcome.scan.boxes.filter((b) => b.marked !== marked.has(`${b.row},${b.col}`));
        expect(wrong).toEqual([]);
        // Boxes are found where expected, not rescued by the reader's search: a frame 1 mm off needs over 1.3 mm.
        const maxShift = Math.max(...outcome.scan.boxes.map((b) => Math.hypot(b.shift.x, b.shift.y)));
        expect(maxShift).toBeLessThan(0.8);
      });
    });
  }
});
