/** Corner markers (ArUco MIP 36h12) and QR code matrices. */
import QRCode from 'qrcode';
import { FRAME, MARKER_CELLS, MARKER_CODES } from './spec';

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
