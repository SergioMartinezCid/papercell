import { Alert, Anchor, Badge, Box, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPrinter, IconRoute, IconTable } from '@tabler/icons-react';
import {
  buildPrintable,
  cellAddress,
  cellKey,
  planCells,
  DEFAULT_SETTINGS,
  fieldToken,
  otherSeparatorField,
  parseCellAddress,
  templateFingerprint,
  type KindOverride,
  type LayoutSettings,
  type Sheet,
  type Template,
} from '@papercell/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHelp } from '../help/HelpContext';
import { sampleTemplate } from '../help/samples';
import { useI18n } from '../i18n';
import { sheetFromClipboard, sheetsFromFile, type FileImport } from '../lib/importSheet';
import { deleteTemplate, listTemplates, saveTemplate, type StoredTemplate } from '../lib/templates';
import { ImportCard } from './ImportCard';
import { PagePreview } from './PagePreview';
import { PrintRoot } from './PrintRoot';
import { RecentCard } from './RecentCard';
import { SettingsCard } from './SettingsCard';

const SMALL_BOX_MM = 3.5;
/** Files that can be imported, as the upload button offers them. */
const IMPORTABLE = /\.(xlsx|csv|tsv|txt)$/i;
/** Digit boxes lower than this are hard to write in. */
const SMALL_DIGIT_MM = 5;

interface Props {
  active: boolean;
  mobile: boolean;
  touch: boolean;
  /** Show the sample sheet when there is none (during the guided tour). */
  demo: boolean;
}

