import { Alert, Badge, Box, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPrinter, IconTable } from '@tabler/icons-react';
import {
  buildPrintable,
  cellAddress,
  cellKey,
  DEFAULT_SETTINGS,
  parseCellAddress,
  templateFingerprint,
  type LayoutSettings,
  type Sheet,
  type Template,
} from '@papercell/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { sheetFromClipboard, sheetsFromFile } from '../lib/importSheet';
import { deleteTemplate, listTemplates, saveTemplate, type StoredTemplate } from '../lib/templates';
import { ImportCard } from './ImportCard';
import { PagePreview } from './PagePreview';
import { PrintRoot } from './PrintRoot';
import { RecentCard } from './RecentCard';
import { SettingsCard } from './SettingsCard';

const SMALL_BOX_MM = 3.5;

interface Props {
  active: boolean;
  mobile: boolean;
  touch: boolean;
}

export function PreparePage({ active, mobile, touch }: Props) {
  const { t } = useI18n();
  const [template, setTemplate] = useState<Template | null>(null);
  const [anchorText, setAnchorText] = useState('A1');
  const [recent, setRecent] = useState<StoredTemplate[]>([]);
  const [worksheets, setWorksheets] = useState<Array<{ name: string; sheet: Sheet }>>([]);
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

  const load = useCallback(
    (sheet: Sheet) => {
      if (sheet.cells.length === 0) {
        notifications.show({ color: 'orange', message: t('prepare.import.nothing') });
        return;
      }
      setTemplate((current) => ({
        sheet,
        overrides: {},
        settings: { ...DEFAULT_SETTINGS, ...current?.settings },
        anchor: anchor ?? { row: 0, col: 0 },
      }));
      notifications.show({ message: t('prepare.import.loaded', { rows: sheet.rowHeights.length, cols: sheet.colWidths.length }) });
    },
    [anchor, t],
  );

  const onPaste = useCallback(
    (data: DataTransfer | null) => {
      const sheet = sheetFromClipboard(data);
      if (!sheet) {
        notifications.show({ color: 'orange', message: t('prepare.import.nothing') });
        return;
      }
      setWorksheets([]);
      load(sheet);
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

  const onFile = async (file: File) => {
    try {
      const { sheets } = await sheetsFromFile(file);
      if (sheets.length === 0) throw new Error('empty');
      setWorksheets(sheets);
      setWorksheet(sheets[0].name);
      load(sheets[0].sheet);
    } catch {
      notifications.show({ color: 'red', message: t('prepare.import.failed') });
    }
  };

  const onAnchorChange = (value: string) => {
    setAnchorText(value);
    const parsed = parseCellAddress(value);
    if (parsed) setTemplate((current) => (current ? { ...current, anchor: parsed } : current));
  };

  const updateSettings = (patch: Partial<LayoutSettings>) =>
    setTemplate((current) => (current ? { ...current, settings: { ...current.settings, ...patch } } : current));

  const printable = useMemo(() => {
    if (!template) return null;
    try {
      return { ok: true as const, value: buildPrintable(template) };
    } catch {
      return { ok: false as const };
    }
  }, [template]);

  const toggle = useCallback(
    (row: number, col: number) => {
      if (!printable?.ok) return;
      const kind = printable.value.layout.kinds[row][col];
      setTemplate((current) => {
        if (!current) return current;
        const overrides = { ...current.overrides, [cellKey(row, col)]: kind === 'mark' ? ('blank' as const) : ('mark' as const) };
        return { ...current, overrides };
      });
    },
    [printable],
  );

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
  const currentId = template ? templateFingerprint(template) : null;

  const importCard = (
    <ImportCard
      touch={touch}
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
        if (found) load(found.sheet);
      }}
    />
  );
  const settingsCard = template && <SettingsCard settings={template.settings} onChange={updateSettings} />;
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
      {!template && (
        <Paper withBorder radius="md" p="xl">
          <Stack align="center" gap="xs" ta="center">
            <IconTable size={40} stroke={1.4} />
            <Title order={2} size="h3">
              {t('prepare.empty.title')}
            </Title>
            <Text c="dimmed" maw={460}>
              {t('prepare.empty.body')}
            </Text>
          </Stack>
        </Paper>
      )}
      {template && printable && !printable.ok && (
        <Alert color="red" icon={<IconAlertTriangle />}>
          {t('prepare.warn.tooComplex')}
        </Alert>
      )}
      {layout && printable?.ok && (
        <>
          <Group justify="space-between" gap="sm">
            <Group gap="xs">
              <Badge variant="light" size="lg">
                {t('prepare.summary.boxes', { count: layout.boxCount })}
              </Badge>
              <Badge variant="light" color="gray" size="lg">
                {layout.pages.length === 1 ? t('prepare.summary.page') : t('prepare.summary.pages', { count: layout.pages.length })}
              </Badge>
            </Group>
            {!mobile && (
              <Button leftSection={<IconPrinter size={18} />} onClick={() => void print()} disabled={layout.boxCount === 0}>
                {t('prepare.print')}
              </Button>
            )}
          </Group>
          {layout.boxCount === 0 && (
            <Alert color="orange" icon={<IconAlertTriangle />}>
              {t('prepare.warn.noBoxes')}
            </Alert>
          )}
          {layout.boxCount > 0 && layout.minBoxSide < SMALL_BOX_MM && (
            <Alert color="orange" icon={<IconAlertTriangle />}>
              {t('prepare.warn.smallBoxes', { size: layout.minBoxSide.toFixed(1) })}
            </Alert>
          )}
          <Text size="sm" c="dimmed">
            {t('prepare.preview.hint')} {t('prepare.printHint')}
          </Text>
          {printable.value.pages.map((page) => (
            <PagePreview key={page.layout.index} page={page} kinds={layout.kinds} onToggle={toggle} />
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
        {layout && layout.boxCount > 0 && (
          <Box className="sticky-actions">
            <Button fullWidth size="md" leftSection={<IconPrinter size={18} />} onClick={() => void print()}>
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
