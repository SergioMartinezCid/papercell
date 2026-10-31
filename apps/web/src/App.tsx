import { ActionIcon, AppShell, Box, Group, Menu, SegmentedControl, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import { IconLanguage, IconMoon, IconPhotoScan, IconPrinter, IconSun } from '@tabler/icons-react';
import { useState } from 'react';
import { LANGUAGES, useI18n } from './i18n';
import { PreparePage } from './prepare/PreparePage';
import { ScanPage } from './scan/ScanPage';

type Tab = 'scan' | 'prepare';

const MOBILE_QUERY = '(max-width: 48em)';

export function App() {
  const { t, lang, setLang } = useI18n();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [mobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const touch = window.matchMedia('(pointer: coarse)').matches;
  // Phones open on Scan (Prepare stays one tap away); computers open on Prepare.
  const [tab, setTab] = useState<Tab>(mobile ? 'scan' : 'prepare');

  const tabs = [
    { value: 'prepare', label: <TabLabel icon={<IconPrinter size={16} />} text={t('nav.prepare')} /> },
    { value: 'scan', label: <TabLabel icon={<IconPhotoScan size={16} />} text={t('nav.scan')} /> },
  ];
  if (mobile) tabs.reverse();

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={8} wrap="nowrap">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
            <Text fw={700} visibleFrom="xs">
              Papercell
            </Text>
          </Group>
          <SegmentedControl value={tab} onChange={(v) => setTab(v as Tab)} data={tabs} />
          <Group gap={4} wrap="nowrap">
            <Menu position="bottom-end">
              <Menu.Target>
                <Tooltip label={t('header.language')}>
                  <ActionIcon variant="subtle" color="gray" size="lg" aria-label={t('header.language')}>
                    <IconLanguage size={20} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                {LANGUAGES.map((l) => (
                  <Menu.Item key={l.value} onClick={() => setLang(l.value)} fw={l.value === lang ? 700 : undefined}>
                    {l.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <Tooltip label={t('header.colorScheme')}>
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label={t('header.colorScheme')} onClick={toggleColorScheme}>
                {colorScheme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Box display={tab === 'prepare' ? undefined : 'none'}>
          <PreparePage active={tab === 'prepare'} mobile={mobile} touch={touch} />
        </Box>
        <Box display={tab === 'scan' ? undefined : 'none'}>
          <ScanPage active={tab === 'scan'} mobile={mobile} />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

function TabLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Group gap={6} wrap="nowrap" justify="center">
      {icon}
      <span>{text}</span>
    </Group>
  );
}
