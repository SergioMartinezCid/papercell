/**
 * Printable pages as a list of simple shapes in millimetres, so the same page can be rendered as SVG
 * for printing or rasterised directly (e.g. for synthetic tests).
 */
import {
  FRAME,
  CORNERS,
  layoutSheet,
  markerRect,
  qrRect,
  type PageLayout,
  type Rect,
  type SheetLayout,
  type Template,
} from './layout';
import { markerId, markerMatrix, qrMatrix, MARKER_CELLS } from './markers';
import { encodePayload, pagePayload, templateFingerprint, type PagePayload } from './payload';
import { DEFAULT_FONT_SIZE } from './sheet';

export type Shape =
  | ({ kind: 'rect'; fill: string } & Rect)
  | ({ kind: 'frame'; stroke: string; width: number } & Rect)
  | ({
      kind: 'text';
      text: string;
      /** Font size in mm. */
      size: number;
      bold: boolean;
      italic: boolean;
      align: 'left' | 'center' | 'right';
      color: string;
      /** Horizontal padding inside the rect, in mm. */
      pad: number;
    } & Rect)
  | { kind: 'modules'; x: number; y: number; module: number; matrix: boolean[][] };

export interface PageDrawing {
  width: number;
  height: number;
  shapes: Shape[];
}

export interface PrintablePage {
  layout: PageLayout;
  payload: PagePayload;
  code: string;
  drawing: PageDrawing;
}

export interface PrintableSheet {
  templateId: number;
  layout: SheetLayout;
  pages: PrintablePage[];
}

const GRID_COLOR = '#b7b7b7';
const BOX_COLOR = '#262626';
const BOX_STROKE = 0.3;
const PX_TO_PT = 72 / 96;

export function buildPrintable(template: Template): PrintableSheet {
  const templateId = templateFingerprint(template);
  // The header height depends on the QR size, which depends on the layout: settle in a few rounds.
  let qrSide = 29 * FRAME.qrModule;
  for (let round = 0; ; round++) {
    const layout = layoutSheet(template, qrSide);
    const codes = layout.pages.map((page) => {
      const payload = pagePayload(template, page, templateId);
      const code = encodePayload(payload);
      return { page, payload, code, matrix: qrMatrix(code) };
    });
    const side = Math.max(...codes.map((c) => c.matrix.length)) * FRAME.qrModule;
    if (side <= qrSide || round >= 3) {
      return {
        templateId,
        layout,
        pages: codes.map(({ page, payload, code, matrix }) => ({
          layout: page,
          payload,
          code,
          drawing: drawPage(template, page, matrix),
        })),
      };
    }
    qrSide = side;
  }
}

export function drawPage(template: Template, page: PageLayout, qr: boolean[][]): PageDrawing {
  const { settings } = template;
  const shapes: Shape[] = [];

  for (const cell of page.cells) {
    const bg = cell.style?.background;
    if (bg && isPrintedBackground(bg) && (settings.backgrounds === 'all' || (settings.backgrounds === 'text' && cell.kind === 'text'))) {
      shapes.push({ kind: 'rect', ...cell.rect, fill: bg });
    }
  }
  if (settings.gridlines) {
    for (const cell of page.cells) shapes.push({ kind: 'frame', ...cell.rect, stroke: GRID_COLOR, width: 0.2 });
  }
  for (const cell of page.cells) {
    if (cell.kind !== 'text') continue;
    const style = cell.style ?? {};
    const size = (style.fontSize ?? DEFAULT_FONT_SIZE) / PX_TO_PT * page.scale;
    shapes.push({
      kind: 'text',
      ...cell.rect,
      text: cell.text,
      size: Math.min(size, cell.rect.h * 0.8),
      bold: !!style.bold,
      italic: !!style.italic,
      align: style.align ?? (isNumeric(cell.text) ? 'right' : 'left'),
      color: style.color ?? '#000000',
      pad: Math.min(3 * page.scale, cell.rect.w / 4),
    });
  }
  for (const box of page.boxes) shapes.push({ kind: 'frame', ...box.box, stroke: BOX_COLOR, width: BOX_STROKE });

  CORNERS.forEach((_, corner) => {
    const rect = markerRect(page.format, corner);
    shapes.push({ kind: 'modules', x: rect.x, y: rect.y, module: rect.w / MARKER_CELLS, matrix: markerMatrix(markerId(page.format.code, corner)) });
  });
  const qrBox = qrRect(page.format, qr.length * FRAME.qrModule);
  shapes.push({ kind: 'modules', x: qrBox.x, y: qrBox.y, module: FRAME.qrModule, matrix: qr });

  const titleX = FRAME.margin + FRAME.marker + FRAME.gap;
  const titleW = qrBox.x - FRAME.gap - titleX;
  if (settings.title.trim()) {
    shapes.push(textShape(settings.title.trim(), { x: titleX, y: FRAME.margin, w: titleW, h: 7 }, 5, true, 'left'));
  }
  if (page.count > 1) {
    const y = page.format.height - FRAME.margin - FRAME.marker / 2 - 3;
    shapes.push(textShape(`${page.index + 1} / ${page.count}`, { x: titleX, y, w: page.format.width - 2 * titleX, h: 6 }, 3.5, false, 'center'));
  }
  return { width: page.format.width, height: page.format.height, shapes };
}

