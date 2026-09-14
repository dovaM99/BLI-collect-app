import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  canonical, checkSignature, fingerprint, keyIdOf, publicKeyOf, signDocument, verifyRequest,
  verifyAuthorization, verifySignedExport, type Authorization, type TrustStore,
} from '../../src/auth/protocol';

type Vault = {
  format: 'bli-authority-vault'; version: 1; label: string; keyId: string; publicKey: string;
  encrypted: { kdf: 'scrypt-32768-8-1'; salt: string; iv: string; tag: string; data: string };
};
type Registry = {
  version: 1; authorizations: Authorization[];
  revocations: Array<{ authorizationId: string; at: string; reason: string }>;
  checks: Array<{ digest: string; authorizationId: string; receivedAt: string; current: number; previous: number; total: number }>;
};
const emptyRegistry = (): Registry => ({ version: 1, authorizations: [], revocations: [], checks: [] });
const PASSWORD_TTL = 15 * 60_000;
function atomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
}
function derive(password: string, salt: string) {
  if (typeof password !== 'string' || password.length > 1024) throw new Error('INVALID_PASSWORD');
  return scryptSync(password, Buffer.from(salt, 'hex'), 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
function encrypt(seed: string, password: string, label: string): Vault {
  const publicKey = publicKeyOf(seed);
  const header = { format: 'bli-authority-vault' as const, version: 1 as const, label, publicKey, keyId: keyIdOf(publicKey) };
  const salt = randomBytes(16).toString('hex'); const iv = randomBytes(12).toString('hex');
  const key = derive(password, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    cipher.setAAD(Buffer.from(canonical(header)));
    const data = Buffer.concat([cipher.update(Buffer.from(seed, 'hex')), cipher.final()]).toString('hex');
    return { ...header, encrypted: { kdf: 'scrypt-32768-8-1', salt, iv, data, tag: cipher.getAuthTag().toString('hex') } };
  } finally { key.fill(0); }
}
function decrypt(vault: Vault, password: string) {
  const { encrypted: e, ...header } = vault;
  if (vault.format !== 'bli-authority-vault' || vault.version !== 1 || !e || e.kdf !== 'scrypt-32768-8-1'
    || !/^[a-f0-9]{32}$/.test(e.salt) || !/^[a-f0-9]{24}$/.test(e.iv) || !/^[a-f0-9]{32}$/.test(e.tag) || !/^[a-f0-9]{64}$/.test(e.data)) throw new Error('INVALID_BACKUP');
  const key = derive(password, e.salt);
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'hex'));
    cipher.setAAD(Buffer.from(canonical(header))); cipher.setAuthTag(Buffer.from(e.tag, 'hex'));
    const seed = Buffer.concat([cipher.update(Buffer.from(e.data, 'hex')), cipher.final()]);
    if (publicKeyOf(seed.toString('hex')) !== vault.publicKey || keyIdOf(vault.publicKey) !== vault.keyId) throw new Error('INVALID_BACKUP');
    return seed;
  } catch { throw new Error('WRONG_PASSWORD'); } finally { key.fill(0); }
}

