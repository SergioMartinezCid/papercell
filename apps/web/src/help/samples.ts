/** The sample sheets and their photos, made by scripts/sample-photos.ts. */
import type { Template } from '@papercell/core';
import type { Lang } from '../i18n';
import data from './samples.json';

interface Sample {
  /** Fingerprint printed in the photo's page code. */
  templateId: number;
  /** Path of the photo, under the app's base URL. */
  photo: string;
  template: Template;
}

const SAMPLES = data as unknown as Record<Lang, Sample>;

/** The sample sheet in `lang`. */
export function sampleTemplate(lang: Lang): Template {
  return SAMPLES[lang].template;
}

/** The sample sheet a scanned page belongs to, if it is a photo of one. */
export function findSampleTemplate(templateId: number): Template | undefined {
  return Object.values(SAMPLES).find((s) => s.templateId === templateId)?.template;
}

/** Downloads the sample photo in `lang`, named `name`. */
export async function samplePhoto(lang: Lang, name: string): Promise<File> {
  const response = await fetch(`${import.meta.env.BASE_URL}${SAMPLES[lang].photo}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new File([await response.blob()], name, { type: 'image/jpeg' });
}
