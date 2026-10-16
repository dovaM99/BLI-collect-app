import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { collectorCodeCheckChar } from '../utils/collectorCode';

/**
 * Accès collecteur local, sans vérification par BLI (bêta 0.4).
 *
 * On fait confiance au collecteur : il indique son prénom, son nom et sa langue,
 * choisit un code personnel (PIN) et entre directement dans l'app. Le PIN sert
 * seulement à rouvrir sa session sur ce téléphone. Un PIN oublié se remplace en
 * redonnant le même prénom et le même nom. Une vérification par serveur
 * remplacera ce mécanisme plus tard.
 */

export type CollectorLanguage = 'ln' | 'ktu' | 'kg';
export type Account = {
  /** Généré par l'app, invisible à la saisie : sert de clé au travail stocké. */
  collectorCode: string;
  firstName: string;
  lastName: string;
  language: CollectorLanguage;
  createdAt: string;
  /** Faux pour un compte repris de la bêta 0.3.0 : un nouveau PIN doit être choisi. */
  pinSet: boolean;
};
export type NewAccount = { firstName: string; lastName: string; language: CollectorLanguage };

export interface AuthStorage {
  readPublic(): Promise<string | null>;
  writePublic(value: string): Promise<void>;
  /** Registre de la bêta 0.3.0 (autorisations signées), lu une seule fois pour migration. */
  readLegacy(): Promise<string | null>;
  readSecret(id: string): Promise<string | null>;
  writeSecret(id: string, value: string): Promise<void>;
}

type Vault = { version: 2; accounts: Account[]; selectedCode: string | null };
type Secret = { kdf: 'sha256-v1'; salt: string; hash: string };
export type AuthSnapshot = { accounts: Account[]; selectedCode: string | null; session: Account | null; sessionEpoch: number };

const LANGUAGES: CollectorLanguage[] = ['ln', 'ktu', 'kg'];
// Pas de I, O, L, U : évite les confusions à la lecture du code affiché.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PIN_PATTERN = /^\d{4,12}$/;

/** Majuscules, accents composés/décomposés et espaces multiples n'empêchent pas la correspondance. */
export function normalizeName(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fr');
}
function cleanName(value: unknown) {
  if (typeof value !== 'string') throw new Error('INVALID_NAME');
  const cleaned = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!cleaned || cleaned.length > 80 || /[\u0000-\u001f\u007f]/u.test(cleaned)) throw new Error('INVALID_NAME');
  return cleaned;
}
function hashPin(pin: string, salt: string) {
  return bytesToHex(sha256(new Uint8Array([...hexToBytes(salt), ...utf8ToBytes(pin)])));
}
const sameName = (account: Pick<Account, 'firstName' | 'lastName'>, firstName: string, lastName: string) =>
  normalizeName(account.firstName) === normalizeName(firstName) && normalizeName(account.lastName) === normalizeName(lastName);

export class LocalAuth {
  private vault: Vault = { version: 2, accounts: [], selectedCode: null };
  private session: Account | null = null;
  private generation = 0;
  private busy = false;
  private initialized = false;
  constructor(private storage: AuthStorage, private random: (length: number) => Uint8Array, private now = () => Date.now()) {}

  async initialize() {
    const raw = await this.storage.readPublic();
    if (raw) {
      try {
        const v = JSON.parse(raw) as Vault;
        if (v.version !== 2 || !Array.isArray(v.accounts)) throw new Error();
        this.vault = v;
      } catch { throw new Error('AUTH_STORAGE_CORRUPT'); }
    } else {
      const migrated = this.migrateLegacy(await this.storage.readLegacy());
      if (migrated.accounts.length) await this.save(migrated);
    }
    this.initialized = true;
    this.lock(); // Un redémarrage complet redemande toujours le PIN.
  }

  /** Reprend nom, prénom, langue et code collecteur des comptes 0.3.0, sans leurs signatures. */
  private migrateLegacy(raw: string | null): Vault {
    const vault: Vault = { version: 2, accounts: [], selectedCode: null };
    if (!raw) return vault;
    try {
      const legacy = JSON.parse(raw) as { authorizations?: Array<{ payload?: { identity?: Record<string, unknown>; issuedAt?: string } }> };
      for (const entry of legacy.authorizations ?? []) {
        const identity = entry.payload?.identity;
        const code = typeof identity?.collectorCode === 'string' ? identity.collectorCode : '';
        const language = identity?.language as CollectorLanguage;
        if (!code || !LANGUAGES.includes(language)) continue;
        const account: Account = {
          collectorCode: code, firstName: cleanName(identity?.firstName), lastName: cleanName(identity?.lastName), language,
          createdAt: typeof entry.payload?.issuedAt === 'string' ? entry.payload.issuedAt : new Date(this.now()).toISOString(), pinSet: false,
        };
        vault.accounts = [...vault.accounts.filter((a) => a.collectorCode !== code), account];
      }
    } catch { /* Un ancien registre illisible ne bloque pas la nouvelle version. */ }
    return vault;
  }