export class Authority {
  private seed: Buffer | null = null;
  private unlockedUntil = 0;
  private failures = 0;
  private retryAt = 0;
  private vault: Vault | null = null;
  private registry = emptyRegistry();
  constructor(readonly directory: string, private trustPath: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
    if (existsSync(join(directory, 'vault.json'))) {
      this.vault = JSON.parse(readFileSync(join(directory, 'vault.json'), 'utf8')) as Vault;
      // Missing registry is an error, never an opportunity to silently forget revocations.
      const record = JSON.parse(readFileSync(join(directory, 'registry.json'), 'utf8'));
      if (record.format !== 'bli-authority-registry' || record.version !== 1) throw new Error('INVALID_BACKUP');
      checkSignature(record, this.vault.publicKey);
      this.registry = this.validateRegistry(record.registry, this.trust());
    }
  }
  trust(): TrustStore {
    return { version: 1, keys: this.vault ? [{ label: this.vault.label, keyId: this.vault.keyId, publicKey: this.vault.publicKey }] : [] };
  }
  private validateRegistry(value: Registry, trust: TrustStore) {
    if (value.version !== 1 || !Array.isArray(value.authorizations) || !Array.isArray(value.revocations) || !Array.isArray(value.checks)) throw new Error('INVALID_BACKUP');
    value.authorizations.forEach((a) => verifyAuthorization(a, trust));
    const ids = value.authorizations.map((a) => a.payload.authorizationId);
    if (new Set(ids).size !== ids.length || value.revocations.some((r) => !ids.includes(r.authorizationId) || typeof r.reason !== 'string' || !Number.isFinite(Date.parse(r.at)))) throw new Error('INVALID_BACKUP');
    return value;
  }
  status() {
    if (Date.now() >= this.unlockedUntil) this.lock();
    const configured = this.vault ? this.isTrusted(this.vault.publicKey) : false;
    return { initialized: !!this.vault, unlocked: !!this.seed, publicKey: this.vault?.publicKey,
      fingerprint: this.vault ? fingerprint(this.vault.publicKey) : null, keyId: this.vault?.keyId,
      label: this.vault?.label, configured, directory: this.directory,
      authorizations: this.seed ? this.registry.authorizations : [], revocations: this.seed ? this.registry.revocations : [],
      checkCount: this.seed ? this.registry.checks.length : 0 };
  }
  private isTrusted(publicKey: string) {
    if (!existsSync(this.trustPath)) return false;
    const trust = JSON.parse(readFileSync(this.trustPath, 'utf8')) as TrustStore;
    return trust.keys.some((k) => k.publicKey === publicKey && k.keyId === keyIdOf(publicKey));
  }
  private installTrust(vault: Vault) {
    const trust = existsSync(this.trustPath) ? JSON.parse(readFileSync(this.trustPath, 'utf8')) as TrustStore : { version: 1, keys: [] } as TrustStore;
    if (trust.version !== 1 || !Array.isArray(trust.keys)) throw new Error('INVALID_TRUST_STORE');
    if (trust.keys.length && !trust.keys.some((k) => k.publicKey === vault.publicKey)) throw new Error('DIFFERENT_AUTHORITY');
    atomic(this.trustPath, { version: 1, keys: [{ keyId: vault.keyId, publicKey: vault.publicKey, label: vault.label }] });
  }
  setup(password: string, label: string) {
    if (this.vault) throw new Error('ALREADY_INITIALIZED');
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('INVALID_PASSWORD');
    if (typeof label !== 'string' || !label.trim() || label.length > 80) throw new Error('INVALID_LABEL');
    const seed = randomBytes(32);
    try {
      const vault = encrypt(seed.toString('hex'), password, label.trim());
      // Do not overwrite an existing trust root after a lost local key.
      if (existsSync(this.trustPath) && (JSON.parse(readFileSync(this.trustPath, 'utf8')) as TrustStore).keys.length) throw new Error('RESTORE_REQUIRED');
      atomic(join(this.directory, 'registry.json'), signDocument({ format: 'bli-authority-registry', version: 1, registry: this.registry }, seed.toString('hex')));
      atomic(join(this.directory, 'vault.json'), vault);
      this.vault = vault;
      this.installTrust(vault);
      this.seed = Buffer.from(seed); this.unlockedUntil = Date.now() + PASSWORD_TTL;
      return this.status();
    } finally { seed.fill(0); }
  }
  unlock(password: string) {
    if (!this.vault) throw new Error('NOT_INITIALIZED');
    if (Date.now() < this.retryAt) throw new Error('PASSWORD_WAIT');
    try {
      const seed = decrypt(this.vault, password);
      this.lock(); this.seed = seed; this.unlockedUntil = Date.now() + PASSWORD_TTL; this.failures = 0;
      this.installTrust(this.vault);
      return this.status();
    } catch (e) {
      this.lock(); this.failures++;
      if (this.failures >= 5) this.retryAt = Date.now() + 30_000;
      throw e;
    }
  }
  lock() { this.seed?.fill(0); this.seed = null; this.unlockedUntil = 0; }
  private requireUnlocked() {
    if (!this.status().unlocked || !this.seed) throw new Error('AUTHORITY_LOCKED');
    this.unlockedUntil = Date.now() + PASSWORD_TTL;
    return this.seed.toString('hex');
  }
  private save(registry: Registry) {
    atomic(join(this.directory, 'registry.json'), signDocument({ format: 'bli-authority-registry', version: 1, registry }, this.requireUnlocked()));
    this.registry = registry;
  }
  inspectRequest(value: unknown) {
    this.requireUnlocked();
    const request = verifyRequest(value);
    const existing = this.registry.authorizations.filter((a) => a.payload.identity.collectorCode === request.payload.identity.collectorCode
      && !this.registry.revocations.some((r) => r.authorizationId === a.payload.authorizationId));
    return { request, fingerprint: fingerprint(request.payload.devicePublicKey), existing };
  }
  issue(value: unknown, campaignId: string, replacePrevious: boolean, identityChecked: boolean) {
    const seed = this.requireUnlocked();
    const { request, existing } = this.inspectRequest(value);
    if (identityChecked !== true) throw new Error('IDENTITY_CHECK_REQUIRED');
    if (typeof campaignId !== 'string' || !campaignId.trim() || campaignId.length > 80 || /[\u0000-\u001f\u007f]/.test(campaignId)) throw new Error('INVALID_CAMPAIGN');
    const previous = this.registry.authorizations.find((a) => a.payload.requestId === request.payload.requestId);
    if (previous) {
      if (previous.payload.devicePublicKey !== request.payload.devicePublicKey || canonical(previous.payload.identity) !== canonical(request.payload.identity)) throw new Error('INVALID_DOCUMENT');
      if (this.registry.revocations.some((r) => r.authorizationId === previous.payload.authorizationId)) throw new Error('REVOKED_AUTHORIZATION');
      return previous; // Retry/download never creates another credential for the same request.
    }
    if (existing.length && replacePrevious !== true) throw new Error('REPLACEMENT_REQUIRED');
    const now = new Date().toISOString();
    const authorization: Authorization = signDocument({ format: 'bli-authorization' as const, version: 1 as const, keyId: this.vault!.keyId,
      payload: { authorizationId: randomBytes(16).toString('hex'), requestId: request.payload.requestId, devicePublicKey: request.payload.devicePublicKey,
        identity: request.payload.identity, campaignId: campaignId.trim(), issuedAt: now } }, seed);
    verifyAuthorization(authorization, this.trust());
    this.save({ ...this.registry, authorizations: [...this.registry.authorizations, authorization],
      revocations: [...this.registry.revocations, ...existing.map((a) => ({ authorizationId: a.payload.authorizationId, at: now, reason: 'Remplacement approuvé par le coordinateur' }))] });
    return authorization;
  }
  revoke(authorizationId: string, reason: string) {
    this.requireUnlocked();
    if (!this.registry.authorizations.some((a) => a.payload.authorizationId === authorizationId)) throw new Error('UNKNOWN_AUTHORIZATION');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 300) throw new Error('REASON_REQUIRED');
    if (!this.registry.revocations.some((r) => r.authorizationId === authorizationId)) this.save({ ...this.registry,
      revocations: [...this.registry.revocations, { authorizationId, reason: reason.trim(), at: new Date().toISOString() }] });
    return this.status();
  }
  verifyExport(value: unknown) {
    this.requireUnlocked();
    const result = verifySignedExport(value, this.trust(), this.registry.revocations.map((r) => r.authorizationId));
    const known = this.registry.authorizations.find((a) => a.payload.authorizationId === result.authorization.payload.authorizationId);
    if (!known || canonical(known) !== canonical(result.authorization)) throw new Error('UNKNOWN_AUTHORIZATION');
    const digest = createHash('sha256').update(canonical(value)).digest('hex');
    const previous = this.registry.checks.find((c) => c.digest === digest);
    const report = { digest, authorizationId: known.payload.authorizationId, receivedAt: previous?.receivedAt ?? new Date().toISOString(),
      current: result.current, previous: result.previous, total: result.total };
    if (!previous) this.save({ ...this.registry, checks: [...this.registry.checks, report] });
    return { ...report, duplicate: !!previous, identity: known.payload.identity, campaignId: known.payload.campaignId,
      signatureValid: true, authorizationKnown: true, authorizationRevoked: false,
      notice: 'La signature atteste l’origine du fichier et son intégrité. La qualité des réponses et l’identité de la personne ayant saisi le texte restent à vérifier. Les annotations antérieures ne sont pas certifiées rétroactivement.' };
  }
  backup() { return signDocument({ format: 'bli-authority-backup', version: 1, vault: this.vault, registry: this.registry }, this.requireUnlocked()); }
  restore(value: unknown, password: string) {
    if (this.vault) throw new Error('ALREADY_INITIALIZED');
    const backup = value as { format: string; version: number; vault: Vault; registry: Registry; signature: string };
    if (!backup || backup.format !== 'bli-authority-backup' || backup.version !== 1) throw new Error('INVALID_BACKUP');
    const seed = decrypt(backup.vault, password);
    try {
      checkSignature(backup, backup.vault.publicKey);
      const registry = this.validateRegistry(backup.registry, { version: 1, keys: [{ keyId: backup.vault.keyId, publicKey: backup.vault.publicKey, label: backup.vault.label }] });
      this.installTrust(backup.vault);
      atomic(join(this.directory, 'registry.json'), signDocument({ format: 'bli-authority-registry', version: 1, registry }, seed.toString('hex')));
      atomic(join(this.directory, 'vault.json'), backup.vault);
      this.vault = backup.vault; this.registry = registry; this.seed = Buffer.from(seed); this.unlockedUntil = Date.now() + PASSWORD_TTL;
      return this.status();
    } finally { seed.fill(0); }
  }
}
