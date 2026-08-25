/**
 * Distance de Damerau-Levenshtein (alignement optimal) : insertion, suppression,
 * substitution et inversion de deux caracteres adjacents.
 *
 * `maxDistance` sert de coupe-circuit : des qu'une ligne entiere depasse le
 * seuil, la distance reelle ne peut plus redescendre en dessous et on rend la
 * main. C'est ce qui rend le balayage du lexique tenable a chaque frappe sur un
 * telephone d'entree de gamme.
 */
export function damerauLevenshtein(
  a: string,
  b: string,
  maxDistance: number = Number.POSITIVE_INFINITY,
): number {
  if (a === b) return 0;
  const aLength = a.length;
  const bLength = b.length;
  if (aLength === 0) return bLength;
  if (bLength === 0) return aLength;
  if (Math.abs(aLength - bLength) > maxDistance) return maxDistance + 1;

  let twoRowsAgo = new Array<number>(bLength + 1).fill(0);
  let previousRow = new Array<number>(bLength + 1).fill(0);
  let currentRow = new Array<number>(bLength + 1).fill(0);
  for (let column = 0; column <= bLength; column += 1) previousRow[column] = column;

  for (let row = 1; row <= aLength; row += 1) {
    currentRow[0] = row;
    let rowMinimum = row;
    for (let column = 1; column <= bLength; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      let value = Math.min(
        previousRow[column]! + 1,
        currentRow[column - 1]! + 1,
        previousRow[column - 1]! + cost,
      );
      if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
        value = Math.min(value, twoRowsAgo[column - 2]! + cost);
      }
      currentRow[column] = value;
      if (value < rowMinimum) rowMinimum = value;
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    const recycled = twoRowsAgo;
    twoRowsAgo = previousRow;
    previousRow = currentRow;
    currentRow = recycled;
  }
  return previousRow[bLength]!;
}

/**
 * Distance entre la requete et le meilleur prefixe du candidat.
 *
 * Pendant l'autocompletion la personne n'a pas fini de taper : comparer « mwa »
 * au mot entier « mwana » infligerait deux suppressions et ferait disparaitre la
 * bonne reponse. On compare donc « mwa » aux prefixes de longueur voisine.
 */
export function prefixDistance(
  query: string,
  candidate: string,
  maxDistance: number = Number.POSITIVE_INFINITY,
): number {
  const queryLength = query.length;
  const minimumLength = Math.max(1, queryLength - 1);
  const maximumLength = Math.min(candidate.length, queryLength + 2);
  let best = Number.POSITIVE_INFINITY;

  for (let length = minimumLength; length <= maximumLength; length += 1) {
    const distance = damerauLevenshtein(query, candidate.slice(0, length), maxDistance);
    if (distance < best) best = distance;
    if (best === 0) break;
  }
  return best;
}

/**
 * Tolerance selon la longueur de la requete. Volontairement conservateur : une
 * suggestion absurde coute plus cher en confiance qu'une suggestion manquante.
 */
export function getMaxDistance(length: number): number {
  if (length <= 2) return 0;
  if (length <= 4) return 1;
  return 2;
}
