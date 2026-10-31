/** Reads photos off the main thread so the page stays responsive. */
import { grayToRgba, scanPage } from '@papercell/core';
import type { WorkerRequest, WorkerResponse } from './types';

/** Phone photos are larger than needed; this keeps memory use reasonable. */
const MAX_SIDE = 3200;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, file } = e.data;
  const post = (message: WorkerResponse) => scope.postMessage(message);
  let image: ImageData;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const ctx = new OffscreenCanvas(width, height).getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    image = ctx.getImageData(0, 0, width, height);
  } catch {
    post({ id, ok: false, error: 'unreadable-image' });
    return;
  }

  const outcome = scanPage({ width: image.width, height: image.height, data: image.data });
  if (!outcome.ok) {
    post({ id, ok: false, error: outcome.error });
    return;
  }
  const { page, ...scan } = outcome.scan;
  const rgba = grayToRgba(page);
  const canvas = new OffscreenCanvas(rgba.width, rgba.height);
  canvas.getContext('2d')!.putImageData(new ImageData(rgba.data as Uint8ClampedArray<ArrayBuffer>, rgba.width, rgba.height), 0, 0);
  const preview = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  post({ id, ok: true, scan, preview });
};
