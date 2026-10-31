import { Box, Button, Card, FileButton, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconClipboard, IconUpload } from '@tabler/icons-react';
import type { Sheet } from '@papercell/core';
import { useI18n } from '../i18n';

interface Props {
  touch: boolean;
  anchor: string;
  anchorValid: boolean;
  onAnchorChange: (value: string) => void;
  onPaste: (data: DataTransfer | null) => void;
  onFile: (file: File) => void;
  worksheets: Array<{ name: string; sheet: Sheet }>;
  worksheet: string | null;
  onWorksheet: (name: string) => void;
}

export function ImportCard(p: Props) {
  const { t } = useI18n();
  const label = p.touch ? t('prepare.import.pasteTargetTouch') : t('prepare.import.pasteTarget');
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Title order={2} size="h4">
          {t('prepare.import.title')}
        </Title>
        {/* A real (empty) text field, so that touch screens offer Paste on long press; the label is drawn over it. */}
        <Box className="paste-target">
          <textarea
            aria-label={label}
            value=""
            onChange={() => undefined}
            onPaste={(e) => {
              e.preventDefault();
              p.onPaste(e.clipboardData);
            }}
          />
          <Stack className="paste-target-label" align="center" gap={4} aria-hidden>
            <IconClipboard size={28} stroke={1.5} />
            <Text size="sm" ta="center">
              {label}
            </Text>
          </Stack>
        </Box>
        <FileButton onChange={(f) => f && p.onFile(f)} accept=".xlsx,.csv,.tsv,.txt,text/csv,text/tab-separated-values">
          {(props) => (
            <Button {...props} variant="default" leftSection={<IconUpload size={16} />}>
              {t('prepare.import.upload')}
              <Text span size="xs" c="dimmed" ml={6}>
                {t('prepare.import.uploadHint')}
              </Text>
            </Button>
          )}
        </FileButton>
        {p.worksheets.length > 1 && (
          <Select
            label={t('prepare.import.worksheet')}
            data={p.worksheets.map((w) => w.name)}
            value={p.worksheet}
            onChange={(v) => v && p.onWorksheet(v)}
            allowDeselect={false}
          />
        )}
        <TextInput
          label={t('prepare.import.anchor')}
          description={t('prepare.import.anchorHint')}
          value={p.anchor}
          onChange={(e) => p.onAnchorChange(e.currentTarget.value)}
          error={p.anchorValid ? undefined : t('prepare.import.anchorInvalid')}
          maw={260}
        />
      </Stack>
    </Card>
  );
}
