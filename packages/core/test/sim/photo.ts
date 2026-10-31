/** Simulates photographing a printed page with a phone: perspective, curl, light, blur and noise. */
import { applyHomography, invert, solveHomography } from '../../src/scan/homography';
import type { RgbaImage } from '../../src/scan/image';
import type { RgbImage } from './raster';
import { gaussian, pick, uniform, type Rng } from './random';

export interface PhotoParams {
  width: number;
  height: number;
  /** In-plane rotation of the page, degrees. */
  rotation: number;
  /** Random displacement of each page corner as a fraction of the page diagonal (perspective). */
  tilt: number;
  /** Fraction of the photo the page's long side covers. */
  coverage: number;
  /** Paper bending amplitude, mm. */
  curl: number;
  /** Darkest corner of the light gradient (1 = even light). */
  gradient: number;
  /** Strength of a soft shadow blob (0 = none). */
  softShadow: number;
  /** Factor of a hard-edged shadow over part of the page (1 = none). */
  hardShadow: number;
  /** Colour of the light. */
  tint: [number, number, number];
  blur: number;
  noise: number;
}

export function randomPhotoParams(rng: Rng, difficulty: 'easy' | 'hard'): PhotoParams {
  const hard = difficulty === 'hard';
  const portrait = rng() < 0.75;
  const long = Math.round(uniform(rng, 2400, 3200));
  const short = Math.round(long * 0.75);
  return {
    width: portrait ? short : long,
    height: portrait ? long : short,
    rotation: uniform(rng, -1, 1) * (hard ? 25 : 8) + (rng() < 0.2 ? pick(rng, [90, 180, 270]) : 0),
    tilt: uniform(rng, 0, hard ? 0.09 : 0.03),
    coverage: uniform(rng, hard ? 0.5 : 0.7, 0.95),
    curl: uniform(rng, 0, hard ? 2.5 : 0.8),
    gradient: uniform(rng, hard ? 0.45 : 0.8, 1),
    softShadow: rng() < 0.6 ? uniform(rng, 0, hard ? 0.55 : 0.2) : 0,
    hardShadow: hard && rng() < 0.4 ? uniform(rng, 0.5, 0.8) : 1,
    tint: [1, uniform(rng, 0.94, 1), uniform(rng, 0.82, 1)],
    blur: Math.round(uniform(rng, 0, hard ? 2.4 : 1.2)),
    noise: uniform(rng, 0.005, hard ? 0.04 : 0.015),
  };
}

