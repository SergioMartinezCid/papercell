import { ActionIcon, AppShell, Box, Group, Menu, SegmentedControl, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import { IconHelp, IconLanguage, IconMessageQuestion, IconMoon, IconPhotoScan, IconPrinter, IconRoute, IconSun } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Faq } from './help/Faq';
import { HelpContext } from './help/HelpContext';
import { Tour, type TourStep } from './help/Tour';
import { LANGUAGES, useI18n } from './i18n';
import type { MessageKey } from './i18n/en';
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
  /** The questions and answers, when open: the question to show, or '' for none in particular. */
  const [faq, setFaq] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  /** The tab the tour started on, to go back to when it ends. */
  const tourFrom = useRef<Tab>(tab);
  const help = useMemo(
    () => ({
      openFaq: (question?: string) => setFaq(question ?? ''),
      startTour: () => {
        tourFrom.current = tabRef.current;
        setTouring(true);
      },
    }),
    [],
  );
  const endTour = useCallback(() => {
    setTouring(false);
    setTab(tourFrom.current);
  }, []);
  const tourSteps = useMemo<Array<TourStep<Tab>>>(() => {
    const step = (id: string, tab: Tab, target?: string, fixed = false): TourStep<Tab> => ({
      id,
      tab,
      target,
      fixed,
      title: t(`tour.${id}.title` as MessageKey),
      body: t(`tour.${id}.body` as MessageKey),
    });
    return [
      step('welcome', 'prepare', 'tabs', true),
      step('import', 'prepare', 'import'),
      step('preview', 'prepare', 'preview'),
      step('cell', 'prepare', 'cell'),
      step('settings', 'prepare', 'settings'),
      step('print', 'prepare', 'print'),
      step('scan', 'scan', 'scan-add'),
      step('sample', 'scan', 'sample'),
      step('review', 'scan', 'scan-page'),
      step('results', 'scan', 'results'),
      step('help', 'scan', 'help', true),
    ];
  }, [t]);

  const tabs = [
    { value: 'prepare', label: <TabLabel icon={<IconPrinter size={16} />} text={t('nav.prepare')} /> },
    { value: 'scan', label: <TabLabel icon={<IconPhotoScan size={16} />} text={t('nav.scan')} /> },
  ];
  if (mobile) tabs.reverse();

  return (
    <HelpContext.Provider value={help}>
      <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="xs">
            <Group gap={8} wrap="nowrap" className="header-logo">
              <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
              <Text fw={700} visibleFrom="xs">
                Papercell
              </Text>
            </Group>
            <SegmentedControl data-tour="tabs" value={tab} onChange={(v) => setTab(v as Tab)} data={tabs} />
            <Group gap={4} wrap="nowrap">
              <Menu position="bottom-end">
                <Menu.Target>
                  <Tooltip label={t('help.title')}>
                    <ActionIcon data-tour="help" className="header-icon" variant="subtle" color="gray" size="lg" aria-label={t('help.title')}>
                      <IconHelp size={20} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconRoute size={16} />} onClick={help.startTour}>
                    {t('help.tour')}
                  </Menu.Item>
                  <Menu.Item leftSection={<IconMessageQuestion size={16} />} onClick={() => help.openFaq()}>
                    {t('help.faq')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Menu position="bottom-end">
                <Menu.Target>
                  <Tooltip label={t('header.language')}>
                    <ActionIcon className="header-icon" variant="subtle" color="gray" size="lg" aria-label={t('header.language')}>
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
                <ActionIcon className="header-icon" variant="subtle" color="gray" size="lg" aria-label={t('header.colorScheme')} onClick={toggleColorScheme}>
                  {colorScheme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <Box display={tab === 'prepare' ? undefined : 'none'}>
            <PreparePage active={tab === 'prepare'} mobile={mobile} touch={touch} demo={touring} />
          </Box>
          <Box display={tab === 'scan' ? undefined : 'none'}>
            <ScanPage active={tab === 'scan'} mobile={mobile} />
          </Box>
        </AppShell.Main>
        <Faq opened={faq !== null} question={faq || null} mobile={mobile} onClose={() => setFaq(null)} />
        {touring && <Tour steps={tourSteps} onTab={setTab} onClose={endTour} />}
      </AppShell>
    </HelpContext.Provider>
  );
}

function TabLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Group gap={6} wrap="nowrap" justify="center">
      <span className="tab-icon">{icon}</span>
      <span>{text}</span>
    </Group>
  );
}
