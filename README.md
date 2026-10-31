# Papercell

Turn a spreadsheet range into a printable sheet, mark it by hand, photograph it, and get the marks back as cells.

1. **Prepare** (computer): copy a range in Google Sheets, Excel or LibreOffice and paste it, or upload an `.xlsx`, `.csv` or `.tsv` file. Cells with text are printed as they are; empty cells become boxes. Print.
2. **Mark** the boxes on paper by filling them in.
3. **Scan** (phone or computer): take a photo, or drop, paste or choose an image. Papercell finds the page, reads every box and flags the ones it is unsure about for a quick check.
4. **Paste** the result back into the spreadsheet: copy it (tab-separated, ready to paste) or download a CSV.

This is optical mark recognition (OMR) rather than OCR: deciding whether a known box is filled in is far more reliable than reading handwriting.

Everything runs in the browser. Photos and sheets never leave the device.

## How a sheet is read

Every printed page carries four [ArUco](https://www.uco.es/investiga/grupos/ava/portfolio/aruco/) corner markers and a QR code. The QR code describes the page: grid geometry, which cells are boxes, page number and where the range sits in the spreadsheet. Any device can scan any printed page without having the original sheet.

Scanning a photo:

1. Find the corner markers and fit a homography (perspective correction).
2. Read the QR page code.
3. Straighten the page and even out its lighting (morphological closing, which also removes hard shadow edges).
4. Snap each box to its printed outline. This absorbs paper curl, and boxes that cannot be snapped borrow the shift of their neighbours.
5. Measure the ink inside every box and split marked from empty per page. Values close to the threshold are flagged for review rather than guessed.

## Cell kinds and future OCR

`classifyCells` gives every cell a kind: `text` (printed, never read), `mark` (a box) or `blank`. The kinds flow through the layout, the page code and the reader, so a new kind can be added in the same places. For example, `write` would be a handwriting area read by OCR, with the review screen showing the crop next to the suggested value.

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
```

### Phones and HTTPS

On the local network (`http://<computer-ip>:5173`), phones can take photos with the camera app and scan them. Installing the app (PWA) and working offline need HTTPS, as does `localhost` on the phone itself, so for that, deploy the build to any static host.

### Deploying under a sub-path

Set `BASE_PATH` when building, for example `BASE_PATH=/papercell/ pnpm build` for a GitHub Pages project site.

## Third-party code

`packages/core/src/vendor/js-aruco2` is [js-aruco2](https://github.com/damianofalcioni/js-aruco2) 2.0.0 (MIT), converted to an ES module; see its `LICENSE.txt`.
