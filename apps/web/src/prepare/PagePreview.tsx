import { cellAddress, drawingToSvg, fieldToken, parseField, type CellKind, type KindOverride, type NumberField, type PrintablePage } from '@papercell/core';
import { Box, Button, Group, Paper, Popover, Stack, Text, TextInput } from '@mantine/core';
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
  automatic: (row: number, col: number) => { kind: CellKind; field?: NumberField };
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
  /** Pattern typed for a number field (e.g. `##,#`). */
  const [pattern, setPattern] = useState('');
  const { width, height } = page.drawing;
  const choosable = page.layout.cells.filter((c) => c.kind === 'mark' || c.kind === 'number' || c.kind === 'blank');
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  const choose = (kind: KindOverride | null) => {
    if (target) onChoose(target.row, target.col, kind);
    setTarget(null);
  };
  const current = target && chosen(target.row, target.col);
  const auto = target && automatic(target.row, target.col);
  const kindName = ({ kind, field }: { kind: CellKind; field?: NumberField }) =>
    kind === 'number' && field ? `${t('prepare.cell.number')} ${fieldToken(field)}` : t(kind === 'mark' ? 'prepare.cell.box' : 'prepare.cell.blank');
  const typed = parseField(pattern);
  const openMenu = (row: number, col: number, rect: Target['rect']) => {
    const own = chosen(row, col);
    const field = typeof own === 'object' ? own.number : automatic(row, col).field;
    setPattern(field ? fieldToken(field).slice(1, -1) : '##');
    setTarget({ row, col, rect });
  };
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
            className={kinds[c.row]?.[c.col] === 'blank' ? 'toggle-cell' : 'toggle-cell is-box'}
            x={c.rect.x}
            y={c.rect.y}
            width={c.rect.w}
            height={c.rect.h}
            onClick={() => openMenu(c.row, c.col, c.rect)}
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
              <Group gap={4} wrap="nowrap" align="flex-start" mt={2}>
                <TextInput
                  size="xs"
                  w={96}
                  aria-label={t('prepare.cell.pattern')}
                  value={pattern}
                  error={!typed}
                  spellCheck={false}
                  onChange={(e) => setPattern(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && typed && choose({ number: typed })}
                />
                <Button
                  size="xs"
                  variant={typeof current === 'object' ? 'light' : 'subtle'}
                  disabled={!typed}
                  onClick={() => typed && choose({ number: typed })}
                  style={{ flex: 1 }}
                >
                  {t('prepare.cell.number')}
                </Button>
              </Group>
              <Text size="xs" c="dimmed" maw={200}>
                {t('prepare.cell.patternHint')}
              </Text>
            </Stack>
          )}
        </Popover.Dropdown>
      </Popover>
    </Paper>
  );
});
