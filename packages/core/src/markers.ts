/** Corner markers (ArUco MIP 36h12) and QR code matrices. */
import { AR } from './vendor/js-aruco2/aruco.js';
import QRCode from 'qrcode';
import { FRAME } from './layout';

export const MARKER_DICTIONARY = 'ARUCO_MIP_36h12';
/** Marker side in cells: 6×6 data bits plus a one-cell black border. */
export const MARKER_CELLS = 8;

let dictionary: InstanceType<typeof AR.Dictionary> | undefined;

export function markerId(formatCode: number, corner: number): number {
  return formatCode * 4 + corner;
}

/** Marker modules, `true` = black, row by row from the marker's top-left corner. */
export function markerMatrix(id: number): boolean[][] {
  dictionary ??= new AR.Dictionary(MARKER_DICTIONARY);
  const code = dictionary.codeList[id];
  const bits = MARKER_CELLS - 2;
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
