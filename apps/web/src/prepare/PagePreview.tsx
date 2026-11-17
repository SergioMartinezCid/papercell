import { cellAddress, drawingToSvg, type CellKind, type KindOverride, type PrintablePage } from '@papercell/core';
import { Box, Button, Paper, Popover, Stack, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { memo, useMemo, useState } from 'react';
import { useI18n } from '../i18n';

interface Props {
  page: PrintablePage;
  kinds: CellKind[][];
  /** Spreadsheet position of the range, to name cells. */
  anchor: { row: number; col: number };
  /** The kind chosen by hand for a cell, if any. */
  chosen: (row: number, col: number) => KindOverride | undefined;
  /** The kind a cell gets when nothing is chosen by hand (from its token, note or position). */
  automatic: (row: number, col: number) => CellKind;
  onChoose: (row: number, col: number, kind: KindOverride | null) => void;
}

interface Target {
  row: number;
  col: number;
  rect: { x: number; y: number; w: number; h: number };
}

/** One printed page. Cells without text can be clicked to choose what they are. */
export const PagePreview = memo(function PagePreview({ page, kinds, anchor, chosen, automatic, onChoose }: Props) {
  const { t } = useI18n();
  const svg = useMemo(() => drawingToSvg(page.drawing, `v${page.layout.index}-`), [page]);
  const [target, setTarget] = useState<Target | null>(null);
  const { width, height } = page.drawing;
  const choosable = page.layout.cells.filter((c) => c.kind === 'mark' || c.kind === 'blank');
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  const choose = (kind: KindOverride | null) => {
    if (target) onChoose(target.row, target.col, kind);
    setTarget(null);
  };
  const current = target && chosen(target.row, target.col);
  const auto = target && automatic(target.row, target.col);
  const kindName = (kind: CellKind) => t(kind === 'mark' ? 'prepare.cell.box' : 'prepare.cell.blank');
  const option = (label: string, selected: boolean, onClick: () => void) => (
    <Button
      variant={selected ? 'light' : 'subtle'}
      justify="space-between"
      rightSection={selected ? <IconCheck size={14} /> : <span />}
      size="compact-sm"
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <Paper shadow="sm" radius={0} pos="relative" style={{ aspectRatio: `${width} / ${height}`, overflow: 'hidden', background: '#fff' }}>
      <div className="page-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {choosable.map((c) => (
          <rect
            key={`${c.row},${c.col}`}
            className={kinds[c.row]?.[c.col] === 'mark' ? 'toggle-cell is-box' : 'toggle-cell'}
            x={c.rect.x}
            y={c.rect.y}
            width={c.rect.w}
            height={c.rect.h}
            onClick={() => setTarget({ row: c.row, col: c.col, rect: c.rect })}
          />
        ))}
      </svg>
      <Popover opened={target !== null} onChange={(opened) => !opened && setTarget(null)} position="bottom" withArrow shadow="md" trapFocus>
        <Popover.Target>
          <Box
            pos="absolute"
            style={{
              pointerEvents: 'none',
              left: pct(target?.rect.x ?? 0, width),
              top: pct(target?.rect.y ?? 0, height),
              width: pct(target?.rect.w ?? 0, width),
              height: pct(target?.rect.h ?? 0, height),
            }}
          />
        </Popover.Target>
        <Popover.Dropdown p="xs">
          {target && auto && (
            <Stack gap={4} miw={180}>
              <Text size="xs" fw={600} c="dimmed">
                {t('prepare.cell.title', { cell: cellAddress(anchor.row + target.row, anchor.col + target.col) })}
              </Text>
              {option(t('prepare.cell.automatic', { kind: kindName(auto) }), current === undefined, () => choose(null))}
              {option(t('prepare.cell.box'), current === 'mark', () => choose('mark'))}
              {option(t('prepare.cell.blank'), current === 'blank', () => choose('blank'))}
            </Stack>
          )}
        </Popover.Dropdown>
      </Popover>
    </Paper>
  );
});
