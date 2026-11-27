// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseDelimited, sheetFromDelimited } from '../src/import/delimited';
import { notesFromGoogleSheets } from '../src/import/googleSheets';
import { restoreHiddenLines } from '../src/import/hidden';
import { copiedFromExcel, sheetFromHtmlTable } from '../src/import/html';
import { notesFromXlsx } from '../src/import/xlsxNotes';

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

  it('reads Excel formatting from its style rules and hidden rows from their style', () => {
    // Shape of what Excel puts on the clipboard: formatting in class rules, over a rule for every cell.
    const excel = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><style><!--table {mso-displayed-decimal-separator:"\\.";}
      td {padding-top:1px; color:black; font-size:11.0pt; font-weight:400; font-style:normal; border:none;}
      .xl65 {font-weight:700;}
      .xl66 {color:#ED7D31;}
      .xl67 {background:#ED7D31; mso-pattern:black none;}
      .xl68 {font-style:italic;}
      --></style></head><body><table border=0 cellpadding=0 cellspacing=0 width=174 style='border-collapse: collapse;width:130pt'>
      <!--StartFragment-->
      <col width=87 span=2 style='width:65pt'>
      <tr height=21 style='height:16.0pt'><td height=21 class=xl65 width=87>Name</td><td class=xl67>[ ]</td></tr>
      <tr height=0 style='display:none'><td>gone</td><td></td></tr>
      <tr height=21 style='height:16.0pt'><td class=xl66>red</td><td class="xl68">it</td></tr>
      <!--EndFragment--></table></body></html>`;
    const sheet = sheetFromHtmlTable(new DOMParser().parseFromString(excel, 'text/html'))!;
    expect(sheet.cells.map((r) => r.map((c) => c.text))).toEqual([
      ['Name', '[ ]'],
      ['gone', ''],
      ['red', 'it'],
    ]);
    expect(sheet.hiddenRows).toEqual([1]);
    expect(sheet.cells[0][0].style).toEqual({ bold: true, fontSize: 11 });
    expect(sheet.cells[0][1].style).toEqual({ background: '#ed7d31', fontSize: 11 });
    expect(sheet.cells[2][0].style).toEqual({ color: '#ed7d31', fontSize: 11 });
    expect(sheet.cells[2][1].style).toEqual({ italic: true, fontSize: 11 });
  });

  it('reads a range as Excel copies it, which has no notes', () => {
    // From a copy in Excel; the third cell of the first row had the note [##], which is nowhere in it.
    const excel = `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head>
      <meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=ProgId content=Excel.Sheet>
      <meta name=Generator content="Microsoft Excel 15">
      <style><!--table {mso-displayed-decimal-separator:"\\,"; mso-displayed-thousand-separator:"\\.";}
      .font5 {color:black; font-size:9.0pt; font-weight:400; font-family:Tahoma;}
      .font6 {color:black; font-size:9.0pt; font-weight:700; font-family:Tahoma;}
      td {padding:0px; color:black; font-size:11.0pt; font-weight:400; font-style:normal; border:none; white-space:nowrap;}
      --></style></head><body link="#0563C1" vlink="#954F72">
      <table border=0 cellpadding=0 cellspacing=0 width=249 style='border-collapse: collapse;width:186pt'>
      <!--StartFragment-->
       <col width=83 span=3 style='width:62pt'>
       <tr height=19 style='height:14.4pt'>
        <td height=19 width=83 style='height:14.4pt;width:62pt'>[-]</td>
        <td width=83 style='width:62pt'>[ ]</td>
        <td width=83 style='width:62pt'></td>
       </tr>
       <tr height=19 style='height:14.4pt'>
        <td height=19 style='height:14.4pt'></td>
        <td></td>
        <td>[00.0]</td>
       </tr>
      <!--EndFragment-->
      </table></body></html>`;
    const doc = new DOMParser().parseFromString(excel, 'text/html');
    const sheet = sheetFromHtmlTable(doc)!;
    expect(sheet.cells.map((r) => r.map((c) => c.text))).toEqual([
      ['[-]', '[ ]', ''],
      ['', '', '[00.0]'],
    ]);
    expect(sheet.cells.flat().some((c) => c.note)).toBe(false);
    expect(sheet.colWidths).toHaveLength(3);
    expect(copiedFromExcel(doc)).toBe(true);
    expect(copiedFromExcel(new DOMParser().parseFromString('<meta name="generator" content="LibreOffice"><table></table>', 'text/html'))).toBe(false);
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

describe('Google Sheets notes', () => {
  it('reads the notes of its own clipboard type, cell by cell', () => {
    // Shapes of what Google Sheets copies (other fields trimmed): a 2×2 range with a note on its first cell,
    // and a 3×2 range with notes on the second, fourth and sixth cells and a value in the third.
    const first = '{"1":1,"2":[450,-3,194],"3":{},"5":[-4,0],"12":[-4,1],"13":[-4,1],"14":["abc"],"15":{"1":2,"2":2},"20":4}';
    expect(notesFromGoogleSheets(first)).toEqual([
      ['abc', undefined],
      [undefined, undefined],
    ]);
    const second =
      '{"1":1,"2":[194,450,195,450,194,450],"3":{"1":[2],"4":["hello"]},"5":[-6,0],"12":[-6,1],"13":[-6,1],"14":["[-]","[##]\\n","abc"],"15":{"1":2,"2":3},"20":6}';
    expect(notesFromGoogleSheets(second)).toEqual([
      [undefined, '[-]', undefined],
      ['[##]', undefined, 'abc'],
    ]);
  });

  it('expands repeated values', () => {
    const json = '{"2":[194,-2,450,-3,194],"14":[-2,"[-]"],"15":{"1":2,"2":3}}';
    expect(notesFromGoogleSheets(json)).toEqual([
      [undefined, '[-]', '[-]'],
      [undefined, undefined, undefined],
    ]);
  });

  it('gives up on data it does not know', () => {
    expect(notesFromGoogleSheets('')).toBeNull();
    expect(notesFromGoogleSheets('{"14":["a"]}')).toBeNull();
    expect(notesFromGoogleSheets('{"2":[194,194],"14":["a"],"15":{"1":1,"2":2}}')).toBeNull();
  });
});

describe('ONLYOFFICE notes', () => {
  /** A table as ONLYOFFICE copies it: notes only in its binary data (here, just what is read of it). */
  function onlyOfficeTable(range: string, notes: Array<[number, number, string]>, rows: string): string {
    const int32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    const utf16 = (text: string) => Array.from(text).flatMap((ch) => [ch.charCodeAt(0) & 255, ch.charCodeAt(0) >> 8]);
    const bytes = [0x07, ...utf16('Sheet1'), 0, 0, 0x05, ...utf16(range), 0, 0];
    for (const [row, col, text] of notes) {
      const t = utf16(text);
      bytes.push(0x14, ...int32(30 + t.length), 0x00, 0x04, ...int32(row), 0x01, 0x04, ...int32(col), 0x02, 0x06, ...int32(10 + t.length));
      bytes.push(0x03, ...int32(5 + t.length), 0x00, ...int32(t.length), ...t, 0x02, 0x00);
    }
    const data = btoa(String.fromCharCode(...bytes));
    return `<table class="xslData;XLSY;v2;${bytes.length};${data}" style="border-collapse: collapse;"><tbody>${rows}</tbody></table>`;
  }

  it('reads notes from its own data, and widths and hidden columns from the cells', () => {
    const cell = (text: string, width = 60) => `<td style="width:${width}pt;white-space:nowrap;"><span>${text}</span></td>`;
    const html = onlyOfficeTable(
      'C3:E4',
      [
        [2, 4, '[##]'],
        [3, 2, 'see [-] here'],
        [9, 9, 'outside'],
      ],
      `<tr style="height:12.8pt">${cell('a')}${cell('hidden', 0)}<td></td></tr><tr style="height:12.8pt">${cell('x')}${cell('', 0)}${cell('y')}</tr>`,
    );
    const sheet = sheetFromHtmlTable(new DOMParser().parseFromString(html, 'text/html'))!;
    expect(sheet.cells.map((r) => r.map((c) => c.note))).toEqual([
      [undefined, undefined, '[##]'],
      ['see [-] here', undefined, undefined],
    ]);
    expect(sheet.colWidths[0]).toBe(80);
    expect(sheet.hiddenCols).toEqual([1]);
  });
});

describe('.xlsx notes', () => {
  /** A zip of these files, deflated except the ones named in `stored`. The checksums are left at 0: nothing here checks them. */
  async function zip(files: Record<string, string>, stored: string[] = []): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const parts: Uint8Array<ArrayBuffer>[] = [];
    const directory: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0;
    for (const [name, text] of Object.entries(files)) {
      const raw = encoder.encode(text);
      const method = stored.includes(name) ? 0 : 8;
      const body = method ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : raw;
      const path = encoder.encode(name);
      const local = new Uint8Array(30 + path.length + body.length);
      const l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(8, method, true);
      l.setUint32(18, body.length, true);
      l.setUint32(22, raw.length, true);
      l.setUint16(26, path.length, true);
      local.set(path, 30);
      local.set(body, 30 + path.length);
      const entry = new Uint8Array(46 + path.length);
      const e = new DataView(entry.buffer);
      e.setUint32(0, 0x02014b50, true);
      e.setUint16(10, method, true);
      e.setUint32(20, body.length, true);
      e.setUint32(24, raw.length, true);
      e.setUint16(28, path.length, true);
      e.setUint32(42, offset, true);
      entry.set(path, 46);
      parts.push(local);
      directory.push(entry);
      offset += local.length;
    }
    const end = new Uint8Array(22);
    const d = new DataView(end.buffer);
    d.setUint32(0, 0x06054b50, true);
    d.setUint16(8, directory.length, true);
    d.setUint16(10, directory.length, true);
    d.setUint32(12, directory.reduce((s, x) => s + x.length, 0), true);
    d.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end]).arrayBuffer();
  }

  const MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const RELS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  const TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  it('reads the notes of every sheet, also of the cells saved with nothing but a note', async () => {
    // As Excel saves them: G3 has a note and is not in the sheet's cells; the note starts with its author.
    const file = await zip(
      {
        'xl/workbook.xml': `<workbook ${MAIN} xmlns:r="${TYPE}"><sheets><sheet name="Sheet A" sheetId="1" r:id="rId1"/><sheet name="B" sheetId="2" r:id="rId2"/><sheet name="C &amp; D" sheetId="3" r:id="rId3"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<Relationships ${RELS}><Relationship Id="rId2" Type="${TYPE}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Type="${TYPE}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Type="${TYPE}/worksheet" Target="/xl/worksheets/sheet3.xml"/></Relationships>`,
        'xl/worksheets/sheet1.xml': `<worksheet ${MAIN}><sheetData><row r="4"><c r="G4" t="s"><v>0</v></c></row></sheetData></worksheet>`,
        'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships ${RELS}><Relationship Id="rId2" Type="${TYPE}/comments" Target="../comments1.xml"/><Relationship Id="rId1" Type="${TYPE}/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/></Relationships>`,
        'xl/comments1.xml': `<comments ${MAIN}><authors><author>Author</author></authors><commentList>
          <comment ref="G3" authorId="0"><text><r><rPr><b/></rPr><t>Author:</t></r><r><t xml:space="preserve">
[##]</t></r></text></comment>
          <comment ref="b2" authorId="0"><text><t>see [-] &amp; more</t></text></comment>
          <comment ref="C1" authorId="0"><text><t> </t></text></comment></commentList></comments>`,
        'xl/worksheets/sheet3.xml': `<worksheet ${MAIN}><sheetData/></worksheet>`,
        'xl/worksheets/_rels/sheet3.xml.rels': `<Relationships ${RELS}><Relationship Id="rId1" Type="${TYPE}/comments" Target="/xl/notes/third.xml"/></Relationships>`,
        'xl/notes/third.xml': `<comments ${MAIN}><commentList><comment ref="A1"><text><t>[ ]</t></text></comment></commentList></comments>`,
      },
      ['xl/workbook.xml'],
    );
    const notes = await notesFromXlsx(file);
    expect([...notes.keys()]).toEqual(['Sheet A', 'C & D']);
    expect(Object.fromEntries(notes.get('Sheet A')!)).toEqual({ G3: 'Author:\n[##]', B2: 'see [-] & more' });
    expect(Object.fromEntries(notes.get('C & D')!)).toEqual({ A1: '[ ]' });
  });

  it('rejects a file that is not a zip', async () => {
    await expect(notesFromXlsx(new TextEncoder().encode('name,score\n').buffer)).rejects.toThrow();
  });
});
