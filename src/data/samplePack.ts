import { createInstallationId } from '../utils/appInfo';
import type { AppState, PackRecord, TaskPack } from '../types';

const mask = require('../../images/WLA_metmuseum_Pendant_Mask_Iyoba_Court_of_Benin.webp');

/**
 * Lot de démonstration.
 *
 * ATTENTION — les consignes en lingala, kituba et kikongo ci-dessous sont des
 * ébauches destinées à tester l'affichage trilingue. Elles doivent être relues
 * et corrigées par un locuteur natif avant toute utilisation sur le terrain.
 * Aucune donnée produite sur ce lot ne doit entrer dans le corpus : son
 * identifiant `bli-demo-iyoba` sert précisément à l'écarter au dépouillement.
 */
export const samplePack: TaskPack = {
  id: 'bli-demo-iyoba',
  name: 'Lot découverte — arts du Bénin',
  nameEn: 'Discovery pack — arts of Benin',
  version: '1.0.0',
  source: 'bundled',
  downloadedAt: '2026-08-18T00:00:00.000Z',
  targetItems: 6,
  targetLanguage: 'ln',
  availableLanguages: ['ln', 'ktu', 'kg'],
  items: [
    {
      id: 'iyoba-01',
      bundledImage: mask,
      prompts: {
        ln: 'Lobá na ntína ya elɔ́kɔ ya libosó ozali komóna na elilingi oyo.',
        ktu: 'Tubila kima ya ntete ya nge ke mona na kifwanisu yayi.',
        kg: 'Tubila lekwa dia ntete oyo omweni mu kifwaniswa kiaki.',
      },
      fallbackPrompt: 'Décrivez l’objet principal visible dans cette image.',
      fallbackPromptEn: 'Describe the main object visible in this image.',
      minWords: 4,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-02',
      bundledImage: mask,
      prompts: {
        ln: 'Lobá na ntína ya bilɔ́kɔ, balangi mpé lolenge ya loposo ozali komóna.',
        ktu: 'Tubila bima, bangala ti mutindu ya nitu ya nge ke mona.',
        kg: 'Tubila bima, mabala ye mpila ya kinitu oyo omweni.',
      },
      fallbackPrompt: 'Décrivez les matériaux, couleurs et textures visibles.',
      fallbackPromptEn: 'Describe the visible materials, colors and textures.',
      minWords: 6,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-03',
      bundledImage: mask,
      prompts: {
        ln: 'Lakisá esíká elɔ́kɔ ezalí mpé bilɔ́kɔ ezingi yangó.',
        ktu: 'Songa kisika kima yina kele ti bima yina me zinga yo.',
        kg: 'Songa vwanda lekwa dina ye bima biozungidi dio.',
      },
      fallbackPrompt: 'Situez l’objet dans son environnement immédiat.',
      fallbackPromptEn: 'Describe the object in its immediate environment.',
      minWords: 8,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-04',
      bundledImage: mask,
      prompts: {
        ln: 'Lobá malámu na ntína ya bilembo ya elongi emonisami.',
        ktu: 'Tubila mbote-mbote bidimbu ya luse yina ke monana.',
        kg: 'Tubila mbote-mbote bidimbu bia luse lolo lumonanga.',
      },
      fallbackPrompt: 'Décrivez précisément les détails du visage représenté.',
      fallbackPromptEn: 'Precisely describe the details of the represented face.',
      minWords: 10,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-05',
      bundledImage: mask,
      prompts: {
        ln: 'Kómá lisolo ya solo mpenza, kozanga kobakisa makanisi na yo.',
        ktu: 'Sonika disolo ya kieleka, kukonda kubakisa mabanza na nge.',
        kg: 'Soneka disolo dia ludi, kukonda kuyika mabanza maku.',
      },
      fallbackPrompt: 'Rédigez une description factuelle sans interpréter la scène.',
      fallbackPromptEn: 'Write a factual description without interpreting the scene.',
      minWords: 12,
      credit: 'The Metropolitan Museum of Art',
    },
    {
      id: 'iyoba-06',
      bundledImage: mask,
      prompts: {
        ln: 'Kómá ndimbola mobimba ya elilingi oyo mpo na moto oyo azali komóna te.',
        ktu: 'Sonika ndinga ya mvimba ya kifwanisu yayi sambu na muntu yina ke mona ve.',
        kg: 'Soneka ndinga ya mvimba ya kifwaniswa kiaki mu diambu dia muntu ke mona ko.',
      },
      fallbackPrompt: 'Produisez une légende complète et accessible pour cette image.',
      fallbackPromptEn: 'Write a complete and accessible caption for this image.',
      minWords: 14,
      credit: 'The Metropolitan Museum of Art',
    },
  ],
};

export function packRecordFrom(pack: TaskPack, now = new Date().toISOString()): PackRecord {
  return {
    id: pack.id,
    name: pack.name,
    version: pack.version,
    source: pack.source,
    targetItems: pack.targetItems ?? pack.items.length,
    targetLanguage: pack.targetLanguage,
    availableLanguages: pack.availableLanguages,
    firstSeenAt: now,
    lastActiveAt: now,
    items: pack.items.map((item) => ({
      id: item.id,
      originPackId: item.originPackId,
      minWords: item.minWords,
      metadata: item.metadata,
    })),
  };
}

export const initialState: AppState = {
  schemaVersion: 4,
  installationId: createInstallationId(),
  onboardingCompleted: false,
  profile: null,
  collectionClocks: {},
  profileWorkspaces: {},
  packRegistry: { [samplePack.id]: packRecordFrom(samplePack) },
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
