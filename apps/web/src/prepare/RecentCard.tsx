import { ActionIcon, Button, Card, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { templateIdHex } from '@papercell/core';
import type { StoredTemplate } from '../lib/templates';
import { useI18n } from '../i18n';

interface Props {
  items: StoredTemplate[];
  currentId: number | null;
  onOpen: (item: StoredTemplate) => void;
  onDelete: (item: StoredTemplate) => void;
}

export function RecentCard({ items, currentId, onOpen, onDelete }: Props) {
  const { t, lang } = useI18n();
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs">
        <Title order={2} size="h4">
          {t('prepare.recent.title')}
        </Title>
        {items.length === 0 && (
          <Text size="sm" c="dimmed">
            {t('prepare.recent.none')}
          </Text>
        )}
        {items.map((item) => {
          const { sheet, settings } = item.template;
          return (
            <Group key={item.id} justify="space-between" wrap="nowrap" gap="xs">
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>
                  {settings.title || t('scan.sheet', { id: templateIdHex(item.id) })}
                </Text>
                <Text size="xs" c="dimmed">
                  {date.format(item.savedAt)} · {sheet.rowHeights.length}×{sheet.colWidths.length}
                </Text>
              </div>
              <Group gap={4} wrap="nowrap">
                <Button size="xs" variant={item.id === currentId ? 'light' : 'default'} onClick={() => onOpen(item)}>
                  {t('prepare.recent.open')}
                </Button>
                <Tooltip label={t('prepare.recent.delete')}>
                  <ActionIcon variant="subtle" color="gray" aria-label={t('prepare.recent.delete')} onClick={() => onDelete(item)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
