import { ActionIcon, Badge, Box, Button, Group, Modal, ScrollArea, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import type { ReadBox } from '@papercell/core';
import { useState } from 'react';
import { useI18n } from '../i18n';
import { boxKey, isMarked, needsCheck, type ScanItem } from './types';

interface Props {
  item: ScanItem | null;
  mobile: boolean;
  onClose: () => void;
  onDecide: (item: ScanItem, row: number, col: number, marked: boolean) => void;
}

const ZOOMS = [1, 1.5, 2, 3];

export function ReviewModal({ item, mobile, onClose, onDecide }: Props) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(0);
  const scan = item?.scan;
  if (!item || !scan) return <Modal opened={false} onClose={onClose} />;

  const doubtful = scan.boxes.filter((b) => b.uncertain);
  const remaining = scan.boxes.filter((b) => needsCheck(item, b)).length;
  const { width, height } = scan.format;

  const page = (
    <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
      <Group justify="space-between" gap="xs">
        <Group gap={6}>
          <Badge color="green" variant="light">
            {t('review.legend.marked')}
          </Badge>
          <Badge color="gray" variant="light">
            {t('review.legend.empty')}
          </Badge>
          <Badge color="orange" variant="light">
            {t('review.legend.check')}
          </Badge>
        </Group>
        <Group gap={4}>
          <ActionIcon variant="default" aria-label={t('review.zoomOut')} disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)}>
            <IconZoomOut size={16} />
          </ActionIcon>
          <ActionIcon variant="default" aria-label={t('review.zoomIn')} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => z + 1)}>
            <IconZoomIn size={16} />
          </ActionIcon>
        </Group>
      </Group>
      <Text size="xs" c="dimmed">
        {t('review.hint')}
      </Text>
      <ScrollArea.Autosize mah={mobile ? undefined : 'calc(100dvh - 180px)'} type="auto">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: `${ZOOMS[zoom] * 100}%`, display: 'block', background: '#fff' }}>
          <image href={item.previewUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
          {scan.boxes.map((b) => (
            <BoxMark key={boxKey(b.row, b.col)} box={b} marked={isMarked(item, b)} check={needsCheck(item, b)} onClick={() => onDecide(item, b.row, b.col, !isMarked(item, b))} />
          ))}
        </svg>
      </ScrollArea.Autosize>
    </Stack>
  );

  const checks = (
    <Stack gap="xs" w={mobile ? '100%' : 300} style={{ flexShrink: 0 }}>
      <Text fw={600}>
        {t('review.toCheck')} ({remaining})
      </Text>
      {doubtful.length === 0 || remaining === 0 ? (
        <Text size="sm" c="dimmed">
          {t('review.allChecked')}
        </Text>
      ) : null}
      {doubtful.map((b) => (
        <RowCrop key={boxKey(b.row, b.col)} item={item} box={b} onDecide={onDecide} />
      ))}
    </Stack>
  );

  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen={mobile}
      size="90%"
      title={t('review.title', { n: scan.payload.pageIndex + 1, total: scan.payload.pageCount })}
    >
      {mobile ? (
        <Stack gap="lg">
          {doubtful.length > 0 && checks}
          {page}
        </Stack>
      ) : (
        <Group align="flex-start" wrap="nowrap" gap="lg">
          {page}
          {checks}
        </Group>
      )}
      <Group justify="flex-end" mt="md">
        <Button onClick={onClose}>{t('review.done')}</Button>
      </Group>
    </Modal>
  );
}

function BoxMark({ box, marked, check, onClick }: { box: ReadBox; marked: boolean; check: boolean; onClick: () => void }) {
  const color = check ? '#f08c00' : marked ? '#2f9e44' : '#868e96';
  const pad = 0.6;
  return (
    <rect
      x={box.box.x - pad}
      y={box.box.y - pad}
      width={box.box.w + 2 * pad}
      height={box.box.h + 2 * pad}
      rx={0.6}
      fill={check ? 'rgba(240,140,0,0.22)' : marked ? 'rgba(47,158,68,0.3)' : 'transparent'}
      stroke={color}
      strokeWidth={check ? 0.7 : 0.4}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    />
  );
}

/** The row around a doubtful box, so the decision can be made without zooming around the page. */
function RowCrop({ item, box, onDecide }: { item: ScanItem; box: ReadBox; onDecide: Props['onDecide'] }) {
  const { t } = useI18n();
  const scan = item.scan!;
  const { grid } = scan.payload;
  const left = grid.originX / 10;
  const right = (grid.originX + grid.colEdges[grid.colEdges.length - 1]) / 10;
  const y = box.cell.y - 1.5;
  const h = box.cell.h + 3;
  const decided = item.decisions[boxKey(box.row, box.col)];
  const value = decided === undefined ? null : decided ? 'marked' : 'empty';
  return (
    <Box p={6} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
      <svg viewBox={`${left - 1} ${y} ${right - left + 2} ${h}`} style={{ width: '100%', display: 'block', background: '#fff' }}>
        <image href={item.previewUrl} x={0} y={0} width={scan.format.width} height={scan.format.height} preserveAspectRatio="none" />
        <rect x={box.box.x - 0.8} y={box.box.y - 0.8} width={box.box.w + 1.6} height={box.box.h + 1.6} fill="none" stroke="#f08c00" strokeWidth={0.5} />
      </svg>
      <SegmentedControl
        mt={6}
        fullWidth
        size="xs"
        value={value ?? ''}
        onChange={(v) => onDecide(item, box.row, box.col, v === 'marked')}
        data={[
          { value: 'marked', label: t('review.marked') },
          { value: 'empty', label: t('review.notMarked') },
        ]}
      />
    </Box>
  );
}
