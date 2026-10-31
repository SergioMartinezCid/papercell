/** Finding the corner markers and reading the page code. */
import { AR } from '../vendor/js-aruco2/aruco.js';
import jsQR from 'jsqr';
import type { PaperFormat } from '../layout';
import { FRAME, MARKER_CODES, MARKER_DICTIONARY, markerRect, paperFormatFromCode, qrSearchRect } from '../spec';
import { solveHomography, applyHomography, type Homography } from './homography';
import { createGray, downscaleRgba, grayToRgba, type GrayImage, type Point, type RgbaImage } from './image';
import { boxBlur, flattenIllumination, warpRegion } from './warp';

export interface FoundMarker {
  formatCode: number;
  corner: number;
  /** Marker corners in image pixels, in the marker's own order: top-left, top-right, bottom-right, bottom-left. */
  corners: Point[];
  hamming: number;
}

export interface PageFrame {
  format: PaperFormat;
  markers: FoundMarker[];
  /** Maps paper millimetres to image pixels. */
  pageToImage: Homography;
  /** Mean distance between detected and re-projected marker corners, in image pixels. */
  reprojectionError: number;
}

/** Accept up to 3 wrong bits out of 36: strict enough to rule out boxes and text. */
const MAX_HAMMING = 4;
const DETECTION_SIZES = [1600, 2400, 1000];

let detector: InstanceType<typeof AR.Detector> | undefined;

export function detectMarkers(img: RgbaImage): FoundMarker[] {
  detector ??= new AR.Detector({ dictionaryName: MARKER_DICTIONARY, maxHammingDistance: MAX_HAMMING });
  let best: FoundMarker[] = [];
  for (const size of DETECTION_SIZES) {
    const { image, factor } = downscaleRgba(img, size);
    const found = detector
      .detect(image)
      .filter((m) => m.id < MARKER_CODES.length)
      .map((m) => ({
        formatCode: Math.floor(m.id / 4),
        corner: m.id % 4,
        corners: m.corners.map((p) => ({ x: (p.x + 0.5) * factor, y: (p.y + 0.5) * factor })),
        hamming: m.hammingDistance,
      }));
    const picked = pickMarkers(found);
    if (picked.length > best.length) best = picked;
    if (best.length === 4) break;
    if (factor === 1) break;
  }
  return best;
}

/** Keeps the paper format seen most often and one marker per corner. */
function pickMarkers(found: FoundMarker[]): FoundMarker[] {
  const votes = new Map<number, number>();
  for (const m of found) votes.set(m.formatCode, (votes.get(m.formatCode) ?? 0) + 1);
  const format = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const byCorner = new Map<number, FoundMarker>();
  for (const m of found) {
    if (m.formatCode !== format) continue;
    const current = byCorner.get(m.corner);
    if (!current || m.hamming < current.hamming) byCorner.set(m.corner, m);
  }
  return [...byCorner.values()].sort((a, b) => a.corner - b.corner);
}

/** Fits the page from at least three markers; returns null when the markers are inconsistent. */
export function fitPageFrame(markers: FoundMarker[]): PageFrame | null {
  if (markers.length < 3) return null;
  const format = paperFormatFromCode(markers[0].formatCode);
  if (!format) return null;
  const fit = (subset: FoundMarker[]) => {
    const paper: Point[] = [];
    const image: Point[] = [];
    for (const m of subset) {
      const r = markerRect(format, m.corner);
      paper.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h });
      image.push(...m.corners);
    }
    const pageToImage = solveHomography(paper, image);
    const error =
      paper.reduce((s, p, i) => {
        const q = applyHomography(pageToImage, p.x, p.y);
        return s + Math.hypot(q.x - image[i].x, q.y - image[i].y);
      }, 0) / paper.length;
    return { format, markers: subset, pageToImage, reprojectionError: error };
  };
  let frame = fit(markers);
  // A single misplaced marker shows up as a large error: try dropping each one.
  const markerSide = averageSide(markers);
  if (markers.length === 4 && frame.reprojectionError > markerSide * 0.08) {
    for (let skip = 0; skip < 4; skip++) {
      const candidate = fit(markers.filter((_, i) => i !== skip));
      if (candidate.reprojectionError < frame.reprojectionError) frame = candidate;
    }
  }
  return frame.reprojectionError <= markerSide * 0.15 ? frame : null;
}

function averageSide(markers: FoundMarker[]): number {
  let total = 0;
  for (const m of markers) {
    for (let i = 0; i < 4; i++) {
      const a = m.corners[i];
      const b = m.corners[(i + 1) % 4];
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return total / (markers.length * 4);
}

/** Reads the QR page code next to the top-right marker; null when it cannot be decoded. */
export function readPageCode(gray: GrayImage, frame: PageFrame): string | null {
  const region = qrSearchRect(frame.format);
  const decode = (img: GrayImage) => {
    const rgba = grayToRgba(img);
    return jsQR(rgba.data as Uint8ClampedArray, rgba.width, rgba.height, { inversionAttempts: 'dontInvert' })?.data || null;
  };
  for (const pxPerMm of [8, 11]) {
    const raw = warpRegion(gray, frame.pageToImage, region, pxPerMm);
    // Plain first; then with even lighting and sharpened edges, for blurry or shadowed photos.
    const found = decode(raw) ?? decode(sharpen(flattenIllumination(raw, pxPerMm), pxPerMm * FRAME.qrModule));
    if (found) return found;
  }
  return null;
}

/** Unsharp mask with a blur about one QR module wide. */
function sharpen(img: GrayImage, modulePx: number): GrayImage {
  const radius = Math.max(1, Math.round(modulePx / 2));
  const blurred = boxBlur(img, radius);
  const out = createGray(img.width, img.height);
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i] + 1.5 * (img.data[i] - blurred.data[i]);
    out.data[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}
