/**
 * Le lexique est volontairement indépendant de `TargetLanguage` : il contient
 * des langues de consultation (français, anglais) qui ne sont pas des langues de
 * collecte, et il doit accueillir une nouvelle langue par simple ajout d'une
 * colonne dans les données, sans toucher au moteur.
 */
export type LexiconLanguage = string;

/** Une ligne du dictionnaire, telle qu'elle est fournie, sans découpage. */
export type DictionaryEntry = {
  id: number;
  /** Texte original par langue. Jamais modifié. */
  forms: Record<LexiconLanguage, string>;
};

/** Une forme recherchable. Une cellule à synonymes en produit plusieurs. */
export type Lexeme = {
  id: string;
  entryId: number;
  language: LexiconLanguage;
  /** Ce que voit l'utilisateur : typographie d'origine préservée. */
  displayForm: string;
  /** Ce sur quoi on cherche : minuscules, espaces et apostrophes unifiés. */
  normalizedForm: string;
};

export type LexiconIndex = {
  entries: DictionaryEntry[];
  languages: LexiconLanguage[];
  /** Lexèmes triés par forme normalisée, pour la recherche par plage. */
  byLanguage: Record<LexiconLanguage, Lexeme[]>;
};

export type MatchType = 'exact' | 'prefix' | 'fuzzy';

export type LexiconSuggestion = {
  id: string;
  entryId: string;
  language: LexiconLanguage;
  displayForm: string;
  normalizedForm: string;
  matchType: MatchType;
  distance?: number;
  score: number;
};

export type LexiconEntriesPayload = {
  schemaVersion: 1;
  source?: string;
  languages: LexiconLanguage[];
  rows: string[][];
};
