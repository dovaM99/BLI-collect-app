/**
 * Code collecteur.
 *
 * L'identité par nom/prénom seule est trop fragile pour une collecte rémunérée :
 * deux homonymes fusionnent leur progression, et une faute de frappe en crée une
 * nouvelle. Le code émis par BLI devient donc la clé d'identité, et il porte un
 * caractère de contrôle pour que les fautes de frappe soient détectées à la
 * saisie plutôt qu'au dépouillement.
 *
 * Format BLI : BLI-<corps alphanumérique>-<caractère de contrôle>
 * exemple d'affichage : BLI-LN0042-J
 *
 * Tout autre code reste accepté (format libre) mais est marqué comme non vérifié
 * dans l'export, afin de ne jamais bloquer une collecte déjà lancée.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function normalizeCollectorCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Somme pondérée modulo 36 : détecte toute faute d'un caractère et la plupart des transpositions. */
export function collectorCodeCheckChar(body: string) {
  const normalized = normalizeCollectorCode(body);
  let total = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const value = ALPHABET.indexOf(normalized[index]!);
    if (value < 0) continue;
    total += value * (index % 2 === 0 ? 3 : 1);
  }
  return ALPHABET[total % 36]!;
}

/** Génère un code complet à partir d'un corps. À utiliser côté fabrication des lots. */
export function makeCollectorCode(body: string) {
  const normalized = `BLI${normalizeCollectorCode(body)}`;
  return `${normalized}${collectorCodeCheckChar(normalized)}`;
}

export function formatCollectorCode(code: string) {
  const normalized = normalizeCollectorCode(code);
  if (!normalized.startsWith('BLI') || normalized.length < 5) return normalized;
  const body = normalized.slice(3, -1);
  const check = normalized.slice(-1);
  return `BLI-${body}-${check}`;
}

export type CollectorCodeStatus = {
  normalized: string;
  format: 'bli' | 'free';
  /** null pour un code au format libre : rien à vérifier. */
  checksumOk: boolean | null;
};

export function describeCollectorCode(raw: string): CollectorCodeStatus {
  const normalized = normalizeCollectorCode(raw);
  if (!normalized.startsWith('BLI') || normalized.length < 6) {
    return { normalized, format: 'free', checksumOk: null };
  }
  const body = normalized.slice(0, -1);
  const check = normalized.slice(-1);
  return {
    normalized,
    format: 'bli',
    checksumOk: collectorCodeCheckChar(body) === check,
  };
}

export function isCollectorCodeAcceptable(raw: string) {
  const normalized = normalizeCollectorCode(raw);
  if (normalized.length < 4 || normalized.length > 24) return false;
  const status = describeCollectorCode(normalized);
  return status.checksumOk !== false;
}
