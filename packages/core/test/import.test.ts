// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseDelimited, sheetFromDelimited } from '../src/import/delimited';
import { restoreHiddenLines } from '../src/import/hidden';
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

  it('reads LibreOffice notes as notes, not as cell text', () => {
    // Shape of what LibreOffice Calc puts on the clipboard for cells with a note.
    const lo = `<table cellspacing="0" border="0"><colgroup span="2" width="85"></colgroup>
      <tr><td height="17" align="left">a</td>
        <td align="left"><a class="comment-indicator"></a>
        <comment>[##]</comment>
        <br></td></tr>
      <tr><td height="17" align="left"><a class="comment-indicator"></a>
        <comment>see [-] here</comment>
        x</td><td align="left">b</td></tr></table>`;
    const sheet = sheetFromHtmlTable(new DOMParser().parseFromString(lo, 'text/html'))!;
    expect(sheet.cells.map((r) => r.map((c) => c.text))).toEqual([
      ['a', ''],
      ['x', 'b'],
    ]);
    expect(sheet.cells.map((r) => r.map((c) => c.note))).toEqual([
      [undefined, '[##]'],
      ['see [-] here', undefined],
    ]);
  });

  it('returns null without a table', () => {
    expect(sheetFromHtmlTable(new DOMParser().parseFromString('<p>hi</p>', 'text/html'))).toBeNull();
  });
});

describe('hidden rows and columns', () => {
  const parse = (html: string) => sheetFromHtmlTable(new DOMParser().parseFromString(`<table>${html}</table>`, 'text/html'))!;
  const texts = (sheet: { cells: Array<Array<{ text: string }>> }) => sheet.cells.map((r) => r.map((c) => c.text));

  it('puts back the rows and columns LibreOffice leaves out of the HTML', () => {
    // Row 3 and column C are hidden: the HTML lacks them, the plain text has them.
    const sheet = parse(`<tr><td>h1</td><td>h2</td><td>h4</td></tr>
      <tr><td>a</td><td><comment>[##]</comment><br></td><td>d2</td></tr>
      <tr><td>x</td><td>[#,#]</td><td><br></td></tr>`);
    const text = parseDelimited('h1\th2\th3\th4\na\t\tc2\td2\nhidden\tb3\tc3\td3\nx\t[#,#]\tc4\t', '\t');
    const restored = restoreHiddenLines(sheet, text)!;
    expect(texts(restored)).toEqual([
      ['h1', 'h2', 'h3', 'h4'],
      ['a', '', 'c2', 'd2'],
      ['hidden', 'b3', 'c3', 'd3'],
      ['x', '[#,#]', 'c4', ''],
    ]);
    expect(restored.hiddenRows).toEqual([2]);
    expect(restored.hiddenCols).toEqual([2]);
    expect(restored.cells[1][1].note).toBe('[##]');
  });

  it('stretches merges over the hidden lines inside them', () => {
    const sheet = parse('<tr><td colspan="2">m</td></tr><tr><td>x</td><td>y</td></tr>');
    const restored = restoreHiddenLines(sheet, [['m', '', ''], ['x', 'hid', 'y']])!;
    expect(restored.hiddenCols).toEqual([1]);
    expect(restored.merges).toEqual([{ row: 0, col: 0, rowSpan: 1, colSpan: 3 }]);
  });

  it('gives up when a hidden line could be in more than one place', () => {
    const sheet = parse('<tr><td>a</td><td></td></tr>');
    expect(restoreHiddenLines(sheet, [['a', '', '']])).toBeNull();
  });

  it('keeps the sheet when nothing is missing', () => {
    const sheet = parse('<tr><td>a</td><td>b</td></tr>');
    expect(restoreHiddenLines(sheet, [['a', 'b']])).toBe(sheet);
  });
});
