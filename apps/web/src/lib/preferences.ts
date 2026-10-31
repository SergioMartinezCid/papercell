/** Small per-device preferences in localStorage; failures (private mode, blocked storage) are ignored. */
const PREFIX = 'papercell.';

export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not critical.
  }
}

export function readJsonPreference<T>(key: string, fallback: T): T {
  const raw = readPreference(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}
