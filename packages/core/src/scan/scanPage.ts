/** Photo of a printed page → which boxes are marked. */
import { gridCellRect, type PaperFormat } from '../layout';
import { decodePayload, PayloadError, sourceRowOf, type PagePayload } from '../payload';
import { boxInCell, paperFormatFromCode } from '../spec';
import { chooseThreshold, classify, type Threshold } from './classify';
import { detectMarkers, fitPageFrame, readPageCode } from './detect';
import { multiply, scaling } from './homography';
import { blockMean, toGray, type GrayImage, type RgbaImage } from './image';
import { readBoxes, type BoxReading, type BoxTarget } from './read';
import { flattenIllumination, pixelsPerMm, warpRegion } from './warp';

export interface ScanOptions {
  /** Resolution of the straightened page used for reading, in pixels per mm. */
  pxPerMm?: number;
}

export interface ReadBox extends BoxReading {
  marked: boolean;
  uncertain: boolean;
}

export interface PageScan {
  payload: PagePayload;
  format: PaperFormat;
  boxes: ReadBox[];
  threshold: Threshold;
  /** Straightened page with flattened lighting, sampled at `pxPerMm` from the paper's top-left corner. */
  page: GrayImage;
  pxPerMm: number;
  quality: { markers: number; reprojectionError: number; sourcePxPerMm: number };
}

/** `code-newer`: the page was printed with a newer print format than this scanner knows (update the app). */
export type ScanError = 'markers-not-found' | 'code-not-readable' | 'code-invalid' | 'code-newer' | 'format-mismatch';

export type ScanOutcome = { ok: true; scan: PageScan } | { ok: false; error: ScanError; markers: number };

export function scanPage(image: RgbaImage, options: ScanOptions = {}): ScanOutcome {
  const pxPerMm = options.pxPerMm ?? 6;
  const markers = detectMarkers(image);
  const frame = fitPageFrame(markers);
  if (!frame) return { ok: false, error: 'markers-not-found', markers: markers.length };

  const gray = toGray(image);
  const code = readPageCode(gray, frame);
  if (!code) return { ok: false, error: 'code-not-readable', markers: markers.length };
  let payload: PagePayload;
  try {
    payload = decodePayload(code);
  } catch (e) {
    const newer = e instanceof PayloadError && e.reason === 'newer';
    return { ok: false, error: newer ? 'code-newer' : 'code-invalid', markers: markers.length };
  }
  const format = paperFormatFromCode(payload.formatCode);
  if (!format || payload.formatCode !== frame.format.code) return { ok: false, error: 'format-mismatch', markers: markers.length };

  // Average blocks of pixels first when the photo is much sharper than needed (less noise, no aliasing).
  const sourcePxPerMm = pixelsPerMm(frame.pageToImage, format.width / 2, format.height / 2);
  const k = Math.max(1, Math.floor(sourcePxPerMm / (pxPerMm * 1.5)));
  const source = k > 1 ? blockMean(gray, k) : gray;
  const toSource = k > 1 ? multiply(scaling(1 / k), frame.pageToImage) : frame.pageToImage;

  const straight = warpRegion(source, toSource, { x: 0, y: 0, w: format.width, h: format.height }, pxPerMm);
  const page = flattenIllumination(straight, pxPerMm);

  const targets: BoxTarget[] = payload.boxes.map((b) => {
    const cell = gridCellRect(payload.grid, b.pageRow, b.col, b.rowSpan, b.colSpan);
    return { row: sourceRowOf(payload, b.pageRow), col: b.col, pageRow: b.pageRow, cell, box: boxInCell(cell, payload.version) };
  });
  const readings = readBoxes(page, pxPerMm, targets);
  const threshold = chooseThreshold(readings.map((r) => r.fill));
  const boxes = readings.map((r) => ({ ...r, ...classify(r.fill, threshold) }));

  return {
    ok: true,
    scan: {
      payload,
      format,
      boxes,
      threshold,
      page,
      pxPerMm,
      quality: { markers: frame.markers.length, reprojectionError: frame.reprojectionError, sourcePxPerMm },
    },
  };
}
