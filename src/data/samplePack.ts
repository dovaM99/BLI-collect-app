import type { AppState, TaskPack } from '../types';

const mask = require('../../images/WLA_metmuseum_Pendant_Mask_Iyoba_Court_of_Benin.jpg');

export const samplePack: TaskPack = {
  id: 'bli-demo-iyoba',
  name: 'Lot découverte — arts du Bénin',
  nameEn: 'Discovery pack — arts of Benin',
  version: '1.0.0',
  source: 'bundled',
  downloadedAt: '2026-08-18T00:00:00.000Z',
  targetItems: 6,
  items: [
    {
      id: 'iyoba-01',
      bundledImage: mask,
      instruction: 'Décrivez l’objet principal visible dans cette image.',
      instructionEn: 'Describe the main object visible in this image.',
      minWords: 4,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-02',
      bundledImage: mask,
      instruction: 'Décrivez les matériaux, couleurs et textures visibles.',
      instructionEn: 'Describe the visible materials, colors and textures.',
      minWords: 6,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-03',
      bundledImage: mask,
      instruction: 'Situez l’objet dans son environnement immédiat.',
      instructionEn: 'Describe the object in its immediate environment.',
      minWords: 8,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-04',
      bundledImage: mask,
      instruction: 'Décrivez précisément les détails du visage représenté.',
      instructionEn: 'Precisely describe the details of the represented face.',
      minWords: 10,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-05',
      bundledImage: mask,
      instruction: 'Rédigez une description factuelle sans interpréter la scène.',
      instructionEn: 'Write a factual description without interpreting the scene.',
      minWords: 12,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-06',
      bundledImage: mask,
      instruction: 'Produisez une légende complète et accessible pour cette image.',
      instructionEn: 'Write a complete and accessible caption for this image.',
      minWords: 14,
      credit: 'The Metropolitan Museum of Art',
    },
  ],
};

export const initialState: AppState = {
  schemaVersion: 3,
  onboardingCompleted: false,
  profile: null,
  collectionClocks: {},
  profileWorkspaces: {},
  abandonedCollections: [],
  preferences: {
    language: 'fr',
    theme: 'light',
  },
  pack: samplePack,
  assignment: null,
  annotations: {},
  sessions: [],
  activeSessionId: null,
};
