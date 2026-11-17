# Papercell

Turn a spreadsheet range into a printable sheet, mark it or write numbers on it by hand, photograph it, and get the results back as cells.

1. **Prepare** (computer): copy a range in Google Sheets, Excel or LibreOffice and paste it, or upload an `.xlsx`, `.csv` or `.tsv` file. Cells with text are printed as they are; empty cells become boxes (see [cell kinds](#cell-kinds) for numbers and blank cells). Print.
2. **Mark** the boxes on paper by filling them in, and write numbers one digit per box.
3. **Scan** (phone or computer): take a photo, or drop, paste or choose an image. Papercell finds the page, reads every box and number and flags the ones it is unsure about for a quick check.
4. **Paste** the result back into the spreadsheet: copy it (tab-separated, ready to paste) or download a CSV.

Boxes are read by optical mark recognition (OMR): deciding whether a known box is filled in is very reliable. Numbers are read digit by digit, each in its own printed box, which is much more reliable than reading free handwriting.

Everything runs in the browser. Photos and sheets never leave the device.

## How a sheet is read

Every printed page carries four [ArUco](https://www.uco.es/investiga/grupos/ava/portfolio/aruco/) corner markers and a QR code. The QR code describes the page: grid geometry, which cells are boxes or number fields, page number and where the range sits in the spreadsheet. Any device can scan any printed page without having the original sheet.

Scanning a photo:

1. Find the corner markers and fit a homography (perspective correction).
2. Read the QR page code.
3. Straighten the page and even out its lighting (morphological closing, which also removes hard shadow edges). Boxes are read from the darkest colour channel, so a pen of any colour counts like black.
4. Snap each box to its printed outline. This absorbs paper curl, and boxes that cannot be snapped borrow the shift of their neighbours.
5. Measure the ink inside every box and split marked from empty per page. Values close to the threshold, and boxes that stand out from the empty ones without reaching it, are flagged for review rather than guessed.
6. Read number fields. Digit boxes are printed light grey, so the writing can be told from them: each box is read with some space around it, keeping only ink clearly darker than the paper and the outline, in strokes of a real size centred on the box. Digits written over the outline keep their strokes. Whether a box is empty is decided per page from that ink; a written box is normalized like the MNIST digits (fit in 20×20, centred by mass in 28×28) and classified by a small convolutional network (`src/scan/digits.ts`). Digits read with less than 95% confidence, faint ones and gaps between digits are flagged for review.

## Printed pages keep working

Paper printed today must still scan after the app is updated. Most of the layout travels in the QR code, so it can change freely. The few things the scanner assumes beyond it are the print format, kept in `packages/core/src/spec.ts`:

- The frame, shared by every version: paper sizes, corner markers and where the QR code sits.
- Per version, which is the first byte of the page code: the code's byte layout and the size of the boxes and digit boxes. Version 1 has boxes; version 2 adds number fields.

These values never change. A new kind of page gets a new version, while the scanner keeps reading every earlier one. A page from a version newer than the app asks the user to reload the app to update it. `packages/core/test/compat.test.ts` scans pages recorded from every version's printer (`test/fixtures/v<n>/`), so a change that would break existing prints fails the tests.

## Cell kinds

Every cell gets a kind: `text` (printed, never read), `mark` (a box), `number` (one box per digit) or `blank` (printed empty, not read). Cells with text are printed. Other cells become boxes, except in rows without any text, which stay blank, unless the spreadsheet or the app says otherwise:

| Token | Kind |
| --- | --- |
| `[ ]` or `☐` | a box |
| `[-]` | blank |
| `[##]`, `[###]`… | a number, one box per digit (`#`); numbers can be written aligned left or right |
| `[#,#]`, `[##.##]`… | a number with decimals; the separator is printed between the boxes and kept in the value |

`0` can be used instead of `#` (`[00]`, `[0,0]`), but not mixed with it. A token counts when it is the whole text of a cell, or anywhere in the cell's note (the first one counts), so a note can keep the cell itself empty and survive results pasted over it. Notes are read from Google Sheets, LibreOffice and ONLYOFFICE pastes and from `.xlsx` files; Excel does not seem to copy notes, so there, write tokens in the cells. In the app, clicking a cell in the preview chooses its kind by hand, which wins over tokens.

Rows and columns hidden in the spreadsheet keep their place in the range but are not printed, so results paste back into the right cells.

### The digit reader

The network is trained by `packages/core/scripts/train_digits.py` (Python 3, numpy, scipy) on the [MNIST database](https://yann.lecun.com/exdb/mnist/) of handwritten digits (Y. LeCun, C. Cortes, C. J. C. Burges; CC BY-SA 3.0), distorted while training to look like digits read from phone photos (slant, size, stroke width, resolution, blur, ink, noise), with bars added to some 7s and flags to some 1s, as many people write them. A quarter of the training digits are drawn with pen strokes in other common styles (`test/sim/glyphs.json`). The weights (int8, about 60 KB) are generated into `src/scan/digitModel.ts`.

`pnpm bench:numbers` measures reading on simulated photos, with digits drawn with pen strokes and, once MNIST is downloaded, with real handwritten digits from the MNIST test set, which the network never saw. With those, in reasonable photos about 2% of the fields come out wrong, almost all of them flagged for review (under 1% are not); in poorly lit, blurry photos, many more values are flagged.

## Repository layout

| Path | What |
| --- | --- |
| `packages/core` | Framework-agnostic TypeScript: sheet model, page layout, page codes, printable drawing (SVG), photo scanning, output. No DOM or React needed for scanning, so it runs in browsers, workers and Node. |
| `packages/core/test` | Unit tests and a synthetic "printer + phone camera" simulator (perspective, curl, shadows, blur, noise, hand marks). |
| `packages/core/bench` | Benchmarks built on the simulator. |
| `apps/web` | The React + Mantine PWA. |

## Development

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev            # http://localhost:5173 (also reachable from other devices on the network)
pnpm test           # core tests
pnpm typecheck
pnpm build          # production build in apps/web/dist
pnpm preview        # serve the production build
pnpm bench:backgrounds [photos]   # do cell background colours affect reading?
pnpm bench:numbers [photos]       # how well are handwritten numbers read?
```

### Phones and HTTPS

On the local network (`http://<computer-ip>:5173`), phones can take photos with the camera app and scan them. Installing the app (PWA) and working offline need HTTPS, as does `localhost` on the phone itself, so for that, deploy the build to any static host.

### Deploying

Pushes to `main` are typechecked, tested and deployed to GitHub Pages by `.github/workflows/pages.yml` (repository settings → Pages → Source: GitHub Actions).

To host the build elsewhere under a sub-path, set `BASE_PATH` when building, for example `BASE_PATH=/papercell/ pnpm build`.

## License

[MIT](LICENSE).

## Third-party code

`packages/core/src/vendor/js-aruco2` is [js-aruco2](https://github.com/damianofalcioni/js-aruco2) 2.0.0 (MIT), converted to an ES module; see its `LICENSE.txt`.
