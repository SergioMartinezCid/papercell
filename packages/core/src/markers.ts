/** Corner markers (ArUco MIP 36h12) and QR code matrices. */
import QRCode from 'qrcode';
import { FRAME } from './layout';

export const MARKER_DICTIONARY = 'ARUCO_MIP_36h12';
/** Marker side in cells: 6×6 data bits plus a one-cell black border. */
export const MARKER_CELLS = 8;

/**
 * The printed markers: codes 0–15 of the detector's dictionary, four corners for each paper format. Copied
 * here (a test checks that they match) so that printing does not load the detector.
 */
const MARKER_CODES = [
  0xd2b63a09d, 0x6001134e5, 0x1206fbe72, 0xff8ad6cb4, 0x85da9bc49, 0xb461afe9c, 0x6db51fe13, 0x5248c541f, 0x8f34503, 0x8ea462ece,
  0xeac2be76d, 0x1af615c44, 0xb48a49f27, 0x2e4e1283b, 0x78b1f2fa8, 0x27d34f57e,
];

export function markerId(formatCode: number, corner: number): number {
  return formatCode * 4 + corner;
}

/** Marker modules, `true` = black, row by row from the marker's top-left corner. */
export function markerMatrix(id: number): boolean[][] {
  const bits = MARKER_CELLS - 2;
  const code = MARKER_CODES[id]?.toString(2).padStart(bits * bits, '0');
  if (code === undefined) throw new RangeError(`No printed marker ${id}`);
  return Array.from({ length: MARKER_CELLS }, (_, y) =>
    Array.from({ length: MARKER_CELLS }, (_, x) => {
      if (x === 0 || y === 0 || x === MARKER_CELLS - 1 || y === MARKER_CELLS - 1) return true;
      return code[(y - 1) * bits + (x - 1)] === '0';
    }),
  );
}

/** QR modules for a page code, `true` = black. Throws when the code would not fit on the page. */
export function qrMatrix(text: string): boolean[][] {
  const qr = QRCode.create([{ data: text, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  if (size * FRAME.qrModule > FRAME.qrMax) throw new Error('The sheet is too complex for one page code');
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => qr.modules.get(r, c) === 1));
}
