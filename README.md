# Papercell

Turn a spreadsheet range into a printable form, fill it in by hand, take a photo of it, and paste the results back into the spreadsheet.

**Open it at <https://sergiomartinezcid.github.io/papercell/>.** There is nothing to install or sign up for, and photos and sheets never leave your device.

Papercell suits any list you keep in a spreadsheet but fill in away from the computer: checklists, stock counts, inspection rounds, sign-up sheets, meter readings, tallies, quick surveys. You choose the range. Papercell prints it as it looks in the spreadsheet, with boxes where you want answers, and reads the answers back into the same cells.

## How to use it

1. **Copy a range.** Select it in Google Sheets, Excel, LibreOffice or ONLYOFFICE, copy it and paste it into Papercell. You can also upload an `.xlsx`, `.csv` or `.tsv` file. Papercell keeps the text and, where the source has them, column widths, merged cells and formatting. It asks which cell the range starts at, so it can tell you later where to paste the results.
2. **Choose what each cell is.** Cells with text are printed as they are. Empty cells in rows with text become boxes to mark. For a number, capital letters or free writing, write a short [token](#cell-kinds) in the cell or in its note, or click the cell in the preview.
3. **Print** at 100% scale. Pages are A4 or Letter, portrait or landscape. A long range is split into pages, and the header rows can repeat on each one.
4. **Fill it in** by hand, with a pen of any colour. Mark boxes by filling them in. Write numbers one digit per box and capital letters one per box. Write anything on writing lines.
5. **Scan** with a phone or a computer: take a photo, or drop, paste or choose images. Fit the whole page in the photo with its four corner squares, keep it flat and avoid flash glare. Papercell reads every box, number and letter and asks you to check the ones it is unsure about. Lines with something written on them show the writing so you can type it.
6. **Paste the results** into the spreadsheet at the cell Papercell names. Copy them (tab-separated, ready to paste) or download a CSV. You choose what a marked and an empty box become (`1` and nothing by default), and whether to copy only the boxes, the whole range or a selection.

Each page carries a QR code that describes it, so pages can be scanned in any order and on any device, even one that never saw the spreadsheet. A device that has the original sheet can paste the whole range back, text cells included. Any other device pastes what was read and leaves the text cells empty. A new photo of a page replaces the earlier one, and pages still missing are listed.

The app is in English and Spanish. It can be installed on a phone or computer and then works offline.

New to it? The **?** button opens a guided tour of the app and answers to common questions, including every token. To see reading and reviewing without printing anything, use **Try a sample photo** on the Scan page: it reads a photo of a filled-in sample page.

## Cell kinds

Every cell gets a kind:

- `text`: printed, never read.
- `mark`: a box.
- `number`: one box per digit.
- `letters`: one box per capital letter.
- `line`: a line to write on.
- `blank`: printed empty, not read.

Cells with text are printed. Other cells become boxes, except in rows without any text, which stay blank. The spreadsheet can change this with tokens:

| Token | Kind |
| --- | --- |
| `[ ]` or `☐` | a box |
| `[-]` | blank |
| `[##]`, `[###]`… | a number, one box per digit (`#`); numbers can be written aligned left or right |
| `[#,#]`, `[##.##]`… | a number with decimals; the separator is printed between the boxes and kept in the value |
| `[___]`, `[______]`… | capital letters (or digits), one box per letter (`_`); empty boxes between letters become a space |
| `[...]` or `[…]` | a line to write anything on; it is not read, but shown when reviewing so you can type what is written |

You can use `0` instead of `#` (`[00]`, `[0,0]`), but not mix the two in one token. A token counts when it is the whole text of a cell, or anywhere in the cell's note, where the first one counts. A token in a note keeps the cell itself empty, so it survives the results being pasted over it. In the app, clicking a cell in the preview chooses its kind by hand, and that wins over tokens.

Where tokens in notes are read:

| Source | Notes |
| --- | --- |
| Google Sheets, LibreOffice or ONLYOFFICE, copy and paste | read |
| Excel, copy and paste | not copied by Excel, it seems: write tokens in the cells |
| `.xlsx` file | read |
| `.csv` or `.tsv` file | these formats have no notes |

Hidden rows and columns keep their place in the range but are not printed, so results paste back into the right cells.

## Tips

- Print at 100% scale. Margins do not matter.
- Keep the four corner squares and the QR code clean. Papercell needs them to find and identify the page.
- Write digits and letters inside their boxes, one per box. Papercell warns when boxes come out small; landscape, full width or fewer rows make them bigger.
- Take photos in good light, flat and in focus, with the whole page in the frame. Each photo holds one page.
- Check everything Papercell flags before pasting. With reasonable photos almost every mistake is flagged; in dark or blurry photos, more is flagged and a few mistakes are not.

## Limitations

- Free handwriting is not read. A model small enough to run in the browser cannot read it reliably, so writing lines only tell whether something is written, and show it for you to type.
- Letter fields read the capitals A–Z, Ñ and digits. Accented capitals read as the plain letter, and small letters are not read.
- Pages are A4 or Letter only.

## How it works

Boxes are read by optical mark recognition (OMR): deciding whether a known box is filled in is very reliable. Numbers and letters are read one character at a time, each in its own printed box, which is much more reliable than reading free handwriting.

### How a page is read

Every printed page carries four [ArUco](https://www.uco.es/investiga/grupos/ava/portfolio/aruco/) corner markers and a QR code. The QR code describes the page: grid geometry, which cells are boxes, number fields, letter fields or writing lines, page number and where the range sits in the spreadsheet. That is why any device can scan any printed page without the original sheet.

Scanning a photo:

1. Find the corner markers and fit a homography (perspective correction).
2. Read the QR page code.
3. Straighten the page and even out its lighting (morphological closing, which also removes hard shadow edges). Boxes are read from the darkest colour channel, so a pen of any colour counts like black.
4. Snap each box to its printed outline. This absorbs paper curl, and boxes that cannot be snapped borrow the shift of their neighbours.
5. Measure the ink inside every box and split marked from empty per page. Values close to the threshold, and boxes that stand out from the empty ones without reaching it, are flagged for review rather than guessed.
6. Read number fields:
   - Digit boxes are printed light grey, so the writing can be told from them.
   - Each field is found by its outlines. It is moved to where the outlines of all its boxes line up with thin lines on the page. A cell's gridline fits one side of a row of boxes, not all four.
   - Each box is read with some space around it. Only ink clearly darker than the paper and the outline is kept, in strokes of a real size centred on the box. Strokes lying along the outline are kept when they are much darker than it, and digits written over the outline keep their strokes.
   - Whether a box is empty is decided per page from that ink.
   - A written box is normalized like the MNIST digits (fit in 20×20, centred by mass in 28×28) and classified by a small convolutional network (`src/scan/digits.ts`).
   - Digits read with less than 95% confidence, faint ones and gaps between digits are flagged for review.
7. Read letter fields the same way, with a network for capital letters and digits (`src/scan/letters.ts`). The split between empty and written boxes is shared with the digits. Empty boxes between letters become one space.
8. Look for writing on writing lines: strokes of a real size in the cell, clearly darker than the paper and the printed lines, that are not the printed lines themselves. Lines with writing, or where that is doubtful, are shown for review, to type what is written.

### The digit reader

The network is trained by `packages/core/scripts/train_digits.py` (Python 3, numpy, scipy) on the [MNIST database](https://yann.lecun.com/exdb/mnist/) of handwritten digits (Y. LeCun, C. Cortes, C. J. C. Burges; CC BY-SA 3.0).
- **Distortions:** while training, digits are distorted to look like digits read from phone photos: slant, size, stroke width, resolution, blur, ink and noise.
- **Common variants:** some 7s get a bar and some 1s a flag, as many people write them.
- **Other styles:** a quarter of the training digits are drawn with pen strokes in other common styles (`test/sim/glyphs.json`).

The weights (int8, about 60 KB) are generated into `src/scan/digitModel.ts`.

`pnpm bench:numbers` measures reading on simulated photos. It uses digits drawn with pen strokes and, once MNIST is downloaded, real handwritten digits from the MNIST test set, which the network never saw.
- **Reasonable photos:** about 2% of the fields come out wrong, and almost all of them are flagged for review (under 1% are not).
- **Poorly lit, blurry photos:** many more values are flagged.

### The letter reader

Letter fields are read like number fields, with a network of the same shape, a little wider, that tells apart the capitals A–Z, Ñ and the digits. It is trained by `packages/core/scripts/train_letters.py` on the capitals and digits of [EMNIST](https://www.nist.gov/itl/products-and-services/emnist-dataset) (G. Cohen, S. Afshar, J. Tapson, A. van Schaik, 2017; from NIST Special Database 19), with the same distortions.
- **Ñ and accents:** EMNIST has neither. Ñ is made by writing a tilde over its Ns, and some vowels get an accent so that accented capitals read as the plain letter.
- **Other styles:** a fifth of the training characters are drawn with pen strokes.
- **Letters before digits:** letter fields mostly hold letters, so digits count as less likely than the network says. O is not taken for 0, nor I for 1, unless the writing clearly is a digit.

The weights (int8, about 170 KB) are generated into `src/scan/letterModel.ts`.

`pnpm bench:text` measures letter fields and writing lines on simulated photos. It uses letters drawn with pen strokes and, once EMNIST is downloaded, real handwritten capitals from its test set.
- **Reasonable photos:** about 3% of the letters (7% of six-letter fields) come out wrong, all of them flagged. A third of the fields are flagged, since one doubtful letter is enough.
- **Poorly lit, blurry photos:** about half the fields are flagged, and a few mistakes are not.
- **Writing lines:** whether a line has something written on it was right on every simulated photo.

### Printed pages keep working

Paper printed today must still scan after the app is updated. Most of the layout travels in the QR code, so it can change freely. The few things the scanner assumes beyond it are the print format, kept in `packages/core/src/spec.ts`:

- The frame, shared by every version: paper sizes, corner markers and where the QR code sits.
- Per version, which is the first byte of the page code: the code's byte layout and the size of the boxes and digit boxes. Version 1 has boxes; version 2 adds number fields; version 3 adds letter fields and writing lines.

These values never change. A new kind of page gets a new version, and the scanner keeps reading every earlier one. A page from a version newer than the app asks the user to reload the app to update it. `packages/core/test/compat.test.ts` scans pages recorded from every version's printer (`test/fixtures/v<n>/`), so a change that would break existing prints fails the tests.

## Development

### Repository layout

| Path | What |
| --- | --- |
| `packages/core` | Framework-agnostic TypeScript: sheet model, page layout, page codes, printable drawing (SVG), photo scanning, output. Scanning needs no DOM or React, so it runs in browsers, workers and Node. |
| `packages/core/test` | Unit tests and a synthetic "printer + phone camera" simulator (perspective, curl, shadows, blur, noise, hand marks and handwriting). |
| `packages/core/bench` | Benchmarks built on the simulator. |
| `apps/web` | The React + Mantine PWA. |
| `apps/web/scripts` | Makes the sample photos (`pnpm sample:photos`). |

### Commands

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
pnpm bench:text [photos]          # how well are letters and writing lines read?
pnpm sample:photos [--seed n]     # remake the sample photos behind "Try a sample photo"
```

The sample photos (`apps/web/public/sample/`) and their sheets (`apps/web/src/help/samples.json`) are made by `apps/web/scripts/sample-photos.ts`. It renders the printed page with real fonts ([resvg](https://github.com/linebender/resvg)), fills it in and photographs it with the test simulator, then scans the photo. It fails when a value comes out wrong without being flagged; another `--seed` gives other handwriting.

### Phones and HTTPS

On the local network (`http://<computer-ip>:5173`), phones can take photos with the camera app and scan them. Installing the app (PWA) and working offline need HTTPS, as does `localhost` on the phone itself. For those, deploy the build to any static host.

### Deploying

Pushes to `main` are typechecked, tested and deployed to GitHub Pages by `.github/workflows/pages.yml` (repository settings → Pages → Source: GitHub Actions).

To host the build elsewhere under a sub-path, set `BASE_PATH` when building, for example `BASE_PATH=/papercell/ pnpm build`.

## License

[MIT](LICENSE).

## Third-party code

`packages/core/src/vendor/js-aruco2` is [js-aruco2](https://github.com/damianofalcioni/js-aruco2) 2.0.0 (MIT), converted to an ES module; see its `LICENSE.txt`.
