import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { isCollectorCodeAcceptable, normalizeCollectorCode } from '../utils/collectorCode';

export type Identity = {
  collectorCode: string; username: string; firstName: string; lastName: string;
  language: 'ln' | 'ktu' | 'kg';
};
export type RequestBody = { requestId: string; devicePublicKey: string; identity: Identity; createdAt: string };
export type ActivationRequest = { format: 'bli-request'; version: 1; payload: RequestBody; signature: string };
export type AuthorizationBody = {
  authorizationId: string; requestId: string; devicePublicKey: string; identity: Identity;
  campaignId: string; issuedAt: string;
};
export type Authorization = {
  format: 'bli-authorization'; version: 1; keyId: string; payload: AuthorizationBody; signature: string;
};
export type TrustStore = { version: 1; keys: Array<{ keyId: string; publicKey: string; label: string }> };
export type SignedExport = {
  format: 'bli-signed-export'; version: 1; authorization: Authorization;
  payload: Record<string, unknown>; signature: string;
};

export function utf8(value: string) {
  // Hermes does not always expose TextEncoder. This also rejects lone surrogates.
  const encoded = unescape(encodeURIComponent(value));
  return Uint8Array.from(encoded, (c) => c.charCodeAt(0));
}

/** BLI JSON v1: sorted object keys, JSON number/string encoding, no undefined. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  throw new Error('INVALID_DOCUMENT');
}

export function publicKeyOf(seed: string) { return bytesToHex(ed25519.getPublicKey(hexToBytes(seed))); }
export function keyIdOf(publicKey: string) { return `bli-${bytesToHex(sha256(hexToBytes(publicKey))).slice(0, 24)}`; }
export function fingerprint(publicKey: string) {
  return bytesToHex(sha256(hexToBytes(publicKey))).slice(0, 24).toUpperCase().match(/.{4}/g)!.join(' ');
}
export function signDocument<T extends object>(body: T, seed: string): T & { signature: string } {
  return { ...body, signature: bytesToHex(ed25519.sign(utf8(`BLI-OFFLINE-V1\n${canonical(body)}`), hexToBytes(seed))) };
}
export function checkSignature(document: Record<string, unknown>, publicKey: string) {
  const { signature, ...body } = document;
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) throw new Error('INVALID_SIGNATURE');
  let valid = false;
  try { valid = ed25519.verify(hexToBytes(signature), utf8(`BLI-OFFLINE-V1\n${canonical(body)}`), hexToBytes(publicKey), { zip215: false }); }
  catch { /* All invalid encodings fail closed. */ }
  if (!valid) throw new Error('INVALID_SIGNATURE');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_DOCUMENT');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw new Error('INVALID_DOCUMENT');
}
function text(value: unknown, max = 100): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('INVALID_DOCUMENT');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)) throw new Error('INVALID_DOCUMENT');
}
function key(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_DOCUMENT');
}
function date(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('INVALID_DOCUMENT');
}
export function validateIdentity(value: unknown): Identity {
  const v = object(value);
  exact(v, ['collectorCode', 'username', 'firstName', 'lastName', 'language']);
  text(v.collectorCode, 24); text(v.username, 60); text(v.firstName, 80); text(v.lastName, 80);
  if (normalizeCollectorCode(v.collectorCode) !== v.collectorCode || !isCollectorCodeAcceptable(v.collectorCode)) throw new Error('INVALID_COLLECTOR_CODE');
  if (!['ln', 'ktu', 'kg'].includes(String(v.language))) throw new Error('INVALID_LANGUAGE');
  return v as Identity;
}
export function verifyRequest(value: unknown): ActivationRequest {
  const v = object(value);
  exact(v, ['format', 'version', 'payload', 'signature']);
  if (v.format !== 'bli-request' || v.version !== 1) throw new Error('INVALID_DOCUMENT');
  const p = object(v.payload);
  exact(p, ['requestId', 'devicePublicKey', 'identity', 'createdAt']);
  id(p.requestId); key(p.devicePublicKey); date(p.createdAt); validateIdentity(p.identity);
  checkSignature(v, p.devicePublicKey);
  return v as unknown as ActivationRequest;
}
export function verifyAuthorization(value: unknown, trust: TrustStore): Authorization {
  const v = object(value);
  exact(v, ['format', 'version', 'keyId', 'payload', 'signature']);
  if (v.format !== 'bli-authorization' || v.version !== 1 || typeof v.keyId !== 'string') throw new Error('INVALID_DOCUMENT');
  const issuer = trust.keys.find((entry) => entry.keyId === v.keyId);
  if (!issuer || keyIdOf(issuer.publicKey) !== issuer.keyId) throw new Error('UNKNOWN_ISSUER');
  const p = object(v.payload);
  exact(p, ['authorizationId', 'requestId', 'devicePublicKey', 'identity', 'campaignId', 'issuedAt']);
  id(p.authorizationId); id(p.requestId); key(p.devicePublicKey); date(p.issuedAt);
  text(p.campaignId, 80); validateIdentity(p.identity);
  checkSignature(v, issuer.publicKey);
  return v as unknown as Authorization;
}
export function verifySignedExport(value: unknown, trust: TrustStore, revoked: string[] = []) {
  const v = object(value);
  if (v.format !== 'bli-signed-export' || v.version !== 1) throw new Error('UNSIGNED_EXPORT');
  exact(v, ['format', 'version', 'authorization', 'payload', 'signature']);
  const auth = verifyAuthorization(v.authorization, trust);
  if (revoked.includes(auth.payload.authorizationId)) throw new Error('REVOKED_AUTHORIZATION');
  checkSignature(v, auth.payload.devicePublicKey);
  const payload = object(v.payload);
  const collector = object(payload.collector);
  const identity = auth.payload.identity;
  if (payload.app !== 'BLI Collect' || payload.v !== 4 || collector.code !== identity.collectorCode
    || collector.username !== identity.username || collector.firstName !== identity.firstName
    || collector.lastName !== identity.lastName || collector.targetLanguage !== identity.language
    || !Array.isArray(payload.collections)) throw new Error('EXPORT_IDENTITY_MISMATCH');
  let current = 0; let previous = 0;
  for (const entry of payload.collections) {
    const collection = object(entry);
    if (!Array.isArray(collection.annotations)) throw new Error('INVALID_DOCUMENT');
    for (const item of collection.annotations) {
      const annotation = object(item);
      if (annotation.authorizationId === auth.payload.authorizationId) {
        if (annotation.language !== identity.language) throw new Error('INVALID_LANGUAGE');
        current++;
      } else previous++;
    }
  }
  return { authorization: auth, current, previous, total: current + previous };
}

export function parseDocument(serialized: string, maxBytes = 16_384): unknown {
  if (serialized.length > maxBytes || utf8(serialized).length > maxBytes) throw new Error('DOCUMENT_TOO_LARGE');
  try { return JSON.parse(serialized); } catch { throw new Error('INVALID_DOCUMENT'); }
}