  snapshot(): AuthSnapshot { return { ...this.vault, session: this.session, sessionEpoch: this.generation }; }
  lock() { this.generation++; this.session = null; }
  active() { return this.session; }
  requireSession(code?: string, language?: string) {
    const account = this.session;
    if (!account || (code && code !== account.collectorCode) || (language && language !== account.language)) throw new Error('AUTH_LOCKED');
    return account;
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.initialized) throw new Error('AUTH_NOT_READY');
    if (this.busy) throw new Error('AUTH_BUSY');
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  private async save(next: Vault) {
    await this.storage.writePublic(JSON.stringify(next));
    this.vault = next;
  }
  private async setPin(code: string, pin: string) {
    if (!PIN_PATTERN.test(pin)) throw new Error('INVALID_PIN');
    const salt = bytesToHex(this.random(16));
    const secret: Secret = { kdf: 'sha256-v1', salt, hash: hashPin(pin, salt) };
    await this.storage.writeSecret(code, JSON.stringify(secret));
  }
  private open(account: Account, generation: number) {
    if (generation === this.generation) this.session = account;
    return account;
  }
  private newCode() {
    for (;;) {
      const body = `BLI${Array.from(this.random(6), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')}`;
      const code = `${body}${collectorCodeCheckChar(body)}`;
      if (!this.vault.accounts.some((a) => a.collectorCode === code)) return code;
    }
  }

  /** Premier accès : prénom, nom, langue, PIN. Aucune validation extérieure. */
  async register(input: NewAccount, pin: string) {
    return this.exclusive(async () => {
      const firstName = cleanName(input.firstName);
      const lastName = cleanName(input.lastName);
      if (!LANGUAGES.includes(input.language)) throw new Error('INVALID_LANGUAGE');
      if (!PIN_PATTERN.test(pin)) throw new Error('INVALID_PIN');
      if (this.vault.accounts.some((a) => sameName(a, firstName, lastName))) throw new Error('ACCOUNT_EXISTS');
      const generation = this.generation;
      const account: Account = {
        collectorCode: this.newCode(), firstName, lastName, language: input.language,
        createdAt: new Date(this.now()).toISOString(), pinSet: true,
      };
      await this.setPin(account.collectorCode, pin);
      await this.save({ ...this.vault, accounts: [...this.vault.accounts, account], selectedCode: account.collectorCode });
      return this.open(account, generation);
    });
  }

  async unlock(code: string, pin: string) {
    return this.exclusive(async () => {
      this.lock();
      const generation = this.generation;
      const account = this.vault.accounts.find((a) => a.collectorCode === code);
      if (!account) throw new Error('ACCOUNT_MISSING');
      const raw = await this.storage.readSecret(code);
      if (!account.pinSet || !raw) throw new Error('PIN_NOT_SET');
      let secret: Secret;
      try { secret = JSON.parse(raw) as Secret; } catch { throw new Error('PIN_NOT_SET'); }
      if (secret.kdf !== 'sha256-v1' || hashPin(pin, secret.salt) !== secret.hash) throw new Error('WRONG_PIN');
      await this.save({ ...this.vault, selectedCode: code });
      return this.open(account, generation);
    });
  }

  /** Code oublié : le même prénom et le même nom suffisent à choisir un nouveau PIN. */
  async resetPin(firstName: string, lastName: string, pin: string) {
    return this.exclusive(async () => {
      if (!PIN_PATTERN.test(pin)) throw new Error('INVALID_PIN');
      const matches = this.vault.accounts.filter((a) => sameName(a, firstName, lastName));
      const account = matches.find((a) => a.collectorCode === this.vault.selectedCode) ?? matches[matches.length - 1];
      if (!account) throw new Error('NAME_NOT_FOUND');
      this.lock();
      const generation = this.generation;
      await this.setPin(account.collectorCode, pin);
      const updated = { ...account, pinSet: true };
      await this.save({
        ...this.vault,
        accounts: this.vault.accounts.map((a) => (a.collectorCode === account.collectorCode ? updated : a)),
        selectedCode: account.collectorCode,
      });
      return this.open(updated, generation);
    });
  }
}
