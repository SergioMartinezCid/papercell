/** Templates kept on this device (IndexedDB), most recent first. */
import { templateFingerprint, type Template } from '@papercell/core';
import { createStore, get, set } from 'idb-keyval';

export interface StoredTemplate {
  /** Fingerprint printed in the page codes. */
  id: number;
  savedAt: number;
  template: Template;
}

const store = createStore('papercell', 'templates');
const KEY = 'recent';
const KEEP = 30;

export async function listTemplates(): Promise<StoredTemplate[]> {
  try {
    return (await get<StoredTemplate[]>(KEY, store)) ?? [];
  } catch {
    return [];
  }
}

/** Saves a template as the most recent one (replacing an identical earlier copy). */
export async function saveTemplate(template: Template): Promise<StoredTemplate[]> {
  const id = templateFingerprint(template);
  const list = (await listTemplates()).filter((t) => t.id !== id);
  const next = [{ id, savedAt: Date.now(), template }, ...list].slice(0, KEEP);
  try {
    await set(KEY, next, store);
  } catch {
    // Storage may be unavailable (private mode); printing still works.
  }
  return next;
}

export async function deleteTemplate(id: number): Promise<StoredTemplate[]> {
  const next = (await listTemplates()).filter((t) => t.id !== id);
  try {
    await set(KEY, next, store);
  } catch {
    // Ignore.
  }
  return next;
}

export async function findTemplate(id: number): Promise<StoredTemplate | undefined> {
  return (await listTemplates()).find((t) => t.id === id);
}
