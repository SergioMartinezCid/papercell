/** Runs scans in a worker, one photo at a time (phone photos use a lot of memory). */
import type { WorkerRequest, WorkerResponse } from './types';

let worker: Worker | null = null;
const waiting = new Map<string, (r: WorkerResponse) => void>();
let queue: Promise<unknown> = Promise.resolve();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  }
  return worker;
}

export function scanImage(id: string, file: Blob): Promise<WorkerResponse> {
  const run = () =>
    new Promise<WorkerResponse>((resolve) => {
      waiting.set(id, resolve);
      getWorker().postMessage({ id, file } satisfies WorkerRequest);
    });
  const result = queue.then(run, run);
  queue = result;
  return result;
}
