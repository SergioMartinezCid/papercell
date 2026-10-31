# @papercell/core

Optical mark recognition for printed spreadsheet grids, in plain TypeScript. It does not depend on React. Printing produces SVG strings, and scanning works on raw RGBA pixels, so it runs in a browser, a Web Worker or Node.

```ts
import { buildPrintable, drawingToSvg, scanPage, buildOutput, toTsv, DEFAULT_SETTINGS, normalizeSheet } from '@papercell/core';

// 1. A template: the sheet (text, sizes, merges, formatting) plus print settings.
const template = {
  sheet: normalizeSheet({ cells: [[{ text: 'Item' }, { text: 'A' }], [{ text: 'First' }, { text: '' }]] }),
  overrides: {},
  settings: { ...DEFAULT_SETTINGS, title: 'Example' },
  anchor: { row: 0, col: 0 },
};

// 2. Printable pages (each with its corner markers and QR page code).
const { pages } = buildPrintable(template);
const svg = drawingToSvg(pages[0].drawing);

// 3. Scan a photo: { width, height, data: RGBA bytes }.
const outcome = scanPage(photo);
if (outcome.ok) {
  const { payload, boxes } = outcome.scan; // boxes: { row, col, fill, marked, uncertain, … }
  const out = buildOutput(
    {
      sourceRows: payload.sourceRows,
      sourceCols: payload.sourceCols,
      anchor: { row: payload.anchorRow, col: payload.anchorCol },
      marks: boxes,
    },
    { shape: 'boxes', markedValue: '1', emptyValue: '' },
  );
  console.log(toTsv(out.values));
}
```

| Module | Role |
| --- | --- |
| `sheet.ts` | Sheet model, cell kinds (`text`, `mark`, `blank`, `covered`), A1 addresses |
| `import/` | CSV/TSV and HTML-table (clipboard) importers |
| `spec.ts` | Print format: what the scanner assumes beyond the page code (paper formats, corner markers, QR position, box geometry per version). Never changes for printed versions |
| `layout.ts` | Pagination, scaling and cell geometry |
| `payload.ts` | Page code: compact binary layout description, Base45 for the QR alphanumeric mode; reads every printed version |
| `markers.ts`, `drawing.ts` | Marker and QR matrices; page drawing as shapes, and as SVG |
| `scan/` | Marker detection, homography, page straightening, lighting correction, box snapping, thresholding |
| `results.ts` | Read marks → spreadsheet block (TSV / CSV) |

Testing: `pnpm test`. The `test/sim` folder simulates printing, hand marks and phone photos, and is reused by `bench/`. `test/compat.test.ts` scans pages recorded from earlier printers (`test/fixtures/`) to make sure they still read.
