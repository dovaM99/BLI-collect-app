import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { equalBytes } from '@noble/curves/abstract/utils';
import {
  canonical, publicKeyOf, signDocument, utf8, validateIdentity, verifyAuthorization, verifyRequest,
  type ActivationRequest, type Authorization, type Identity, type SignedExport, type TrustStore,
} from './protocol';

export interface AuthStorage {
  readPublic(): Promise<string | null>;
  writePublic(value: string): Promise<void>;
  readSecret(id: string): Promise<string | null>;
  writeSecret(id: string, value: string): Promise<void>;
}
type Vault = { version: 1; requests: ActivationRequest[]; authorizations: Authorization[]; selectedId: string | null };
type Secret = { seed: string; salt?: string; pinHash?: string; authorizationId?: string; failures: number; blockedUntil: number; lastAttempt: number };
export type AuthSnapshot = { requests: ActivationRequest[]; authorizations: Authorization[]; selectedId: string | null; session: Authorization | null; sessionEpoch: number };
const emptyVault = (): Vault => ({ version: 1, requests: [], authorizations: [], selectedId: null });
export const PIN_ITERATIONS = 600_000;

export class OfflineAuth {
  private vault = emptyVault();
  private session: { authorization: Authorization; seed: string } | null = null;
  private busy = false;
  private generation = 0;
  private initialized = false;
  constructor(private storage: AuthStorage, readonly trust: TrustStore, private random: (length: number) => Uint8Array,
    private now = () => Date.now()) {}

