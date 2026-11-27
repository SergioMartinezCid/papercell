/**
 * Notes in an .xlsx file, read from the file itself. ExcelJS reads a note only when its cell is saved with a
 * value or formatting, and Excel saves a cell that has nothing but a note without either: a token in the
 * note of an empty cell would be lost.
 *
 * An .xlsx file is a zip of XML files: `xl/workbook.xml` names the sheets, relationship files (`.rels`)
 * link each sheet to its notes, and those are in `xl/commentsN.xml`, cell by cell.
 *
 * Needs `DOMParser` and `DecompressionStream`, as browsers have them.
 */

/** Notes by sheet name, then by cell address (`G3`). Rejects when the file is not a zip. */
export async function notesFromXlsx(data: ArrayBuffer): Promise<Map<string, Map<string, string>>> {
  const read = openZip(data);
  const xml = async (name: string) => {
    const text = await read(name);
    return text === null ? null : new DOMParser().parseFromString(text, 'application/xml');
  };
  const out = new Map<string, Map<string, string>>();
  const workbook = await xml('xl/workbook.xml');
  if (!workbook) return out;
  const sheetPaths = await relationships('xl/workbook.xml', xml);
  for (const sheet of Array.from(workbook.getElementsByTagName('sheet'))) {
    const name = sheet.getAttribute('name');
    const path = sheetPaths.get(sheet.getAttribute('r:id') ?? sheet.getAttributeNS(RELATIONSHIPS_NS, 'id') ?? '');
    if (!name || !path) continue;
    const notes = new Map<string, string>();
    for (const [, target] of await relationships(path, xml, '/comments')) {
      const comments = await xml(target);
      for (const comment of Array.from(comments?.getElementsByTagName('comment') ?? [])) {
        const ref = comment.getAttribute('ref');
        const text = textOf(comment).trim();
        if (ref && text) notes.set(ref.toUpperCase(), text);
      }
    }
    if (notes.size) out.set(name, notes);
  }
  return out;
}

const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** The targets of a part's relationships by id, as paths in the zip, only of a type ending in `type`. */
async function relationships(part: string, xml: (name: string) => Promise<Document | null>, type = ''): Promise<Map<string, string>> {
  const slash = part.lastIndexOf('/');
  const rels = await xml(`${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`);
  const out = new Map<string, string>();
  for (const rel of Array.from(rels?.getElementsByTagName('Relationship') ?? [])) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target && (rel.getAttribute('Type') ?? '').endsWith(type)) out.set(id, resolvePath(part, target));
  }
  return out;
}

/** `target` as a path in the zip: relative to the folder of `part`, or from the root when it starts with `/`. */
function resolvePath(part: string, target: string): string {
  const parts = target.startsWith('/') ? [] : part.split('/').slice(0, -1);
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

/** The text of a note: its runs (`<t>`), without the phonetic guides (`<rPh>`) some languages add. */
function textOf(comment: Element): string {
  return Array.from(comment.getElementsByTagName('t'))
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('');
}

/** Reads files out of a zip: the text of a file by its name, or null when it is not there. */
function openZip(data: ArrayBuffer): (name: string) => Promise<string | null> {
  const view = new DataView(data);
  // The end of the central directory: the last 22 bytes, unless the zip has a comment after them.
  let end = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip file');
  const entries = new Map<string, { method: number; size: number; offset: number }>();
  const decoder = new TextDecoder();
  let p = view.getUint32(end + 16, true);
  for (let n = view.getUint16(end + 10, true); n > 0 && view.getUint32(p, true) === 0x02014b50; n--) {
    const nameLength = view.getUint16(p + 28, true);
    const name = decoder.decode(new Uint8Array(data, p + 46, nameLength));
    entries.set(name, { method: view.getUint16(p + 10, true), size: view.getUint32(p + 20, true), offset: view.getUint32(p + 42, true) });
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return async (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    // The local header repeats the name and has extra data of its own before the file.
    const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    const bytes = new Uint8Array(data, start, entry.size);
    if (entry.method === 0) return decoder.decode(bytes);
    if (entry.method !== 8) return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  };
}
