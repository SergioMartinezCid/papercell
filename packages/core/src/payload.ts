/**
 * The page code: everything the scanner needs to read a page, packed into a QR code. Bytes are
 * Base45-encoded so the QR code can use its compact alphanumeric mode.
 */
import type { PageGrid, PageLayout, Template } from './layout';

export const PAYLOAD_VERSION = 1;

export interface PayloadBox {
  pageRow: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface PagePayload {
  version: number;
  /** 32-bit fingerprint of the template the page was printed from. */
  templateId: number;
  pageIndex: number;
  pageCount: number;
  formatCode: number;
  /** Zero-based position of the range in its spreadsheet. */
  anchorRow: number;
  anchorCol: number;
  /** Size of the whole source range. */
  sourceRows: number;
  sourceCols: number;
  grid: PageGrid;
  /** Leading page rows that map to source rows 0..headerRows-1. */
  headerRows: number;
  /** Source row of the first page row after the header. */
  bodyStart: number;
  boxes: PayloadBox[];
}

export function pagePayload(template: Template, page: PageLayout, templateId: number): PagePayload {
  return {
    version: PAYLOAD_VERSION,
    templateId,
    pageIndex: page.index,
    pageCount: page.count,
    formatCode: page.format.code,
    anchorRow: template.anchor.row,
    anchorCol: template.anchor.col,
    sourceRows: template.sheet.rowHeights.length,
    sourceCols: template.sheet.colWidths.length,
    grid: page.grid,
    headerRows: page.headerRows,
    bodyStart: page.rows[page.headerRows] ?? page.rows.length,
    boxes: page.boxes.map(({ pageRow, col, rowSpan, colSpan }) => ({ pageRow, col, rowSpan, colSpan })),
  };
}

/** Source row shown on a page row. */
export function sourceRowOf(payload: PagePayload, pageRow: number): number {
  return pageRow < payload.headerRows ? pageRow : payload.bodyStart + pageRow - payload.headerRows;
}

export function encodePayload(p: PagePayload): string {
  const w = new ByteWriter();
  w.u8(p.version);
  w.u32(p.templateId);
  for (const v of [p.pageIndex, p.pageCount, p.formatCode, p.anchorRow, p.anchorCol, p.sourceRows, p.sourceCols]) w.varint(v);
  w.varint(p.grid.originX);
  w.varint(p.grid.originY);
  for (let c = 0; c < p.sourceCols; c++) w.varint(p.grid.colEdges[c + 1] - p.grid.colEdges[c]);

  const rowCount = p.grid.rowEdges.length - 1;
  w.varint(rowCount);
  const heights = Array.from({ length: rowCount }, (_, r) => p.grid.rowEdges[r + 1] - p.grid.rowEdges[r]);
  for (const [run, value] of runs(heights.map(String))) {
    w.varint(run);
    w.varint(Number(value));
  }
  w.varint(p.headerRows);
  w.varint(p.bodyStart);

  const maskBytes = Math.ceil(p.sourceCols / 8);
  const rowMasks = Array.from({ length: rowCount }, () => new Uint8Array(maskBytes));
  for (const b of p.boxes) rowMasks[b.pageRow][b.col >> 3] |= 1 << (b.col & 7);
  for (const [run, value] of runs(rowMasks.map((m) => Array.from(m).join(',')))) {
    w.varint(run);
    for (const byte of value.split(',')) w.u8(Number(byte));
  }
  const spanned = p.boxes.filter((b) => b.rowSpan > 1 || b.colSpan > 1);
  w.varint(spanned.length);
  for (const b of spanned) for (const v of [b.pageRow, b.col, b.rowSpan, b.colSpan]) w.varint(v);
  return base45Encode(w.bytes());
}

export function decodePayload(text: string): PagePayload {
  const r = new ByteReader(base45Decode(text));
  const version = r.u8();
  if (version !== PAYLOAD_VERSION) throw new PayloadError(`Unsupported page code version ${version}`);
  const templateId = r.u32();
  const [pageIndex, pageCount, formatCode, anchorRow, anchorCol, sourceRows, sourceCols] = Array.from({ length: 7 }, () => r.varint());
  const originX = r.varint();
  const originY = r.varint();
  const colEdges = [0];
  for (let c = 0; c < sourceCols; c++) colEdges.push(colEdges[c] + r.varint());

  const rowCount = r.varint();
  const rowEdges = [0];
  while (rowEdges.length - 1 < rowCount) {
    const run = r.varint();
    const height = r.varint();
    if (run === 0 || rowEdges.length - 1 + run > rowCount) throw new PayloadError('Corrupt row heights');
    for (let i = 0; i < run; i++) rowEdges.push(rowEdges[rowEdges.length - 1] + height);
  }
  const headerRows = r.varint();
  const bodyStart = r.varint();

  const maskBytes = Math.ceil(sourceCols / 8);
  const boxes: PayloadBox[] = [];
  let pageRow = 0;
  while (pageRow < rowCount) {
    const run = r.varint();
    if (run === 0 || pageRow + run > rowCount) throw new PayloadError('Corrupt box mask');
    const mask = Array.from({ length: maskBytes }, () => r.u8());
    for (let i = 0; i < run; i++, pageRow++) {
      for (let col = 0; col < sourceCols; col++) {
        if (mask[col >> 3] & (1 << (col & 7))) boxes.push({ pageRow, col, rowSpan: 1, colSpan: 1 });
      }
    }
  }
  const spannedCount = r.varint();
  for (let i = 0; i < spannedCount; i++) {
    const [row, col, rowSpan, colSpan] = [r.varint(), r.varint(), r.varint(), r.varint()];
    const box = boxes.find((b) => b.pageRow === row && b.col === col);
    if (box) Object.assign(box, { rowSpan, colSpan });
  }
  return {
    version,
    templateId,
    pageIndex,
    pageCount,
    formatCode,
    anchorRow,
    anchorCol,
    sourceRows,
    sourceCols,
    grid: { originX, originY, colEdges, rowEdges },
    headerRows,
    bodyStart,
    boxes,
  };
}

export class PayloadError extends Error {}

/** Run-length groups of equal consecutive values. */
function runs(values: string[]): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
}

