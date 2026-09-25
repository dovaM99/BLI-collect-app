import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { LocalAuth, normalizeName, type AuthStorage } from '../src/auth/engine';
import { describeCollectorCode } from '../src/utils/collectorCode';

class MemoryStorage implements AuthStorage {
  data: string | null = null; legacy: string | null = null; secrets = new Map<string, string>();
  async readPublic() { return this.data; }
  async writePublic(value: string) { this.data = value; }
  async readLegacy() { return this.legacy; }
  async readSecret(id: string) { return this.secrets.get(id) ?? null; }
  async writeSecret(id: string, value: string) { this.secrets.set(id, value); }
}
const random = (n: number) => new Uint8Array(randomBytes(n));

async function main() {
  const storage = new MemoryStorage();
  const phone = new LocalAuth(storage, random);
  await phone.initialize();
  assert.equal(phone.snapshot().accounts.length, 0);

  // Inscription : prénom, nom, langue, PIN — accès immédiat.
  await assert.rejects(phone.register({ firstName: 'Élise', lastName: 'Mbemba', language: 'ln' }, '12'), /INVALID_PIN/);
  await assert.rejects(phone.register({ firstName: '  ', lastName: 'Mbemba', language: 'ln' }, '1234'), /INVALID_NAME/);
  const account = await phone.register({ firstName: ' Élise ', lastName: 'Mbemba', language: 'ln' }, '1234');
  assert.equal(phone.active()?.collectorCode, account.collectorCode);
  assert.equal(account.firstName, 'Élise');
  const code = describeCollectorCode(account.collectorCode);
  assert.equal(code.format, 'bli'); assert.equal(code.checksumOk, true);
  assert.ok(!storage.data!.includes('1234') && ![...storage.secrets.values()].some((v) => v.includes('1234')));
  await assert.rejects(phone.register({ firstName: 'ÉLISE', lastName: 'mbemba', language: 'kg' }, '9999'), /ACCOUNT_EXISTS/);

  // Déconnexion puis réouverture avec le PIN.
  phone.lock();
  assert.throws(() => phone.requireSession(), /AUTH_LOCKED/);
  await assert.rejects(phone.unlock(account.collectorCode, '0000'), /WRONG_PIN/);
  await phone.unlock(account.collectorCode, '1234');
  assert.equal(phone.requireSession(account.collectorCode, 'ln').collectorCode, account.collectorCode);
  assert.throws(() => phone.requireSession(account.collectorCode, 'kg'), /AUTH_LOCKED/);

  // Redémarrage : le compte est retrouvé, la session est fermée.
  const restarted = new LocalAuth(storage, random);
  await restarted.initialize();
  assert.equal(restarted.active(), null);
  assert.equal(restarted.snapshot().selectedCode, account.collectorCode);
  await restarted.unlock(account.collectorCode, '1234');

  // Code oublié : correspondance insensible à la casse, aux espaces et à la forme des accents.
  assert.equal(normalizeName('  ÉLISE  '), normalizeName('élise'));
  await assert.rejects(restarted.resetPin('Elise', 'Mbemba', '5678'), /NAME_NOT_FOUND/);
  await assert.rejects(restarted.resetPin('Mbemba', 'Élise', '5678'), /NAME_NOT_FOUND/);
  await restarted.resetPin('ÉLISE', '  mbemba ', '5678');
  assert.equal(restarted.active()?.collectorCode, account.collectorCode);
  restarted.lock();
  await assert.rejects(restarted.unlock(account.collectorCode, '1234'), /WRONG_PIN/);
  await restarted.unlock(account.collectorCode, '5678');

  // Deuxième collecteur sur le même téléphone : code différent.
  const other = await restarted.register({ firstName: 'Jean', lastName: 'Kinzonzi', language: 'ktu' }, '424242');
  assert.notEqual(other.collectorCode, account.collectorCode);
  assert.equal(restarted.snapshot().accounts.length, 2);

  // Migration 0.3.0 : identité et code conservés, nouveau PIN à choisir.
  const legacyStorage = new MemoryStorage();
  legacyStorage.legacy = JSON.stringify({ version: 1, requests: [], selectedId: null, authorizations: [{ format: 'bli-authorization', version: 1, keyId: 'x', signature: 'y',
    payload: { authorizationId: 'a'.repeat(32), requestId: 'b'.repeat(32), devicePublicKey: 'c'.repeat(64), campaignId: 'beta', issuedAt: '2026-09-15T10:00:00.000Z',
      identity: { collectorCode: 'TEST2026', username: 'u', firstName: 'Marie', lastName: 'Ngoma', language: 'kg' } } }] });
  const migrated = new LocalAuth(legacyStorage, random);
  await migrated.initialize();
  const [legacy] = migrated.snapshot().accounts;
  assert.equal(legacy?.collectorCode, 'TEST2026'); assert.equal(legacy?.pinSet, false);
  await assert.rejects(migrated.unlock('TEST2026', '1234'), /PIN_NOT_SET/);
  await migrated.resetPin('marie', 'NGOMA', '1234');
  assert.equal(migrated.active()?.language, 'kg');
  const reread = new LocalAuth(legacyStorage, random); await reread.initialize();
  await reread.unlock('TEST2026', '1234');

  console.log('Local PIN access: register, unlock, forgotten code, several collectors and 0.3.0 migration OK.');
}
void main().catch((error) => { console.error(error); process.exit(1); });
