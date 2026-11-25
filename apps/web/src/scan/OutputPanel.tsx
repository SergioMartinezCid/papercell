import { Alert, Button, Group, Menu, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconClipboardText, IconCopy, IconDownload, IconFileSpreadsheet, IconShare } from '@tabler/icons-react';
import { buildOutput, cellAddress, parseRangeAddress, rangeAddress, toCsv, toTsv, type CellRange, type OutputOptions, type Template } from '@papercell/core';
import { useMemo, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { canShare, canShareFiles, copyText, csvFile, downloadText, share } from '../lib/files';
import { RangeGrid } from './RangeGrid';
import { checksLeft, fieldsOf, fieldValue, isMarked, type ScanItem } from './types';

interface Props {
  pages: ScanItem[];
  template: Template | undefined;
  fileName: string;
  options: OutputOptions;
  onOptions: (patch: Partial<OutputOptions>) => void;
  /** Shown before the results (the scanned pages); on wide screens, in the column beside the table. */
  children?: ReactNode;
}

export function OutputPanel({ pages, template, fileName, options, onOptions, children }: Props) {
  const { t } = useI18n();
  const payload = pages[0].scan!.payload;
  const unchecked = pages.reduce((n, p) => n + checksLeft(p), 0);
  /** Part of the range chosen by hand (relative to it); null outputs the block chosen by `options.shape`. */
  const [selection, setSelection] = useState<CellRange | null>(null);
  /** Text of the cells field while it is being typed. */
  const [cellsDraft, setCellsDraft] = useState<string | null>(null);

  const input = useMemo(
    () => ({
      sourceRows: payload.sourceRows,
      sourceCols: payload.sourceCols,
      anchor: { row: payload.anchorRow, col: payload.anchorCol },
      marks: pages.flatMap((p) => p.scan!.boxes.map((b) => ({ row: b.row, col: b.col, marked: isMarked(p, b) }))),
      fields: pages.flatMap((p) => fieldsOf(p).map((f) => ({ row: f.row, col: f.col, value: fieldValue(p, f) }))),
      texts: template?.sheet.cells.map((row) => row.map((c) => c.text)),
    }),
    [pages, payload, template],
  );
  const output = useMemo(() => buildOutput(input, options, selection ?? undefined), [input, options, selection]);
  const grid = useMemo(() => buildOutput(input, { ...options, shape: 'range' }).values, [input, options]);
  const boxes = useMemo(() => new Map(input.marks.map((m) => [`${m.row},${m.col}`, m.marked])), [input]);
  const fieldCells = useMemo(() => new Set(input.fields.map((f) => `${f.row},${f.col}`)), [input]);
  const cell = cellAddress(output.topLeft.row, output.topLeft.col);

  // The cells field shows spreadsheet addresses; selections are relative to the range.
  const { anchor } = input;
  const shift = (r: CellRange, rows: number, cols: number) => ({ top: r.top + rows, left: r.left + cols, bottom: r.bottom + rows, right: r.right + cols });
  const whole = shift({ top: 0, left: 0, bottom: payload.sourceRows - 1, right: payload.sourceCols - 1 }, anchor.row, anchor.col);
  const parseCells = (text: string) => {
    const r = parseRangeAddress(text, whole);
    const inside = r && r.top >= whole.top && r.left >= whole.left && r.bottom <= whole.bottom && r.right <= whole.right;
    return inside ? shift(r, -anchor.row, -anchor.col) : null;
  };
  const cellsText = cellsDraft ?? rangeAddress(shift(output.block, anchor.row, anchor.col));
  const cellsInvalid = cellsDraft !== null && parseCells(cellsDraft) === null;

  const select = (range: CellRange) => {
    setSelection(range);
    setCellsDraft(null);
  };
  const typeCells = (text: string) => {
    setCellsDraft(text);
    const range = parseCells(text);
    if (range) setSelection(range);
  };
  const setShape = (shape: string) => {
    if (shape === 'selection') return select(output.block);
    setSelection(null);
    setCellsDraft(null);
    onOptions({ shape: shape as OutputOptions['shape'] });
  };

  const copy = async () => {
    const ok = await copyText(toTsv(output.values));
    notifications.show(ok ? { color: 'green', message: t('output.copied', { cell }) } : { color: 'red', message: t('output.copyFailed') });
  };

  // Sharing sends the results elsewhere, e.g. from a phone to a computer through a notes app or an email. The
  // subject (or note title) says where to paste them. Tabs may not survive in an email, so a CSV file is offered too.
  const shareable = useMemo(canShare, []);
  const filesShareable = useMemo(canShareFiles, []);
  const shareAs = async (as: 'text' | 'file') => {
    const where = t('output.pasteAt', { cell });
    const title = `${template?.settings.title || 'Papercell'}: ${where}`;
    const ok = await share(
      as === 'text' ? { title, text: toTsv(output.values) } : { title, text: where, files: [csvFile(`${fileName}.csv`, toCsv(output.values))] },
    );
    if (!ok) notifications.show({ color: 'red', message: t('output.shareFailed') });
  };
  const shareButton = (props: { onClick?: () => void }) => (
    <Button variant="default" leftSection={<IconShare size={16} />} {...props}>
      {t('output.share')}
    </Button>
  );

  return (
    <div className="results-layout">
      <Stack gap="md" className="results-side">
        {children}
        <Title order={3} size="h5">
          {t('output.title')}
        </Title>
        <Stack gap="sm">
          <Stack gap={4} align="flex-start">
            <Text size="sm" fw={500}>
              {t('output.shape')}
            </Text>
            <SegmentedControl
              value={selection ? 'selection' : options.shape}
              onChange={setShape}
              data={[
                { value: 'boxes', label: t('output.shapeBoxes') },
                { value: 'range', label: t('output.shapeRange') },
                { value: 'selection', label: t('output.shapeSelection') },
              ]}
              className="output-shape"
            />
          </Stack>
          <Group gap="sm" align="flex-start" wrap="wrap">
            <TextInput
              label={t('output.cells')}
              value={cellsText}
              onChange={(e) => typeCells(e.currentTarget.value)}
              onBlur={() => !cellsInvalid && setCellsDraft(null)}
              error={cellsInvalid && t('output.cellsInvalid', { range: rangeAddress(whole) })}
              w={150}
              spellCheck={false}
              autoCapitalize="characters"
            />
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
        </Stack>
      </Stack>
      <Stack gap={4} className="results-table">
        <RangeGrid
          values={grid}
          boxes={boxes}
          fields={fieldCells}
          block={output.block}
          anchor={anchor}
          label={t('output.preview')}
          onSelect={select}
          maxHeight="var(--results-table-height)"
        />
        <Text size="xs" c="dimmed">
          {t('output.selectHint')}
        </Text>
      </Stack>
      <Group data-tour="results" gap="sm" className="results-actions">
        <Button leftSection={<IconCopy size={16} />} onClick={() => void copy()}>
          {t('output.copy')}
        </Button>
        {shareable &&
          (filesShareable ? (
            <Menu position="top">
              <Menu.Target>{shareButton({})}</Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconClipboardText size={16} />} onClick={() => void shareAs('text')}>
                  {t('output.shareText')}
                </Menu.Item>
                <Menu.Item leftSection={<IconFileSpreadsheet size={16} />} onClick={() => void shareAs('file')}>
                  {t('output.shareFile')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            shareButton({ onClick: () => void shareAs('text') })
          ))}
        <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => downloadText(`${fileName}.csv`, toCsv(output.values))}>
          {t('output.download')}
        </Button>
      </Group>
    </div>
  );
}