class ByteWriter {
  private data: number[] = [];
  u8(v: number) {
    this.data.push(v & 0xff);
  }
  u32(v: number) {
    for (let i = 0; i < 4; i++) this.u8(v >>> (8 * i));
  }
  varint(v: number) {
    if (!Number.isInteger(v) || v < 0) throw new PayloadError(`Cannot encode ${v}`);
    do {
      const byte = v & 0x7f;
      v = Math.floor(v / 128);
      this.u8(v > 0 ? byte | 0x80 : byte);
    } while (v > 0);
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.data);
  }
}

class ByteReader {
  private pos = 0;
  constructor(private data: Uint8Array) {}
  u8(): number {
    if (this.pos >= this.data.length) throw new PayloadError('Page code is truncated');
    return this.data[this.pos++];
  }
  u32(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) v += this.u8() * 2 ** (8 * i);
    return v;
  }
  varint(): number {
    let v = 0;
    let factor = 1;
    for (;;) {
      const byte = this.u8();
      v += (byte & 0x7f) * factor;
      if (!(byte & 0x80)) return v;
      factor *= 128;
    }
  }
}

const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Base45 (RFC 9285): its alphabet is exactly the QR alphanumeric character set. */
export function base45Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let n = bytes[i] * 256 + bytes[i + 1];
      for (let k = 0; k < 3; k++) {
        out += B45[n % 45];
        n = Math.floor(n / 45);
      }
    } else {
      let n = bytes[i];
      out += B45[n % 45];
      n = Math.floor(n / 45);
      out += B45[n];
    }
  }
  return out;
}

export function base45Decode(text: string): Uint8Array {
  const values = Array.from(text, (ch) => {
    const v = B45.indexOf(ch);
    if (v < 0) throw new PayloadError('Not a page code');
    return v;
  });
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 3) {
    const chunk = values.slice(i, i + 3);
    if (chunk.length === 3) {
      const n = chunk[0] + chunk[1] * 45 + chunk[2] * 2025;
      if (n > 0xffff) throw new PayloadError('Not a page code');
      out.push(n >> 8, n & 0xff);
    } else if (chunk.length === 2) {
      const n = chunk[0] + chunk[1] * 45;
      if (n > 0xff) throw new PayloadError('Not a page code');
      out.push(n);
    } else {
      throw new PayloadError('Not a page code');
    }
  }
  return Uint8Array.from(out);
}

/** 32-bit FNV-1a hash of a string. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function templateFingerprint(template: Template): number {
  return fnv1a(JSON.stringify([template.sheet, template.overrides, template.settings, template.anchor]));
}

export function templateIdHex(id: number): string {
  return id.toString(16).padStart(8, '0');
}
