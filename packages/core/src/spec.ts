/**
 * The print format: what the scanner assumes about a printed page beyond what the page code (QR) says.
 *
 * Pages that are already printed must keep scanning, so none of these values may change.
 * - The frame (paper sizes, corner markers, where the page code is) is how the scanner finds and reads the page
 *   code, so every version shares it.
 * - What comes after the page code belongs to a print format version, which is the code's first byte: the code's
 *   byte layout (see `decodePayload`) and the box geometry below. To change either, add a version and keep the
 *   old one, so pages printed earlier still scan.
 *
 * `test/compat.test.ts` scans pages printed by every earlier version (`test/fixtures/v<n>/`) to check this.
 */
import type { Orientation, PaperFormat, PaperSize, Rect } from './layout';

/** The version new pages are printed with. */
export const PRINT_VERSION = 1;

/** Paper formats by code (0–3); the code also selects the marker ids. */
const PAPER_FORMATS: ReadonlyArray<{ paper: PaperSize; orientation: Orientation }> = [
  { paper: 'a4', orientation: 'portrait' },
  { paper: 'a4', orientation: 'landscape' },
  { paper: 'letter', orientation: 'portrait' },
  { paper: 'letter', orientation: 'landscape' },
];

/** Portrait width and height in mm. */
const PAPER_MM: Record<PaperSize, readonly [number, number]> = { a4: [210, 297], letter: [215.9, 279.4] };

export function paperFormat(paper: PaperSize, orientation: Orientation): PaperFormat {
  const [w, h] = PAPER_MM[paper];
  const landscape = orientation === 'landscape';
  return {
    code: PAPER_FORMATS.findIndex((f) => f.paper === paper && f.orientation === orientation),
    paper,
    orientation,
    width: landscape ? h : w,
    height: landscape ? w : h,
  };
}

export function paperFormatFromCode(code: number): PaperFormat | null {
  const format = PAPER_FORMATS[code];
  return format ? paperFormat(format.paper, format.orientation) : null;
}

/** Fixed frame around the content: corner markers, QR code and title. */
export const FRAME = {
  /** Paper edge to the outer edge of the markers. */
  margin: 8,
  /** Side of each corner marker. */
  marker: 14,
  /** Space between frame elements and the grid. */
  gap: 4,
  /** Side of one QR module. */
  qrModule: 1,
  /** Largest QR side the scanner looks for. */
  qrMax: 54,
} as const;

/** Corner order used for marker ids: id = format code * 4 + corner. */
export const CORNERS = ['tl', 'tr', 'br', 'bl'] as const;

export function markerId(formatCode: number, corner: number): number {
  return formatCode * 4 + corner;
}

export function markerRect(format: PaperFormat, corner: number): Rect {
  const { margin, marker } = FRAME;
  const right = format.width - margin - marker;
  const bottom = format.height - margin - marker;
  const x = corner === 1 || corner === 2 ? right : margin;
  const y = corner === 2 || corner === 3 ? bottom : margin;
  return { x, y, w: marker, h: marker };
}

/** The QR code is right-aligned next to the top-right marker. */
export function qrRect(format: PaperFormat, side: number): Rect {
  const right = format.width - FRAME.margin - FRAME.marker - FRAME.gap;
  return { x: right - side, y: FRAME.margin, w: side, h: side };
}

/** Where the scanner searches for the QR code (it does not know the code's size beforehand). */
export function qrSearchRect(format: PaperFormat): Rect {
  const right = format.width - FRAME.margin - FRAME.marker - FRAME.gap;
  const pad = 3;
  return { x: right - FRAME.qrMax - pad, y: FRAME.margin - pad, w: FRAME.qrMax + 2 * pad, h: FRAME.qrMax + 2 * pad };
}

export const MARKER_DICTIONARY = 'ARUCO_MIP_36h12';
/** Marker side in cells: 6×6 data bits plus a one-cell black border. */
export const MARKER_CELLS = 8;
/**
 * The printed markers: codes 0–15 of the detector's dictionary, four corners for each paper format. Copied
 * here (a test checks that they match) so that printing does not load the detector.
 */
export const MARKER_CODES: readonly number[] = [
  0xd2b63a09d, 0x6001134e5, 0x1206fbe72, 0xff8ad6cb4, 0x85da9bc49, 0xb461afe9c, 0x6db51fe13, 0x5248c541f, 0x8f34503, 0x8ea462ece,
  0xeac2be76d, 0x1af615c44, 0xb48a49f27, 0x2e4e1283b, 0x78b1f2fa8, 0x27d34f57e,
];

/** Box drawn in each cell, by print format version: a square centred in the cell. */
const BOX_GEOMETRY: Record<number, { fraction: number; max: number }> = {
  1: { fraction: 0.68, max: 7 },
};

/** The printed box of a cell. Shared by printing and scanning. */
export function boxInCell(cell: Rect, version: number = PRINT_VERSION): Rect {
  const geometry = BOX_GEOMETRY[version];
  if (!geometry) throw new RangeError(`Unknown print format version ${version}`);
  const side = Math.min(Math.min(cell.w, cell.h) * geometry.fraction, geometry.max);
  return { x: cell.x + (cell.w - side) / 2, y: cell.y + (cell.h - side) / 2, w: side, h: side };
}
