/** Clipboard writes and downloads that also work on plain-HTTP origins (e.g. a phone on the local network). */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back below.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export function downloadText(name: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Whether the system share sheet is available (phones and some computers, on HTTPS). */
export function canShare(): boolean {
  return typeof navigator.share === 'function' && window.isSecureContext;
}

/** Whether files can be shared too, not only text. */
export function canShareFiles(): boolean {
  try {
    return canShare() && navigator.canShare?.({ files: [csvFile('results.csv', '')] }) === true;
  } catch {
    return false;
  }
}

/** A CSV file, with a byte order mark so that Excel reads it as UTF-8. */
export function csvFile(name: string, text: string): File {
  return new File(['﻿', text], name, { type: 'text/csv' });
}

/** Opens the system share sheet: false if sharing failed, true if it was done or cancelled. */
export async function share(data: ShareData): Promise<boolean> {
  try {
    await navigator.share(data);
    return true;
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError';
  }
}
