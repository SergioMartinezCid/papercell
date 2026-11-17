# Printed pages

Each `v<n>/*.json` is a page exactly as print format version `n` drew it: its page code, the decoded code, where its boxes were printed and the drawing itself. `test/compat.test.ts` reads them with the current code, so a change that would stop earlier prints from scanning fails the tests.

Never regenerate these files: they stand for paper that already exists. When the print format changes (see `src/spec.ts`), add a new version and record a few of its pages in a new `v<n>` folder, leaving the older folders untouched.

`v1` was recorded with `buildPrintable` at commit `153f319`:

- `a4-portrait-page2.json`: A4 portrait, page 2 of 3, with a repeated header row, striped rows, a box spanning two merged cells and a cell switched off by hand.
- `letter-landscape.json`: Letter landscape, one page, range starting at C5, varied column widths, no gridlines.

`v2` (boxes and number fields) was recorded with `buildPrintable` when number fields were added:

- `a4-portrait-numbers.json`: A4 portrait, one page: boxes and number fields of several formats (`[##]`, `[#,#]` and `[0,0]` from notes, `[000.00]`, one chosen by hand), blank cells, striped rows, a number field over two merged cells and a hidden row.
- `letter-landscape-page2.json`: Letter landscape, page 2 of 4, with a repeated header row, a column of `[###]` fields and no gridlines.
