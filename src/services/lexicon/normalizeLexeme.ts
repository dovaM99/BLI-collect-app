/**
 * Apostrophes typographiques, accent aigu et guillemet pleine chasse : tous
 * ramenes a l'apostrophe droite, pour que deux saisies de la meme forme se
 * trouvent mutuellement.
 */
const APOSTROPHES = /[‘’‛ʼʹ՚＇´`]/gu;

/** Tirets typographiques ramenes au tiret simple. */
const DASHES = /[‐‑‒–—―−]/gu;

/**
 * Tiret entoure d'espaces uniquement. C'est ce qui distingue
 * « kokende - partir » (deux formes) de « pene-pene », « bala-bala » ou
 * « mwana-mobali » (une seule forme, tres frequentes en lingala).
 */
const SPACED_DASH = /\s[-‐‑‒–—―−]\s/gu;

/** Separateurs toujours actifs a l'interieur d'une cellule. */
const HARD_SEPARATORS = /[,;\/|]/u;

/**
 * Forme de recherche. Ne supprime jamais les accents ni les signes
 * linguistiques : en lingala ils sont distinctifs, pas decoratifs.
 */
export function normalizeLexeme(text: string): string {
  return text
    .normalize('NFKC')
    .replace(APOSTROPHES, "'")
    .replace(DASHES, '-')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Forme affichee. On nettoie l'espacement, jamais le contenu : la traduction
 * reste telle que le lexicographe l'a ecrite.
 */
export function displayLexeme(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/**
 * Decoupe une cellule en variantes. « ndako, nzo » produit deux formes qui
 * pointent vers la meme entree de dictionnaire.
 *
 * Deux passes plutot qu'un marqueur interne : on separe d'abord sur les tirets
 * entoures d'espaces, puis sur les separateurs francs. Aucun caractere de
 * travail n'est injecte dans les donnees.
 */
export function splitVariants(cell: string): string[] {
  if (!cell) return [];
  return cell
    .split(SPACED_DASH)
    .flatMap((part) => part.split(HARD_SEPARATORS))
    .map(displayLexeme)
    .filter((part) => part.length > 0);
}
