import type { TaskPack } from '../types';
import { betaPhotos } from './betaPhotos';

/** One distinct, locally bundled photograph per exercise. */
export const betaPack: TaskPack = {
  id: 'bli-beta-congo-100',
  name: 'Bêta — Congo et Afrique · 100 photos',
  nameEn: 'Beta — Congo and Africa · 100 photos',
  version: '1.0.0',
  source: 'bundled',
  downloadedAt: '2026-09-14T00:00:00.000Z',
  targetItems: 100,
  targetLanguage: 'ln',
  availableLanguages: ['ln', 'ktu', 'kg'],
  items: betaPhotos.map((photo) => ({
    id: photo.id,
    bundledImage: photo.image,
    // The demo translations have not been reviewed by native speakers. For
    // beta testing, use an explicit FR/EN instruction and the chosen response
    // language, rather than presenting those drafts as validated translations.
    prompts: {},
    fallbackPrompt: 'Décrivez cette image dans votre langue de collecte. Présentez ce que vous voyez, les actions et les détails, sans inventer ce qui n’est pas visible.',
    fallbackPromptEn: 'Describe this image in your collection language. Explain what you see, the actions and the details, without inventing anything that is not visible.',
    minWords: 15,
    credit: `${photo.title} — ${photo.author} · ${photo.license}`,
    metadata: {
      source: 'beta',
      category: photo.category,
      commonsPageId: photo.commonsPageId,
      sourceUrl: photo.sourceUrl,
      license: photo.license,
      licenseUrl: photo.licenseUrl,
      author: photo.author,
      modifications: photo.modifications,
      imageSha256: photo.sha256,
      promptLanguage: 'interface',
    },
  })),
};
