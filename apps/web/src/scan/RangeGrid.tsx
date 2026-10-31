import { Table } from '@mantine/core';
import { columnName, type CellRange } from '@papercell/core';
import { useRef, type MouseEvent, type PointerEvent } from 'react';

interface Props {
  /** Output values for the whole source range. */
  values: string[][];
  /** Boxes by `row,col`: true = marked. */
  boxes: Map<string, boolean>;
  /** Highlighted block, relative to the range. */
  block: CellRange;
  /** Spreadsheet position of the range, for the row and column headers. */
  anchor: { row: number; col: number };
  label: string;
  onSelect: (range: CellRange) => void;
}

/** A row or column header leaves the other coordinate open (null): it stands for the whole line. */
interface Point {
  row: number | null;
  col: number | null;
}

/**
 * The scanned range as a small spreadsheet. With a mouse, drag (or shift-click) to select a block; on touch
 * screens, tap the first and the last cell, so that scrolling still works. Headers select whole rows or columns.
 */
export function RangeGrid({ values, boxes, block, anchor, label, onSelect }: Props) {
  const rows = values.length;
  const cols = values[0]?.length ?? 0;
  const start = useRef<Point | null>(null);
  const awaitingSecondTap = useRef(false);
  const dragging = useRef(false);
  const pointerType = useRef('');

  const span = (a: number | null, b: number | null, n: number): [number, number] =>
    a === null || b === null ? [0, n - 1] : [Math.min(a, b), Math.max(a, b)];
  const select = (a: Point, b: Point) => {
    const [top, bottom] = span(a.row, b.row, rows);
    const [left, right] = span(a.col, b.col, cols);
    onSelect({ top, left, bottom, right });
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerType.current = e.pointerType;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const p = pointAt(e.target);
    if (!p) return;
    if (!e.shiftKey || !start.current) start.current = p;
    dragging.current = true;
    window.addEventListener('pointerup', () => (dragging.current = false), { once: true });
    select(start.current, p);
  };

  const onPointerOver = (e: PointerEvent) => {
    if (!dragging.current || !start.current) return;
    const p = pointAt(e.target);
    if (p) select(start.current, p);
  };

  const onClick = (e: MouseEvent) => {
    if (pointerType.current === 'mouse') return;
    const p = pointAt(e.target);
    if (!p) return;
    if (awaitingSecondTap.current && start.current) {
      awaitingSecondTap.current = false;
      select(start.current, p);
    } else {
      start.current = p;
      awaitingSecondTap.current = true;
      select(p, p);
    }
  };

  const inRows = (r: number) => r >= block.top && r <= block.bottom;
  const inCols = (c: number) => c >= block.left && c <= block.right;

  return (
    <Table.ScrollContainer minWidth={0} maxHeight={320}>
      <Table
        className="range-grid"
        withTableBorder
        withColumnBorders
        stickyHeader
        fz="xs"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerOver={onPointerOver}
        onClick={onClick}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th data-pos="," />
            {Array.from({ length: cols }, (_, c) => (
              <Table.Th key={c} data-pos={`,${c}`} className={inCols(c) ? 'in-block' : undefined}>
                {columnName(anchor.col + c)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {values.map((row, r) => (
            <Table.Tr key={r}>
              <Table.Th data-pos={`${r},`} className={inRows(r) ? 'in-block' : undefined}>
                {anchor.row + r + 1}
              </Table.Th>
              {row.map((v, c) => {
                const box = boxes.get(`${r},${c}`);
                const classes = [inRows(r) && inCols(c) && 'in-block', box !== undefined && 'is-box', box && 'is-marked'];
                return (
                  <Table.Td key={c} data-pos={`${r},${c}`} className={classes.filter(Boolean).join(' ')}>
                    {v}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function pointAt(target: EventTarget): Point | null {
  const pos = (target as Element).closest?.('[data-pos]')?.getAttribute('data-pos');
  if (pos == null) return null;
  const [row, col] = pos.split(',');
  return { row: row === '' ? null : Number(row), col: col === '' ? null : Number(col) };
}
