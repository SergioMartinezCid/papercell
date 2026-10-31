import { drawingToSvg, type CellKind, type PrintablePage } from '@papercell/core';
import { Paper } from '@mantine/core';
import { memo, useMemo } from 'react';

interface Props {
  page: PrintablePage;
  kinds: CellKind[][];
  onToggle: (row: number, col: number) => void;
}

/** One printed page, with clickable empty cells to switch between box and blank. */
export const PagePreview = memo(function PagePreview({ page, kinds, onToggle }: Props) {
  const svg = useMemo(() => drawingToSvg(page.drawing, `v${page.layout.index}-`), [page]);
  const { width, height } = page.drawing;
  const toggles = page.layout.cells.filter((c) => c.kind === 'mark' || c.kind === 'blank');
  return (
    <Paper shadow="sm" radius={0} pos="relative" style={{ aspectRatio: `${width} / ${height}`, overflow: 'hidden', background: '#fff' }}>
      <div className="page-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {toggles.map((c) => (
          <rect
            key={`${c.row},${c.col}`}
            className={kinds[c.row]?.[c.col] === 'mark' ? 'toggle-cell is-box' : 'toggle-cell'}
            x={c.rect.x}
            y={c.rect.y}
            width={c.rect.w}
            height={c.rect.h}
            onClick={() => onToggle(c.row, c.col)}
          />
        ))}
      </svg>
    </Paper>
  );
});
