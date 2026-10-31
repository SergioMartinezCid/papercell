import { Alert, Button, Group, SegmentedControl, Stack, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconDownload } from '@tabler/icons-react';
import { buildOutput, cellAddress, toCsv, toTsv, type OutputOptions, type Template } from '@papercell/core';
import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { copyText, downloadText } from '../lib/files';
import { isMarked, needsCheck, type ScanItem } from './types';

interface Props {
  pages: ScanItem[];
  template: Template | undefined;
  fileName: string;
  options: OutputOptions;
  onOptions: (patch: Partial<OutputOptions>) => void;
}

const PREVIEW_ROWS = 8;

export function OutputPanel({ pages, template, fileName, options, onOptions }: Props) {
  const { t } = useI18n();
  const payload = pages[0].scan!.payload;
  const unchecked = pages.reduce((n, p) => n + p.scan!.boxes.filter((b) => needsCheck(p, b)).length, 0);

  const output = useMemo(
    () =>
      buildOutput(
        {
          sourceRows: payload.sourceRows,
          sourceCols: payload.sourceCols,
          anchor: { row: payload.anchorRow, col: payload.anchorCol },
          marks: pages.flatMap((p) => p.scan!.boxes.map((b) => ({ row: b.row, col: b.col, marked: isMarked(p, b) }))),
          texts: template?.sheet.cells.map((row) => row.map((c) => c.text)),
        },
        options,
      ),
    [pages, payload, template, options],
  );
  const cell = cellAddress(output.topLeft.row, output.topLeft.col);

  const copy = async () => {
    const ok = await copyText(toTsv(output.values));
    notifications.show(ok ? { color: 'green', message: t('output.copied', { cell }) } : { color: 'red', message: t('output.copyFailed') });
  };

  return (
    <Stack gap="sm">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            {t('output.shape')}
          </Text>
          <SegmentedControl
            value={options.shape}
            onChange={(v) => onOptions({ shape: v as OutputOptions['shape'] })}
            data={[
              { value: 'boxes', label: t('output.shapeBoxes') },
              { value: 'range', label: t('output.shapeRange') },
            ]}
          />
        </Stack>
        <TextInput label={t('output.markedValue')} value={options.markedValue} onChange={(e) => onOptions({ markedValue: e.currentTarget.value })} w={120} />
        <TextInput
          label={t('output.emptyValue')}
          placeholder={t('output.emptyPlaceholder')}
          value={options.emptyValue}
          onChange={(e) => onOptions({ emptyValue: e.currentTarget.value })}
          w={120}
        />
      </Group>
      {unchecked > 0 && (
        <Alert color="orange" p="xs">
          {t('output.unchecked', { count: unchecked })}
        </Alert>
      )}
      {output.unknownCells > 0 && (
        <Alert color="orange" p="xs">
          {t('output.unknown', { count: output.unknownCells })}
        </Alert>
      )}
      <Text size="sm" fw={500}>
        {t('output.pasteAt', { cell })}
      </Text>
      <Table.ScrollContainer minWidth={0} maxHeight={240}>
        <Table withTableBorder withColumnBorders striped={false} fz="xs" aria-label={t('output.preview')}>
          <Table.Tbody>
            {output.values.slice(0, PREVIEW_ROWS).map((row, r) => (
              <Table.Tr key={r}>
                {row.map((v, c) => (
                  <Table.Td key={c} style={{ whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {output.values.length > PREVIEW_ROWS && (
        <Text size="xs" c="dimmed">
          … +{output.values.length - PREVIEW_ROWS}
        </Text>
      )}
      <Group gap="sm" grow>
        <Button leftSection={<IconCopy size={16} />} onClick={() => void copy()}>
          {t('output.copy')}
        </Button>
        <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => downloadText(`${fileName}.csv`, toCsv(output.values))}>
          {t('output.download')}
        </Button>
      </Group>
    </Stack>
  );
}