export function photograph(page: RgbImage, pagePxPerMm: number, params: PhotoParams, rng: Rng): RgbaImage {
  const { width, height } = params;
  const pw = page.width;
  const ph = page.height;
  // Fit the (rotated) page into the frame, then disturb its corners for perspective.
  const theta = (params.rotation * Math.PI) / 180;
  const rotW = Math.abs(pw * Math.cos(theta)) + Math.abs(ph * Math.sin(theta));
  const rotH = Math.abs(pw * Math.sin(theta)) + Math.abs(ph * Math.cos(theta));
  const scale = params.coverage * Math.min(width / rotW, height / rotH);
  const cx = width / 2 + uniform(rng, -0.05, 0.05) * width;
  const cy = height / 2 + uniform(rng, -0.05, 0.05) * height;
  const diag = Math.hypot(pw, ph) * scale;
  const corners = [
    [0, 0],
    [pw, 0],
    [pw, ph],
    [0, ph],
  ].map(([x, y]) => {
    const dx = (x - pw / 2) * scale;
    const dy = (y - ph / 2) * scale;
    return {
      x: cx + dx * Math.cos(theta) - dy * Math.sin(theta) + uniform(rng, -1, 1) * params.tilt * diag,
      y: cy + dx * Math.sin(theta) + dy * Math.cos(theta) + uniform(rng, -1, 1) * params.tilt * diag,
    };
  });
  const toPhoto = solveHomography(
    [
      { x: 0, y: 0 },
      { x: pw, y: 0 },
      { x: pw, y: ph },
      { x: 0, y: ph },
    ],
    corners,
  );
  const toPage = invert(toPhoto);

  const curlPx = params.curl * pagePxPerMm;
  const shadowCentre = { x: uniform(rng, 0, width), y: uniform(rng, 0, height) };
  const shadowRadius = uniform(rng, 0.2, 0.5) * Math.max(width, height);
  const edgeAngle = uniform(rng, 0, 2 * Math.PI);
  const edgeOffset = uniform(rng, -0.3, 0.3) * width;
  const gradAngle = uniform(rng, 0, 2 * Math.PI);
  const table = [uniform(rng, 0.25, 0.45), uniform(rng, 0.2, 0.35), uniform(rng, 0.12, 0.25)];

  const rgb = new Float32Array(width * height * 3);
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const q = applyHomography(toPage, u + 0.5, v + 0.5);
      const o = (v * width + u) * 3;
      // Bend: rows sag towards the middle of the page.
      const y = q.y + curlPx * Math.sin((Math.PI * q.x) / pw);
      if (q.x < 0 || y < 0 || q.x >= pw || y >= ph) {
        rgb[o] = table[0];
        rgb[o + 1] = table[1];
        rgb[o + 2] = table[2];
        continue;
      }
      samplePage(page, q.x, y, rgb, o);
    }
  }

  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const nx = u / width - 0.5;
      const ny = v / height - 0.5;
      const g = (nx * Math.cos(gradAngle) + ny * Math.sin(gradAngle)) / Math.SQRT1_2;
      let light = params.gradient + (1 - params.gradient) * (0.5 + 0.5 * g);
      const d2 = ((u - shadowCentre.x) ** 2 + (v - shadowCentre.y) ** 2) / shadowRadius ** 2;
      light *= 1 - params.softShadow * Math.exp(-d2);
      if (params.hardShadow < 1) {
        const side = (u - width / 2) * Math.cos(edgeAngle) + (v - height / 2) * Math.sin(edgeAngle) - edgeOffset;
        const t = Math.min(1, Math.max(0, side / 12 + 0.5));
        light *= 1 - (1 - params.hardShadow) * t;
      }
      const o = (v * width + u) * 3;
      for (let c = 0; c < 3; c++) rgb[o + c] *= light * params.tint[c];
    }
  }

  const blurred = params.blur > 0 ? boxBlurRgb(rgb, width, height, params.blur) : rgb;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < blurred.length; i += 3, j += 4) {
    for (let c = 0; c < 3; c++) data[j + c] = (blurred[i + c] + gaussian(rng) * params.noise) * 255;
    data[j + 3] = 255;
  }
  return { width, height, data };
}

function samplePage(page: RgbImage, x: number, y: number, out: Float32Array, o: number): void {
  const fx = Math.max(0, x - 0.5);
  const fy = Math.max(0, y - 0.5);
  const x0 = Math.min(page.width - 1, Math.floor(fx));
  const y0 = Math.min(page.height - 1, Math.floor(fy));
  const x1 = Math.min(page.width - 1, x0 + 1);
  const y1 = Math.min(page.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const d = page.data;
  for (let c = 0; c < 3; c++) {
    const a = d[(y0 * page.width + x0) * 3 + c] * (1 - tx) + d[(y0 * page.width + x1) * 3 + c] * tx;
    const b = d[(y1 * page.width + x0) * 3 + c] * (1 - tx) + d[(y1 * page.width + x1) * 3 + c] * tx;
    out[o + c] = a * (1 - ty) + b * ty;
  }
}

function boxBlurRgb(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += src[(y * width + Math.min(width - 1, Math.max(0, x + k))) * 3 + c];
        tmp[(y * width + x) * 3 + c] = s / n;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += tmp[(Math.min(height - 1, Math.max(0, y + k)) * width + x) * 3 + c];
        out[(y * width + x) * 3 + c] = s / n;
      }
    }
  }
  return out;
}
