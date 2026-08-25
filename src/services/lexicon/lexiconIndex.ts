import { displayLexeme, normalizeLexeme, splitVariants } from './normalizeLexeme';
import type {
  DictionaryEntry,
  Lexeme,
  LexiconEntriesPayload,
  LexiconIndex,
  LexiconLanguage,
} from './types';

/**
 * Comparaison par point de code, volontairement independante de la locale : la
 * recherche par plage ci-dessous exige que le tri et la borne inferieure
 * utilisent exactement le meme ordre. `localeCompare` casserait cette garantie.
 */
function compareForms(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Construit l'index a partir des lignes brutes.
 *
 * Le decoupage en variantes et la normalisation ont lieu ici, une seule fois,
 * jamais a la frappe. Une ligne illisible est ignoree sans interrompre la
 * construction : un dictionnaire imparfait doit degrader, pas planter.
 */
export function buildLexiconIndex(payload: LexiconEntriesPayload): LexiconIndex {
  const languages = payload.languages ?? [];
  const entries: DictionaryEntry[] = [];
  const byLanguage: Record<LexiconLanguage, Lexeme[]> = {};
  languages.forEach((language) => { byLanguage[language] = []; });

  (payload.rows ?? []).forEach((row) => {
    if (!Array.isArray(row)) return;
    const forms: Record<LexiconLanguage, string> = {};
    let filled = 0;

    languages.forEach((language, columnIndex) => {
      const raw = typeof row[columnIndex] === 'string' ? row[columnIndex]! : '';
      const cleaned = displayLexeme(raw);
      forms[language] = cleaned;
      if (cleaned) filled += 1;
    });

    // Une ligne sans aucun contenu exploitable n'a pas d'entree.
    if (filled === 0) return;

    const entry: DictionaryEntry = { id: entries.length, forms };
    entries.push(entry);

    languages.forEach((language) => {
      const variants = splitVariants(forms[language] ?? '');
      variants.forEach((variant, variantIndex) => {
        const normalizedForm = normalizeLexeme(variant);
        if (!normalizedForm) return;
        byLanguage[language]!.push({
          id: `${language}-${entry.id}-${variantIndex}`,
          entryId: entry.id,
          language,
          displayForm: variant,
          normalizedForm,
        });
      });
    });
  });

  languages.forEach((language) => {
    byLanguage[language]!.sort((a, b) => compareForms(a.normalizedForm, b.normalizedForm));
  });

  return { entries, languages, byLanguage };
}

/** Premier indice dont la forme normalisee est superieure ou egale a `value`. */
function lowerBound(list: Lexeme[], value: string) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (compareForms(list[middle]!.normalizedForm, value) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Toutes les formes commencant par `query`. Comme la liste est triee par point
 * de code, ces formes occupent une plage contigue : une recherche dichotomique
 * suffit a la trouver, quel que soit le nombre d'entrees.
 */
export function prefixSearch(
  index: LexiconIndex,
  language: LexiconLanguage,
  query: string,
): Lexeme[] {
  const list = index.byLanguage[language];
  if (!list || !query) return [];
  const results: Lexeme[] = [];
  for (let position = lowerBound(list, query); position < list.length; position += 1) {
    const lexeme = list[position]!;
    if (!lexeme.normalizedForm.startsWith(query)) break;
    results.push(lexeme);
  }
  return results;
}

export function lexemesOf(index: LexiconIndex, language: LexiconLanguage): Lexeme[] {
  return index.byLanguage[language] ?? [];
}

/**
 * Cle de tri pour la consultation.
 *
 * Le dictionnaire contient des amorces parasites : « (sound) », « (fight)
 * kobetana makofi », « 4 hectare) ». Triees par point de code, elles se
 * rassemblent toutes en tete de liste et c'est la premiere chose que voit
 * quelqu'un qui ouvre le lexique. On ignore donc les caracteres de tete qui ne
 * sont pas des lettres, ce qui les replace a leur position alphabetique reelle.
 *
 * Ce classement ne concerne que l'affichage : l'ordre de l'index reste un ordre
 * de points de code strict, dont depend la recherche par plage.
 */
export function browseSortKey(normalizedForm: string) {
  const trimmed = normalizedForm.replace(/^[^\p{L}]+/u, '');
  return trimmed || normalizedForm;
}

/**
 * Liste consultable d'une langue : chaque forme une seule fois, dans un ordre
 * alphabetique lisible. Utilisee quand la recherche est vide.
 */
export function browseLexemes(index: LexiconIndex, language: LexiconLanguage): Lexeme[] {
  const seen = new Set<string>();
  const rows: Lexeme[] = [];
  lexemesOf(index, language).forEach((lexeme) => {
    if (seen.has(lexeme.normalizedForm)) return;
    seen.add(lexeme.normalizedForm);
    rows.push(lexeme);
  });
  return rows.sort((a, b) => {
    const left = browseSortKey(a.normalizedForm);
    const right = browseSortKey(b.normalizedForm);
    if (left === right) return compareForms(a.normalizedForm, b.normalizedForm);
    return left < right ? -1 : 1;
  });
}

export function entryOf(index: LexiconIndex, entryId: number): DictionaryEntry | undefined {
  return index.entries[entryId];
}

/** Variantes d'une entree dans une langue donnee, pour la fiche detaillee. */
export function entryVariants(
  index: LexiconIndex,
  entryId: number,
  language: LexiconLanguage,
): string[] {
  const entry = entryOf(index, entryId);
  if (!entry) return [];
  return splitVariants(entry.forms[language] ?? '');
}
