import { getMaxDistance, prefixDistance } from './damerauLevenshtein';
import { lexemesOf, prefixSearch } from './lexiconIndex';
import { normalizeLexeme } from './normalizeLexeme';
import type { Lexeme, LexiconIndex, LexiconLanguage, LexiconSuggestion, MatchType } from './types';

export const DEFAULT_SUGGESTION_LIMIT = 5;

/**
 * Score de classement. Volontairement lisible et debogable : la priorite stricte
 * exact > prefixe exact > prefixe approche se lit directement dans les nombres.
 */
export function scoreCandidate(query: string, candidate: string, distance: number) {
  if (candidate === query) return 1000;
  let score = 0;
  if (candidate.startsWith(query)) score += 500;
  score -= distance * 50;
  score -= Math.max(0, candidate.length - query.length);
  return score;
}

function toSuggestion(lexeme: Lexeme, query: string, distance: number): LexiconSuggestion {
  const matchType: MatchType = lexeme.normalizedForm === query
    ? 'exact'
    : lexeme.normalizedForm.startsWith(query)
      ? 'prefix'
      : 'fuzzy';
  return {
    id: lexeme.id,
    entryId: String(lexeme.entryId),
    language: lexeme.language,
    displayForm: lexeme.displayForm,
    normalizedForm: lexeme.normalizedForm,
    matchType,
    distance: matchType === 'fuzzy' ? distance : undefined,
    score: scoreCandidate(query, lexeme.normalizedForm, distance),
  };
}

/**
 * Balayage approche. N'est declenche que lorsque la recherche par prefixe ne
 * remplit pas la liste : sur une frappe normale, on ne paie jamais ce cout.
 */
function fuzzyPrefixSearch(
  index: LexiconIndex,
  language: LexiconLanguage,
  query: string,
  maxDistance: number,
): LexiconSuggestion[] {
  if (maxDistance <= 0) return [];
  const results: LexiconSuggestion[] = [];
  const candidates = lexemesOf(index, language);

  for (let position = 0; position < candidates.length; position += 1) {
    const lexeme = candidates[position]!;
    // Un candidat plus court que la requete amputee du seuil ne peut pas
    // atteindre la distance requise : on l'ecarte sans calcul.
    if (lexeme.normalizedForm.length + maxDistance < query.length) continue;
    if (lexeme.normalizedForm.startsWith(query)) continue;
    const distance = prefixDistance(query, lexeme.normalizedForm, maxDistance);
    if (distance <= maxDistance) results.push(toSuggestion(lexeme, query, distance));
  }
  return results;
}

/**
 * Deduplication sur langue + forme normalisee, en conservant le meilleur score.
 * Les differents sens d'un meme mot sont regroupes dans la fiche detaillee, pas
 * repetes dans la liste.
 */
function rankAndDeduplicate(suggestions: LexiconSuggestion[]): LexiconSuggestion[] {
  const best = new Map<string, LexiconSuggestion>();
  suggestions.forEach((suggestion) => {
    const key = `${suggestion.language}:${suggestion.normalizedForm}`;
    const previous = best.get(key);
    if (!previous || suggestion.score > previous.score) best.set(key, suggestion);
  });
  return [...best.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.normalizedForm.length !== b.normalizedForm.length) {
      return a.normalizedForm.length - b.normalizedForm.length;
    }
    return a.normalizedForm < b.normalizedForm ? -1 : 1;
  });
}

export type SearchLexiconOptions = {
  query: string;
  sourceLanguage: LexiconLanguage;
  limit?: number;
};

/**
 * Recherche dans une seule langue : la langue choisie determine toujours
 * l'index consulte. Une recherche lingala ne peut donc pas remonter un mot
 * anglais au motif qu'il lui ressemble.
 */
export function searchLexicon(
  index: LexiconIndex,
  { query, sourceLanguage, limit = DEFAULT_SUGGESTION_LIMIT }: SearchLexiconOptions,
): LexiconSuggestion[] {
  const normalized = normalizeLexeme(query);
  if (!normalized) return [];

  const prefixMatches = prefixSearch(index, sourceLanguage, normalized)
    .map((lexeme) => toSuggestion(lexeme, normalized, 0));

  // Le mot est trouve tel quel : on ne complete pas la liste avec des voisins
  // orthographiques. Proposer « aube, beau, haut, peau » a quelqu'un qui a tape
  // « eau » et obtenu « eau » ne l'aide pas, ca donne l'impression que
  // l'application n'a pas compris.
  const hasExactMatch = prefixMatches.some((suggestion) => suggestion.matchType === 'exact');

  // Assez de correspondances franches, requete trop courte pour que
  // l'approximation ait un sens, ou mot deja trouve : on s'arrete la.
  if (hasExactMatch || prefixMatches.length >= limit || normalized.length <= 2) {
    return rankAndDeduplicate(prefixMatches).slice(0, limit);
  }

  const maxDistance = getMaxDistance(normalized.length);
  const fuzzyMatches = fuzzyPrefixSearch(index, sourceLanguage, normalized, maxDistance);

  return rankAndDeduplicate([...prefixMatches, ...fuzzyMatches]).slice(0, limit);
}
