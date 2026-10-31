/** Reads photos off the main thread so the page stays responsive. */
import { grayToRgba, scanPage, type GrayImage } from '@papercell/core';
import type { WorkerRequest, WorkerResponse } from './types';

/** Phone photos are larger than needed; this keeps memory use reasonable. */
const MAX_SIDE = 3200;
/** Longest side of the thumbnail shown when a photo cannot be read. */
const THUMB_SIDE = 480;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, file } = e.data;
  const post = (message: WorkerResponse) => scope.postMessage(message);
  let ctx: OffscreenCanvasRenderingContext2D;
  let image: ImageData;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    ctx = new OffscreenCanvas(width, height).getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    image = ctx.getImageData(0, 0, width, height);
  } catch {
    post({ id, ok: false, error: 'unreadable-image' });
    return;
  }

  const outcome = scanPage({ width: image.width, height: image.height, data: image.data });
  if (!outcome.ok) {
    // What the scanner saw: the page code area when the page was found, otherwise the whole photo.
    const thumb = outcome.codeArea ? await grayToJpeg(outcome.codeArea) : await shrink(ctx.canvas);
    post({ id, ok: false, error: outcome.error, thumb });
    return;
  }
  const { page, ...scan } = outcome.scan;
  post({ id, ok: true, scan, preview: await grayToJpeg(page) });
};

function grayToJpeg(gray: GrayImage): Promise<Blob> {
  const rgba = grayToRgba(gray);
  const canvas = new OffscreenCanvas(rgba.width, rgba.height);
  canvas.getContext('2d')!.putImageData(new ImageData(rgba.data as Uint8ClampedArray<ArrayBuffer>, rgba.width, rgba.height), 0, 0);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
}

function shrink(source: OffscreenCanvas): Promise<Blob> {
  const scale = Math.min(1, THUMB_SIDE / Math.max(source.width, source.height));
  const canvas = new OffscreenCanvas(Math.round(source.width * scale), Math.round(source.height * scale));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}