function textShape(text: string, rect: Rect, size: number, bold: boolean, align: 'left' | 'center'): Shape {
  return { kind: 'text', ...rect, text, size, bold, italic: false, align, color: '#000000', pad: 0 };
}

function isNumeric(text: string): boolean {
  return /^[-+]?[\d.,\s]+%?$/.test(text.trim()) && /\d/.test(text);
}

/** White backgrounds are not worth printing. */
function isPrintedBackground(color: string): boolean {
  const c = color.trim().toLowerCase();
  return !['#fff', '#ffffff', 'white', 'transparent', 'rgb(255, 255, 255)', 'rgb(255,255,255)'].includes(c);
}

/** Renders a page drawing as a standalone SVG sized in millimetres. */
export function drawingToSvg(drawing: PageDrawing, idPrefix = 'p'): string {
  const parts: string[] = [];
  const defs: string[] = [];
  let clipCount = 0;
  for (const s of drawing.shapes) {
    switch (s.kind) {
      case 'rect':
        parts.push(`<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" fill="${attr(s.fill)}"/>`);
        break;
      case 'frame':
        parts.push(`<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" fill="none" stroke="${attr(s.stroke)}" stroke-width="${n(s.width)}"/>`);
        break;
      case 'text': {
        const id = `${idPrefix}c${clipCount++}`;
        defs.push(`<clipPath id="${id}"><rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}"/></clipPath>`);
        const x = s.align === 'left' ? s.x + s.pad : s.align === 'right' ? s.x + s.w - s.pad : s.x + s.w / 2;
        const anchor = s.align === 'left' ? 'start' : s.align === 'right' ? 'end' : 'middle';
        const weight = s.bold ? ' font-weight="bold"' : '';
        const style = s.italic ? ' font-style="italic"' : '';
        const lines = s.text.split('\n');
        const y0 = s.y + s.h / 2 - ((lines.length - 1) * s.size * 1.15) / 2;
        const tspans = lines
          .map((line, i) => `<tspan x="${n(x)}" y="${n(y0 + i * s.size * 1.15)}">${escapeXml(line)}</tspan>`)
          .join('');
        parts.push(
          `<text clip-path="url(#${id})" font-size="${n(s.size)}" fill="${attr(s.color)}" text-anchor="${anchor}" dominant-baseline="central"${weight}${style}>${tspans}</text>`,
        );
        break;
      }
      case 'modules': {
        let d = '';
        s.matrix.forEach((row, r) => {
          let c = 0;
          while (c < row.length) {
            if (!row[c]) {
              c++;
              continue;
            }
            const start = c;
            while (c < row.length && row[c]) c++;
            d += `M${n(s.x + start * s.module)} ${n(s.y + r * s.module)}h${n((c - start) * s.module)}v${n(s.module)}h${n(-(c - start) * s.module)}z`;
          }
        });
        parts.push(`<path d="${d}" fill="#000" shape-rendering="crispEdges"/>`);
        break;
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(drawing.width)} ${n(drawing.height)}" width="${n(drawing.width)}mm" height="${n(drawing.height)}mm" font-family="Arial, Helvetica, sans-serif">` +
    `<defs>${defs.join('')}</defs><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`
  );
}

function n(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
}

function attr(text: string): string {
  return escapeXml(text);
}