  async initialize() {
    const raw = await this.storage.readPublic();
    if (raw) {
      try {
        const v = JSON.parse(raw) as Vault;
        if (v.version !== 1 || !Array.isArray(v.requests) || !Array.isArray(v.authorizations)) throw new Error();
        v.requests.forEach(verifyRequest);
        v.authorizations.forEach((a) => verifyAuthorization(a, this.trust));
        this.vault = v;
      } catch { throw new Error('AUTH_STORAGE_CORRUPT'); }
    }
    this.initialized = true;
    this.lock(); // Persisted profiles and grants never establish an unlocked session.
  }
  snapshot(): AuthSnapshot { return { ...this.vault, session: this.session?.authorization ?? null, sessionEpoch: this.generation }; }
  lock() { this.generation++; this.session = null; }
  active() { return this.session?.authorization ?? null; }
  requireSession(code?: string, language?: string) {
    const auth = this.session?.authorization;
    if (!auth || (code && code !== auth.payload.identity.collectorCode) || (language && language !== auth.payload.identity.language)) throw new Error('AUTH_LOCKED');
    return auth;
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
  private async secret(id: string): Promise<Secret> {
    const raw = await this.storage.readSecret(id);
    if (!raw) throw new Error('DEVICE_KEY_MISSING');
    try {
      const s = JSON.parse(raw) as Secret;
      if (!/^[a-f0-9]{64}$/.test(s.seed) || !Number.isSafeInteger(s.failures) || s.failures < 0
        || !Number.isFinite(s.blockedUntil) || !Number.isFinite(s.lastAttempt)) throw new Error();
      return s;
    } catch { throw new Error('AUTH_STORAGE_CORRUPT'); }
  }
  async createRequest(identity: Identity): Promise<ActivationRequest> {
    return this.exclusive(async () => {
      validateIdentity(identity);
      // Requests are signed by the phone, so they can precede coordinator setup.
      // Only accepting an authorization requires a configured BLI public key.
      const seed = bytesToHex(this.random(32));
      const payload = { requestId: bytesToHex(this.random(16)), devicePublicKey: publicKeyOf(seed), identity, createdAt: new Date(this.now()).toISOString() };
      const request: ActivationRequest = signDocument({ format: 'bli-request' as const, version: 1 as const, payload }, seed);
      await this.storage.writeSecret(payload.requestId, JSON.stringify({ seed, failures: 0, blockedUntil: 0, lastAttempt: 0 }));
      await this.save({ ...this.vault, requests: [...this.vault.requests.filter((r) => r.payload.identity.collectorCode !== identity.collectorCode), request] });
      return request;
    });
  }
  previewAuthorization(value: unknown) {
    if (!this.trust.keys.length) throw new Error('ISSUER_NOT_CONFIGURED');
    const auth = verifyAuthorization(value, this.trust);
    const request = this.vault.requests.find((r) => r.payload.requestId === auth.payload.requestId);
    if (!request || request.payload.devicePublicKey !== auth.payload.devicePublicKey) throw new Error('WRONG_DEVICE');
    if (canonical(request.payload.identity) !== canonical(auth.payload.identity)) throw new Error('IDENTITY_MISMATCH');
    if (this.vault.authorizations.some((a) => a.payload.authorizationId === auth.payload.authorizationId)) throw new Error('ALREADY_ACTIVATED');
    return auth;
  }
  async activate(value: unknown, pin: string) {
    return this.exclusive(async () => {
      if (!/^\d{8,12}$/.test(pin)) throw new Error('INVALID_PIN');
      const auth = this.previewAuthorization(value);
      const secret = await this.secret(auth.payload.requestId);
      // A previously imported certificate must never reset a forgotten PIN.
      if (secret.authorizationId) throw new Error('ALREADY_ACTIVATED');
      if (publicKeyOf(secret.seed) !== auth.payload.devicePublicKey) throw new Error('WRONG_DEVICE');
      const generation = this.generation;
      const salt = bytesToHex(this.random(16));
      const hash = await pbkdf2Async(sha256, utf8(pin), hexToBytes(salt), { c: PIN_ITERATIONS, dkLen: 32, asyncTick: 10 });
      const nextSecret: Secret = { ...secret, salt, pinHash: bytesToHex(hash), authorizationId: auth.payload.authorizationId };
      hash.fill(0);
      await this.storage.writeSecret(auth.payload.requestId, JSON.stringify(nextSecret));
      await this.save({ ...this.vault, selectedId: auth.payload.authorizationId, authorizations: [...this.vault.authorizations, auth] });
      if (generation === this.generation) this.session = { authorization: auth, seed: secret.seed };
      return auth;
    });
  }
  async unlock(authorizationId: string, pin: string) {
    return this.exclusive(async () => {
      this.lock();
      const generation = this.generation;
      const candidate = this.vault.authorizations.find((a) => a.payload.authorizationId === authorizationId);
      if (!candidate) throw new Error('AUTHORIZATION_MISSING');
      const auth = verifyAuthorization(candidate, this.trust);
      const secret = await this.secret(auth.payload.requestId);
      if (secret.authorizationId !== authorizationId || !secret.salt || !secret.pinHash || publicKeyOf(secret.seed) !== auth.payload.devicePublicKey) throw new Error('DEVICE_KEY_MISSING');
      // A backwards clock cannot shorten an already persisted lockout.
      const now = this.now();
      if (now < secret.blockedUntil || now < secret.lastAttempt) throw new Error('PIN_WAIT');
      const hash = await pbkdf2Async(sha256, utf8(pin), hexToBytes(secret.salt), { c: PIN_ITERATIONS, dkLen: 32, asyncTick: 10 });
      const valid = equalBytes(hash, hexToBytes(secret.pinHash));
      hash.fill(0);
      if (!valid) {
        secret.failures++;
        secret.lastAttempt = now;
        secret.blockedUntil = now + (secret.failures >= 5 ? Math.min(900_000, 30_000 * 2 ** Math.min(5, secret.failures - 5)) : 0);
        await this.storage.writeSecret(auth.payload.requestId, JSON.stringify(secret));
        throw new Error(secret.failures >= 5 ? 'PIN_WAIT' : 'WRONG_PIN');
      }
      await this.storage.writeSecret(auth.payload.requestId, JSON.stringify({ ...secret, failures: 0, blockedUntil: 0, lastAttempt: now }));
      await this.save({ ...this.vault, selectedId: authorizationId });
      if (generation === this.generation) this.session = { authorization: auth, seed: secret.seed };
      return auth;
    });
  }
  signExport(payload: Record<string, unknown>): SignedExport {
    const identity = payload.collector as { code?: string; targetLanguage?: string } | null;
    if (!identity?.code) throw new Error('EXPORT_IDENTITY_MISMATCH');
    const authorization = this.requireSession(identity.code, identity.targetLanguage);
    // Remove undefined optional properties before canonical signing.
    const clean = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    return signDocument({ format: 'bli-signed-export' as const, version: 1 as const, authorization, payload: clean }, this.session!.seed);
  }
}
