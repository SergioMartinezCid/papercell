import { Card, Input, SegmentedControl, Stack, Switch, TextInput, Title } from '@mantine/core';
import type { LayoutSettings } from '@papercell/core';
import { useI18n } from '../i18n';

interface Props {
  settings: LayoutSettings;
  onChange: (patch: Partial<LayoutSettings>) => void;
}

export function SettingsCard({ settings, onChange }: Props) {
  const { t } = useI18n();
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Title order={2} size="h4">
          {t('prepare.settings.title')}
        </Title>
        <TextInput
          label={t('prepare.settings.name')}
          placeholder={t('prepare.settings.namePlaceholder')}
          value={settings.title}
          onChange={(e) => onChange({ title: e.currentTarget.value })}
        />
        <Input.Wrapper label={t('prepare.settings.paper')}>
          <SegmentedControl
            fullWidth
            value={settings.paper}
            onChange={(v) => onChange({ paper: v as LayoutSettings['paper'] })}
            data={[
              { value: 'a4', label: 'A4' },
              { value: 'letter', label: 'Letter' },
            ]}
          />
        </Input.Wrapper>
        <Input.Wrapper label={t('prepare.settings.orientation')}>
          <SegmentedControl
            fullWidth
            value={settings.orientation}
            onChange={(v) => onChange({ orientation: v as LayoutSettings['orientation'] })}
            data={[
              { value: 'portrait', label: t('prepare.settings.portrait') },
              { value: 'landscape', label: t('prepare.settings.landscape') },
            ]}
          />
        </Input.Wrapper>
        <Input.Wrapper label={t('prepare.settings.fit')}>
          <SegmentedControl
            fullWidth
            value={settings.fit}
            onChange={(v) => onChange({ fit: v as LayoutSettings['fit'] })}
            data={[
              { value: 'page', label: t('prepare.settings.fitPage') },
              { value: 'width', label: t('prepare.settings.fitWidth') },
            ]}
          />
        </Input.Wrapper>
        <Input.Wrapper label={t('prepare.settings.backgrounds')}>
          <SegmentedControl
            fullWidth
            value={settings.backgrounds}
            onChange={(v) => onChange({ backgrounds: v as LayoutSettings['backgrounds'] })}
            data={[
              { value: 'none', label: t('prepare.settings.bgNone') },
              { value: 'text', label: t('prepare.settings.bgText') },
              { value: 'all', label: t('prepare.settings.bgAll') },
            ]}
          />
        </Input.Wrapper>
        <Switch label={t('prepare.settings.gridlines')} checked={settings.gridlines} onChange={(e) => onChange({ gridlines: e.currentTarget.checked })} />
        <Switch
          label={t('prepare.settings.repeatHeader')}
          checked={settings.repeatHeader}
          onChange={(e) => onChange({ repeatHeader: e.currentTarget.checked })}
        />
      </Stack>
    </Card>
  );
}