export function PreparePage({ active, mobile, touch, demo }: Props) {
  const { t, lang } = useI18n();
  const { openFaq, startTour } = useHelp();
  const [template, setTemplate] = useState<Template | null>(null);
  const [anchorText, setAnchorText] = useState('A1');
  const [recent, setRecent] = useState<StoredTemplate[]>([]);
  const [worksheets, setWorksheets] = useState<FileImport['sheets']>([]);
  const [worksheet, setWorksheet] = useState<string | null>(null);

  // The latest template is kept on the device: printing and scanning often happen on different days.
  useEffect(() => {
    void listTemplates().then((list) => {
      setRecent(list);
      setTemplate((current) => current ?? list[0]?.template ?? null);
      if (list[0]) setAnchorText(cellAddress(list[0].template.anchor.row, list[0].template.anchor.col));
    });
  }, []);

  const anchor = useMemo(() => parseCellAddress(anchorText), [anchorText]);
  /** The sheet on screen: the one being prepared, or the sample one while the tour shows it. */
  const shown = template ?? (demo ? sampleTemplate(lang) : null);

  /** `origin`: where the sheet starts in the spreadsheet, when the file says; otherwise the cell typed in stays. */
  const load = useCallback(
    (sheet: Sheet, origin?: { row: number; col: number }) => {
      if (sheet.cells.length === 0) {
        notifications.show({ color: 'orange', message: t('prepare.import.nothing') });
        return;
      }
      if (origin) setAnchorText(cellAddress(origin.row, origin.col));
      setTemplate((current) => ({
        sheet,
        overrides: {},
        settings: { ...DEFAULT_SETTINGS, ...current?.settings },
        anchor: origin ?? anchor ?? { row: 0, col: 0 },
      }));
      notifications.show({ message: t('prepare.import.loaded', { rows: sheet.rowHeights.length, cols: sheet.colWidths.length }) });
    },
    [anchor, t],
  );

  const onPaste = useCallback(
    (data: DataTransfer | null) => {
      const pasted = sheetFromClipboard(data);
      if (!pasted) {
        notifications.show({ color: 'orange', message: t('prepare.import.nothing') });
        return;
      }
      setWorksheets([]);
      load(pasted.sheet);
      if (pasted.warning) notifications.show({ color: 'orange', autoClose: false, message: t('prepare.import.hiddenLines') });
      else if (pasted.withoutNotes) notifications.show({ autoClose: 12000, message: t('prepare.import.excelNotes') });
      const separator = pasted.decimalSeparator;
      const other = separator && otherSeparatorField(pasted.sheet, separator);
      if (separator && other) {
        const message = t('prepare.import.decimals', { separator, token: fieldToken(other), fixed: fieldToken({ ...other, separator }) });
        notifications.show({ color: 'orange', autoClose: false, message });
      }
    },
    [load, t],
  );

  // Ctrl+V anywhere on this screen, except inside other fields.
  useEffect(() => {
    if (!active) return;
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      onPaste(e.clipboardData);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [active, onPaste]);

  const onFile = useCallback(
    async (file: File) => {
      try {
        const { sheets } = await sheetsFromFile(file);
        if (sheets.length === 0) throw new Error('empty');
        setWorksheets(sheets);
        setWorksheet(sheets[0].name);
        load(sheets[0].sheet, sheets[0].origin);
      } catch {
        notifications.show({ color: 'red', message: t('prepare.import.failed') });
      }
    },
    [load, t],
  );

  // A file dropped anywhere on this screen is imported, and the paste target lights up while one is dragged over.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const withFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const over = (e: DragEvent) => {
      if (!withFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDragging(true);
      // Dragging over repeats while the file is over the window: when it stops, the file left or the drag was cancelled.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setDragging(false), 200);
    };
    const drop = (e: DragEvent) => {
      if (!withFiles(e)) return;
      e.preventDefault();
      window.clearTimeout(timer);
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (IMPORTABLE.test(file.name)) void onFile(file);
      else notifications.show({ color: 'orange', message: t('prepare.import.dropType') });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      setDragging(false);
    };
  }, [active, onFile, t]);

  const onAnchorChange = (value: string) => {
    setAnchorText(value);
    const parsed = parseCellAddress(value);
    if (parsed) setTemplate((current) => (current ? { ...current, anchor: parsed } : current));
  };

  const updateSettings = (patch: Partial<LayoutSettings>) =>
    setTemplate((current) => (current ? { ...current, settings: { ...current.settings, ...patch } } : current));

  const printable = useMemo(() => {
    if (!shown) return null;
    try {
      return { ok: true as const, value: buildPrintable(shown) };
    } catch {
      return { ok: false as const };
    }
  }, [shown]);

  const chosen = useCallback((row: number, col: number) => shown?.overrides[cellKey(row, col)], [shown]);
  const automatic = useCallback(
    (row: number, col: number) => {
      if (!shown) return { kind: 'blank' as const };
      const { [cellKey(row, col)]: _, ...others } = shown.overrides;
      const plan = planCells(shown.sheet, others);
      return { kind: plan.kinds[row][col], field: plan.fields.get(cellKey(row, col)), letters: plan.letters.get(cellKey(row, col)) };
    },
    [shown],
  );
  const choose = useCallback((row: number, col: number, kind: KindOverride | null) => {
    setTemplate((current) => {
      if (!current) return current;
      const overrides = { ...current.overrides };
      if (kind) overrides[cellKey(row, col)] = kind;
      else delete overrides[cellKey(row, col)];
      return { ...current, overrides };
    });
  }, []);

  const print = async () => {
    if (!template) return;
    setRecent(await saveTemplate(template));
    window.print();
  };

  const open = (item: StoredTemplate) => {
    setTemplate(item.template);
    setWorksheets([]);
    setAnchorText(cellAddress(item.template.anchor.row, item.template.anchor.col));
  };

  const layout = printable?.ok ? printable.value.layout : null;
  /** Cells to fill in on paper. */
  const fieldCount = layout ? layout.boxCount + layout.numberCount + layout.letterCount + layout.lineCount : 0;
  const currentId = template ? templateFingerprint(template) : null;

  const importCard = (
    <ImportCard
      touch={touch}
      dragging={dragging}
      anchor={anchorText}
      anchorValid={anchor !== null}
      onAnchorChange={onAnchorChange}
      onPaste={onPaste}
      onFile={(f) => void onFile(f)}
      worksheets={worksheets}
      worksheet={worksheet}
      onWorksheet={(name) => {
        setWorksheet(name);
        const found = worksheets.find((w) => w.name === name);
        if (found) load(found.sheet, found.origin);
      }}
    />
  );
  const settingsCard = shown && <SettingsCard settings={shown.settings} onChange={updateSettings} />;
  const recentCard = (
    <RecentCard
      items={recent}
      currentId={currentId}
      onOpen={open}
      onDelete={(item) => void deleteTemplate(item.id).then(setRecent)}
    />
  );

  const preview = (
    <Stack gap="md">
      {!shown && (
        <Paper withBorder radius="md" p="xl">
          <Stack align="center" gap="xs" ta="center">
            <IconTable size={40} stroke={1.4} />
            <Title order={2} size="h3">
              {t('prepare.empty.title')}
            </Title>
            <Text c="dimmed" maw={460}>
              {t('prepare.empty.body')}
            </Text>
            <Button variant="light" leftSection={<IconRoute size={18} />} onClick={startTour} mt="sm">
              {t('prepare.empty.tour')}
            </Button>
          </Stack>
        </Paper>
      )}
      {shown && printable && !printable.ok && (
        <Alert color="red" icon={<IconAlertTriangle />}>
          {t('prepare.warn.tooComplex')}
        </Alert>
      )}
      {layout && printable?.ok && (
        <>
          <Group justify="space-between" gap="sm">
            <Group gap="xs">
              <Badge variant="light" size="lg">
                {layout.boxCount === 1 ? t('prepare.summary.box') : t('prepare.summary.boxes', { count: layout.boxCount })}
              </Badge>
              {layout.numberCount > 0 && (
                <Badge variant="light" size="lg">
                  {layout.numberCount === 1 ? t('prepare.summary.number') : t('prepare.summary.numbers', { count: layout.numberCount })}
                </Badge>
              )}
              {layout.letterCount > 0 && (
                <Badge variant="light" size="lg">
                  {layout.letterCount === 1 ? t('prepare.summary.letterField') : t('prepare.summary.letterFields', { count: layout.letterCount })}
                </Badge>
              )}
              {layout.lineCount > 0 && (
                <Badge variant="light" size="lg">
                  {layout.lineCount === 1 ? t('prepare.summary.line') : t('prepare.summary.lines', { count: layout.lineCount })}
                </Badge>
              )}
              <Badge variant="light" color="gray" size="lg">
                {layout.pages.length === 1 ? t('prepare.summary.page') : t('prepare.summary.pages', { count: layout.pages.length })}
              </Badge>
            </Group>
            {!mobile && (
              <Button data-tour="print" leftSection={<IconPrinter size={18} />} onClick={() => void print()} disabled={fieldCount === 0}>
                {t('prepare.print')}
              </Button>
            )}
          </Group>
          {fieldCount === 0 && (
            <Alert color="orange" icon={<IconAlertTriangle />}>
              {t('prepare.warn.noBoxes')}
            </Alert>
          )}
          {layout.boxCount > 0 && layout.minBoxSide < SMALL_BOX_MM && (
            <Alert color="orange" icon={<IconAlertTriangle />}>
              {t('prepare.warn.smallBoxes', { size: layout.minBoxSide.toFixed(1) })}
            </Alert>
          )}
          {layout.numberCount + layout.letterCount > 0 && layout.minCharHeight < SMALL_DIGIT_MM && (
            <Alert color="orange" icon={<IconAlertTriangle />}>
              {t('prepare.warn.smallDigits', { size: layout.minCharHeight.toFixed(1) })}
            </Alert>
          )}
          <Text size="sm" c="dimmed">
            {t('prepare.preview.hint')} {t('prepare.printHint')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('prepare.tokens.hint')}{' '}
            <Anchor component="button" type="button" size="sm" onClick={() => openFaq('tokens')} style={{ verticalAlign: 'baseline' }}>
              {t('prepare.tokens.more')}
            </Anchor>
          </Text>
          {printable.value.pages.map((page) => (
            <PagePreview
              key={page.layout.index}
              page={page}
              tour={page.layout.index === 0}
              kinds={layout.kinds}
              anchor={shown!.anchor}
              chosen={chosen}
              automatic={automatic}
              onChoose={choose}
            />
          ))}
          <PrintRoot printable={printable.value} />
        </>
      )}
    </Stack>
  );

  if (mobile) {
    return (
      <Stack gap="md" pb={layout ? 80 : 0}>
        <Alert variant="light" color="blue">
          {t('prepare.mobileNote')}
        </Alert>
        {importCard}
        {preview}
        {settingsCard}
        {recentCard}
        {fieldCount > 0 && (
          <Box className="sticky-actions">
            <Button data-tour="print" fullWidth size="md" leftSection={<IconPrinter size={18} />} onClick={() => void print()}>
              {t('prepare.print')}
            </Button>
          </Box>
        )}
      </Stack>
    );
  }
  return (
    <Box className="prepare-grid">
      <Stack gap="md">
        {importCard}
        {settingsCard}
        {recentCard}
      </Stack>
      {preview}
    </Box>
  );
}
