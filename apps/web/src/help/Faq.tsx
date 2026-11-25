import { Accordion, Modal, Stack, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { faqEn } from './faq.en';
import { faqEs } from './faq.es';

interface Props {
  opened: boolean;
  /** The question to open and scroll to, if any. */
  question: string | null;
  mobile: boolean;
  onClose: () => void;
}

/** Questions and answers, grouped by topic. */
export function Faq({ opened, question, mobile, onClose }: Props) {
  const { t, lang } = useI18n();
  const sections = lang === 'es' ? faqEs : faqEn;
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    if (!opened) return;
    setExpanded(question ? [question] : []);
    if (!question) return;
    // After the modal has opened.
    const timer = window.setTimeout(() => document.getElementById(`faq-${question}`)?.scrollIntoView({ block: 'start' }), 250);
    return () => window.clearTimeout(timer);
  }, [opened, question]);

  return (
    <Modal opened={opened} onClose={onClose} title={t('faq.title')} size="lg" fullScreen={mobile} styles={{ title: { fontWeight: 700 } }}>
      <Stack gap="lg">
        {sections.map((section) => (
          <Stack key={section.title} gap="xs">
            <Title order={3} size="h5">
              {section.title}
            </Title>
            <Accordion multiple variant="separated" value={expanded} onChange={setExpanded}>
              {section.items.map((item) => (
                <Accordion.Item key={item.id} value={item.id} id={`faq-${item.id}`}>
                  <Accordion.Control>{item.question}</Accordion.Control>
                  <Accordion.Panel>{item.answer}</Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </Stack>
        ))}
      </Stack>
    </Modal>
  );
}
