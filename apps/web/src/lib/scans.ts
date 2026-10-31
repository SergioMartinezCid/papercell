/** Scanned pages kept on this device (IndexedDB), so that a reload or a closed tab does not lose them. */
import { createStore, del, entries, set } from 'idb-keyval';
import type { ScanSummary } from '../scan/types';

export interface StoredScan {
  id: string;
  name: string;
  addedAt: number;
  scan: ScanSummary;
  decisions: Record<string, boolean>;
  /** The straightened page (JPEG). */
  preview: Blob;
}

// A database of its own: idb-keyval only creates the object store when it creates the database.
const store = createStore('papercell-scans', 'scans');

/** Oldest first. */
export async function listScans(): Promise<StoredScan[]> {
  try {
    return (await entries<string, StoredScan>(store)).map(([, scan]) => scan).sort((a, b) => a.addedAt - b.addedAt);
  } catch {
    return [];
  }
}

export async function saveScan(scan: StoredScan): Promise<void> {
  try {
    await set(scan.id, scan, store);
  } catch {
    // Storage may be unavailable (private mode, full); scanning still works for this session.
  }
}

export async function deleteScan(id: string): Promise<void> {
  try {
    await del(id, store);
  } catch {
    // Ignore.
  }
}
