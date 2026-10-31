// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseDelimited, sheetFromDelimited } from '../src/import/delimited';
import { sheetFromHtmlTable } from '../src/import/html';

describe('delimited text', () => {
  it('parses quoted fields with tabs, quotes and line breaks', () => {
    expect(parseDelimited('a\t"b\tc"\t"say ""hi"""\n"two\nlines"\t\tx\n', '\t')).toEqual([
      ['a', 'b\tc', 'say "hi"'],
      ['two\nlines', '', 'x'],
    ]);
  });

  it('detects the delimiter', () => {
    expect(detectDelimiter('a\tb')).toBe('\t');
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b')).toBe(',');
  });

  it('builds a rectangular sheet with default geometry', () => {
    const sheet = sheetFromDelimited('Name,A,B\nx\n');
    expect(sheet.cells.map((r) => r.map((c) => c.text))).toEqual([
      ['Name', 'A', 'B'],
      ['x', '', ''],
    ]);
    expect(sheet.colWidths).toEqual([100, 100, 100]);
  });
});

describe('HTML clipboard tables', () => {
  // Shape of what Google Sheets puts on the clipboard.
  const html = `<meta charset="utf-8"><google-sheets-html-origin><style type="text/css">td {border: 1px solid #cccccc;}</style>
    <table style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none">
    <colgroup><col width="160"><col width="70"><col width="70"></colgroup>
    <tbody>
      <tr style="height:24px"><td style="background-color:#d9d9d9;font-weight:bold;">Item</td><td colspan="2" style="text-align:center;font-weight:bold;">Options</td></tr>
      <tr style="height:21px"><td style="background-color:#f3f3f3;">First<br>line two</td><td></td><td style="background-color:#ffffff;"></td></tr>
      <tr style="height:21px"><td style="font-size:12pt;color:#ff0000;font-style:italic;">Second</td><td>&nbsp;</td><td>3</td></tr>
    </tbody></table>`;

  it('keeps text, merges, sizes and formatting', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sheet = sheetFromHtmlTable(doc)!;
    expect(sheet.cells.map((r) => r.map((c) => c.text))).toEqual([
      ['Item', 'Options', ''],
      ['First\nline two', '', ''],
      ['Second', '', '3'],
    ]);
    expect(sheet.colWidths).toEqual([160, 70, 70]);
    expect(sheet.rowHeights).toEqual([24, 21, 21]);
    expect(sheet.merges).toEqual([{ row: 0, col: 1, rowSpan: 1, colSpan: 2 }]);
    expect(sheet.cells[0][0].style).toEqual({ bold: true, background: '#d9d9d9' });
    expect(sheet.cells[0][1].style).toEqual({ bold: true, align: 'center' });
    expect(sheet.cells[1][2].style).toBeUndefined();
    expect(sheet.cells[2][0].style).toEqual({ italic: true, color: '#ff0000', fontSize: 12 });
  });

  it('returns null without a table', () => {
    expect(sheetFromHtmlTable(new DOMParser().parseFromString('<p>hi</p>', 'text/html'))).toBeNull();
  });
});
