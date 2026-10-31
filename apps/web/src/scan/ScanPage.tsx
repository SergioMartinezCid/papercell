import { ActionIcon, Alert, Badge, Box, Button, Card, Group, Image, Loader, Paper, Popover, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconPhoto, IconPhotoScan, IconTrash } from '@tabler/icons-react';
import { DEFAULT_OUTPUT, templateIdHex, type OutputOptions } from '@papercell/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useI18n } from '../i18n';
import { readJsonPreference, writePreference } from '../lib/preferences';
import { deleteScan, listScans, saveScan } from '../lib/scans';
import { findTemplate, type StoredTemplate } from '../lib/templates';
import { OutputPanel } from './OutputPanel';
import { ReviewModal } from './ReviewModal';
import { scanImage } from './scanner';
import { isMarked, needsCheck, type ScanItem } from './types';

interface Props {
  active: boolean;
  mobile: boolean;
}

let nextId = 0;

export function ScanPage({ active, mobile }: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<ScanItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Map<number, StoredTemplate | null>>(new Map());
  const [options, setOptions] = useState<OutputOptions>(() => readJsonPreference('output', DEFAULT_OUTPUT));
  const [dragging, setDragging] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  /** Finished pages as last written to storage; null until the stored pages have been loaded. */
  const saved = useRef<Map<string, ScanItem> | null>(null);

  // Pages scanned earlier on this device.
  useEffect(() => {
    let cancelled = false;
    void listScans().then((stored) => {
      if (cancelled) return;
      const loaded: ScanItem[] = stored.map((s) => ({ ...s, status: 'done', previewUrl: URL.createObjectURL(s.preview) }));
      saved.current = new Map(loaded.map((i) => [i.id, i]));
      setItems((prev) => [...loaded, ...prev]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep storage in step with the finished pages: new or changed ones are written, removed ones deleted.
  useEffect(() => {
    const before = saved.current;
    if (!before) return;
    const now = new Map(items.filter((i) => i.status === 'done').map((i) => [i.id, i]));
    for (const [id, item] of now) {
      if (before.get(id) === item || !item.scan || !item.preview) continue;
      void saveScan({ id, name: item.name, addedAt: item.addedAt, scan: item.scan, decisions: item.decisions, preview: item.preview });
    }
    for (const id of before.keys()) if (!now.has(id)) void deleteScan(id);
    saved.current = now;
  }, [items]);

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name))) {
        // Unique across reloads, since pages are stored by id.
        const id = `scan-${Date.now().toString(36)}-${++nextId}`;
        setItems((prev) => [...prev, { id, name: file.name, addedAt: Date.now(), status: 'processing', decisions: {} }]);
        void scanImage(id, file).then((res) => {
          if (!res.ok) {
            setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'error', error: res.error } : i)));
            return;
          }
          const samePage = (i: ScanItem) =>
            i.id !== id && i.scan?.payload.templateId === res.scan.payload.templateId && i.scan.payload.pageIndex === res.scan.payload.pageIndex;
          const replaced = itemsRef.current.filter(samePage);
          for (const r of replaced) if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
          if (replaced.length) notifications.show({ message: t('scan.replaced') });
          const previewUrl = URL.createObjectURL(res.preview);
          setItems((prev) =>
            prev.filter((i) => !samePage(i)).map((i) => (i.id === id ? { ...i, status: 'done', scan: res.scan, preview: res.preview, previewUrl } : i)),
          );
        });
      }
    },
    [t],
  );

  // Pasting an image (Ctrl+V) on this screen scans it.
  useEffect(() => {
    if (!active) return;
    const handler = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [active, addFiles]);

  const groups = useMemo(() => {
    const byTemplate = new Map<number, ScanItem[]>();
    for (const item of items) {
      if (item.status !== 'done' || !item.scan) continue;
      const id = item.scan.payload.templateId;
      byTemplate.set(id, [...(byTemplate.get(id) ?? []), item]);
    }
    return [...byTemplate.entries()].map(([id, pages]) => ({
      id,
      pages: pages.sort((a, b) => a.scan!.payload.pageIndex - b.scan!.payload.pageIndex),
      pageCount: pages[0].scan!.payload.pageCount,
    }));
  }, [items]);

  // The original sheet, when it was prepared on this device: gives a title and the text of non-box cells.
  useEffect(() => {
    for (const g of groups) {
      if (templates.has(g.id)) continue;
      void findTemplate(g.id).then((found) => setTemplates((m) => new Map(m).set(g.id, found ?? null)));
    }
  }, [groups, templates]);

  const remove = (item: ScanItem) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const removeAll = () => {
    for (const item of items) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    // Pages still being read are kept.
    setItems((prev) => prev.filter((i) => i.status === 'processing'));
  };

  const decide = useCallback((item: ScanItem, row: number, col: number, marked: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, decisions: { ...i.decisions, [`${row},${col}`]: marked } } : i)));
  }, []);

  const updateOptions = (patch: Partial<OutputOptions>) =>
    setOptions((current) => {
      const next = { ...current, ...patch };
      writePreference('output', JSON.stringify(next));
      return next;
    });

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.currentTarget.files ?? []));
    e.currentTarget.value = '';
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const pending = items.filter((i) => i.status !== 'done');
  const reviewItem = items.find((i) => i.id === reviewId) ?? null;

  return (
    <Stack gap="md" maw={980} mx="auto">
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onInput} />
      <input ref={filesInput} type="file" accept="image/*" multiple hidden onChange={onInput} />

      {mobile ? (
        <Stack gap="xs">
          <Button size="lg" leftSection={<IconCamera />} onClick={() => cameraInput.current?.click()}>
            {t('scan.add.camera')}
          </Button>
          <Button variant="default" leftSection={<IconPhoto size={18} />} onClick={() => filesInput.current?.click()}>
            {t('scan.add.choose')}
          </Button>
          <Text size="xs" c="dimmed" ta="center">
            {t('scan.tips')}
          </Text>
        </Stack>
      ) : (
        <Paper
          withBorder
          radius="md"
          p="xl"
          className={dragging ? 'drop-zone is-dragging' : 'drop-zone'}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Stack align="center" gap="xs" ta="center">
            <IconPhotoScan size={40} stroke={1.4} />
            <Text>{t('scan.add.drop')}</Text>
            <Button variant="default" leftSection={<IconPhoto size={18} />} onClick={() => filesInput.current?.click()}>
              {t('scan.add.choose')}
            </Button>
            <Text size="xs" c="dimmed">
              {t('scan.tips')}
            </Text>
          </Stack>
        </Paper>
      )}

      {items.length === 0 && (
        <Text size="sm" c="dimmed" ta="center">
          {t('scan.empty')}
        </Text>
      )}

      {pending.map((item) =>
        item.status === 'processing' ? (
          <Group key={item.id} gap="sm">
            <Loader size="sm" />
            <Text size="sm">
              {t('scan.status.processing')} <Text span c="dimmed">{item.name}</Text>
            </Text>
          </Group>
        ) : (
          <Alert
            key={item.id}
            color="red"
            title={item.name}
            withCloseButton
            onClose={() => remove(item)}
          >
            {t(`scan.error.${item.error ?? 'unreadable-image'}`)}
          </Alert>
        ),
      )}

      {groups.length > 0 && (
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {t('scan.kept')}
          </Text>
          <Popover position="bottom-end" withArrow shadow="md">
            <Popover.Target>
              <Button variant="subtle" color="gray" size="xs" leftSection={<IconTrash size={14} />} style={{ flexShrink: 0 }}>
                {t('scan.removeAll')}
              </Button>
            </Popover.Target>
            <Popover.Dropdown maw={260}>
              <Stack gap="xs">
                <Text size="sm">{t('scan.removeAllConfirm')}</Text>
                <Button color="red" size="xs" onClick={removeAll}>
                  {t('scan.removeAll')}
                </Button>
              </Stack>
            </Popover.Dropdown>
          </Popover>
        </Group>
      )}

      {groups.map((g) => {
        const stored = templates.get(g.id) ?? undefined;
        const title = stored?.template.settings.title || t('scan.sheet', { id: templateIdHex(g.id) });
        const have = new Set(g.pages.map((p) => p.scan!.payload.pageIndex));
        const missing = Array.from({ length: g.pageCount }, (_, i) => i).filter((i) => !have.has(i));
        return (
          <Card key={g.id} withBorder radius="md" padding="md">
            <Stack gap="md">
              <Group justify="space-between" gap="xs">
                <Title order={2} size="h4">
                  {title}
                </Title>
                <Badge variant="light" color={missing.length ? 'orange' : 'green'}>
                  {t('scan.pages', { have: have.size, total: g.pageCount })}
                </Badge>
              </Group>
              {missing.length > 0 && (
                <Alert color="orange" p="xs">
                  {t('scan.missing', { pages: missing.map((i) => i + 1).join(', ') })}
                </Alert>
              )}
              <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
                {g.pages.map((p) => {
                  const marked = p.scan!.boxes.filter((b) => isMarked(p, b)).length;
                  const check = p.scan!.boxes.filter((b) => needsCheck(p, b)).length;
                  return (
                    <Paper key={p.id} withBorder radius="sm" p={6}>
                      <Box style={{ cursor: 'pointer' }} onClick={() => setReviewId(p.id)}>
                        <Image src={p.previewUrl} alt={t('scan.page', { n: p.scan!.payload.pageIndex + 1 })} radius="xs" />
                      </Box>
                      <Text size="sm" fw={500} mt={4}>
                        {t('scan.page', { n: p.scan!.payload.pageIndex + 1 })}
                      </Text>
                      <Text size="xs" c={check ? 'orange' : 'dimmed'}>
                        {t('scan.counts', { marked, check })}
                      </Text>
                      <Group gap={4} mt={6} wrap="nowrap">
                        <Button size="xs" variant={check ? 'filled' : 'light'} color={check ? 'orange' : undefined} style={{ flex: 1 }} onClick={() => setReviewId(p.id)}>
                          {t('scan.review')}
                        </Button>
                        <Tooltip label={t('scan.remove')}>
                          <ActionIcon variant="subtle" color="gray" aria-label={t('scan.remove')} onClick={() => remove(p)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Paper>
                  );
                })}
              </SimpleGrid>
              <Title order={3} size="h5">
                {t('output.title')}
              </Title>
              <OutputPanel
                pages={g.pages}
                template={stored?.template}
                fileName={(stored?.template.settings.title || `papercell-${templateIdHex(g.id)}`).replace(/[^\w.-]+/g, '_')}
                options={options}
                onOptions={updateOptions}
              />
            </Stack>
          </Card>
        );
      })}

      <ReviewModal key={reviewId ?? 'none'} item={reviewItem} mobile={mobile} onClose={() => setReviewId(null)} onDecide={decide} />
    </Stack>
  );
}
