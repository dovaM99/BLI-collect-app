import { buildLexiconIndex, entryOf, entryVariants } from './lexiconIndex';
import { DEFAULT_SUGGESTION_LIMIT, searchLexicon } from './lexiconSearch';
import type {
  LexiconEntriesPayload,
  LexiconIndex,
  LexiconLanguage,
  LexiconSuggestion,
} from './types';

export * from './types';
export { normalizeLexeme, displayLexeme, splitVariants } from './normalizeLexeme';
export { damerauLevenshtein, prefixDistance, getMaxDistance } from './damerauLevenshtein';
export {
  buildLexiconIndex,
  prefixSearch,
  entryVariants,
  lexemesOf,
  browseLexemes,
  browseSortKey,
} from './lexiconIndex';
export { searchLexicon, scoreCandidate, DEFAULT_SUGGESTION_LIMIT } from './lexiconSearch';

/**
 * Langues du lexique dans leur ordre d'affichage. Celles qui ne sont pas encore
 * presentes dans les donnees apparaissent desactivees et s'activent d'elles-
 * memes des que la colonne correspondante arrive : aucune modification de code
 * n'est necessaire pour ouvrir le kituba ou le kikongo.
 */
export const LEXICON_LANGUAGE_ORDER: LexiconLanguage[] = ['fr', 'en', 'ln', 'ktu', 'kg'];

export const LEXICON_LANGUAGE_LABELS: Record<LexiconLanguage, string> = {
  fr: 'Francais',
  en: 'English',
  ln: 'Lingala',
  ktu: 'Kituba',
  kg: 'Kikongo',
  pt: 'Portugues',
};

export const LEXICON_LANGUAGE_SHORT: Record<LexiconLanguage, string> = {
  fr: 'FR',
  en: 'EN',
  ln: 'LN',
  ktu: 'KTU',
  kg: 'KG',
  pt: 'POR',
};

export function lexiconLabel(language: LexiconLanguage) {
  return LEXICON_LANGUAGE_LABELS[language] ?? language.toUpperCase();
}

export function lexiconShortLabel(language: LexiconLanguage) {
  return LEXICON_LANGUAGE_SHORT[language] ?? language.toUpperCase();
}

let cachedIndex: LexiconIndex | null = null;

/**
 * L'index est construit a la premiere consultation du lexique, jamais au
 * demarrage de l'application : un collecteur qui n'ouvre pas cet ecran ne paie
 * rien. La construction est ensuite conservee pour toute la duree de la session.
 */
export function getLexiconIndex(): LexiconIndex {
  if (cachedIndex) return cachedIndex;
  const payload = require('../../data/lexiconEntries.json') as LexiconEntriesPayload;
  cachedIndex = buildLexiconIndex(payload);
  return cachedIndex;
}

/** Uniquement pour les tests : repart d'un index neuf. */
export function resetLexiconIndex() {
  cachedIndex = null;
}

/** Langues reellement pourvues d'au moins une forme. */
export function availableLexiconLanguages(index: LexiconIndex = getLexiconIndex()) {
  return LEXICON_LANGUAGE_ORDER.filter((language) => (index.byLanguage[language]?.length ?? 0) > 0);
}

export function isLexiconLanguageAvailable(
  language: LexiconLanguage,
  index: LexiconIndex = getLexiconIndex(),
) {
  return (index.byLanguage[language]?.length ?? 0) > 0;
}

export function lexiconEntryCount(index: LexiconIndex = getLexiconIndex()) {
  return index.entries.length;
}

export type LexiconLookup = {
  query: string;
  sourceLanguage: LexiconLanguage;
  limit?: number;
};

export function lookupLexicon(
  { query, sourceLanguage, limit = DEFAULT_SUGGESTION_LIMIT }: LexiconLookup,
  index: LexiconIndex = getLexiconIndex(),
): LexiconSuggestion[] {
  return searchLexicon(index, { query, sourceLanguage, limit });
}

/** Variantes d'une entree dans une langue, pour la fiche detaillee. */
export function translationsFor(
  entryId: number,
  language: LexiconLanguage,
  index: LexiconIndex = getLexiconIndex(),
): string[] {
  return entryVariants(index, entryId, language);
}

/** Texte original d'une entree dans une langue, tel qu'il figure au dictionnaire. */
export function originalFormFor(
  entryId: number,
  language: LexiconLanguage,
  index: LexiconIndex = getLexiconIndex(),
): string {
  return entryOf(index, entryId)?.forms[language] ?? '';
}
