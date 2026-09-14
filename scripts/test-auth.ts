import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createPublicKey, verify } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { OfflineAuth, type AuthStorage } from '../src/auth/engine';
import { canonical, keyIdOf, publicKeyOf, signDocument, verifyAuthorization, verifyRequest, parseDocument, verifySignedExport, type Identity, type TrustStore } from '../src/auth/protocol';
import { Authority } from '../tools/authority/authority';

class MemoryStorage implements AuthStorage {
  data: string | null = null; secrets = new Map<string, string>();
  async readPublic() { return this.data; }
  async writePublic(value: string) { this.data = value; }
  async readSecret(id: string) { return this.secrets.get(id) ?? null; }
  async writeSecret(id: string, value: string) { this.secrets.set(id, value); }
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const identity: Identity = { collectorCode: 'TEST2026', username: 'collectrice', firstName: 'Élise', lastName: 'Test', language: 'ktu' };
function samplePayload(authorizationId: string) {
  return { v: 4, app: 'BLI Collect', at: '2026-09-14T12:00:00.000Z',
    collector: { code: identity.collectorCode, username: identity.username, firstName: identity.firstName, lastName: identity.lastName, targetLanguage: identity.language },
    collections: [{ annotations: [{ id: 'new', text: 'Texte kituba de test', language: 'ktu', authorizationId }, { id: 'old', text: 'Travail antérieur conservé', language: 'ln' }] }] };
}
async function freePort() {
  const server = createServer();
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((res, rej) => server.close((e) => e ? rej(e) : res())); return port;
}
async function httpTest(root: string) {
  const port = await freePort(); const origin = `http://127.0.0.1:${port}`;
  const config = join(root, 'http-trust.json'); writeFileSync(config, JSON.stringify({ version: 1, keys: [] }));
  const child = spawn(process.execPath, ['--import', 'tsx', 'tools/authority/server.ts'], {
    cwd: process.cwd(), env: { ...process.env, BLI_AUTHORITY_DIR: join(root, 'http-authority'), BLI_AUTHORITY_TRUST_PATH: config, BLI_AUTHORITY_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((res, rej) => {
      const timer = setTimeout(() => rej(new Error('Local tool startup timeout')), 15_000);
      child.once('exit', (code) => { clearTimeout(timer); rej(new Error(`Local tool exited: ${code}`)); });
      child.stdout.on('data', (chunk) => { if (String(chunk).includes('Outil BLI prêt')) { clearTimeout(timer); res(); } });
    });
    const page = await fetch(origin); const html = await page.text();
    assert.match(page.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    const token = html.match(/name="bli-token" content="([a-f0-9]+)"/)![1]!;
    const post = (action: string, body: unknown = {}, overrides: Record<string, string> = {}) => fetch(`${origin}/api/${action}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-BLI-Token': token, ...overrides }, body: JSON.stringify(body) });
    assert.equal((await post('status', {}, { Origin: 'https://example.org' })).status, 403);
    assert.equal((await post('status', {}, { 'X-BLI-Token': 'bad' })).status, 403);
    // fetch controls Host itself. Use a raw HTTP request to exercise DNS-rebinding protection.
    const wrongHostStatus = await new Promise<number | undefined>((res, rej) => {
      const req = httpRequest(`${origin}/api/status`, { method: 'POST', headers: { Host: 'evil.example', Origin: origin, 'X-BLI-Token': token, 'Content-Type': 'application/json' } }, (response) => { response.resume(); res(response.statusCode); });
      req.on('error', rej); req.end('{}');
    });
    assert.equal(wrongHostStatus, 403);
    assert.equal((await fetch(`${origin}/api/status`)).status, 403);
    assert.equal((await post('setup', { label: 'TEST HTTP', password: 'test-only-password-4581' })).status, 200);
    const status = await (await post('status')).json() as { unlocked: boolean; configured: boolean };
    assert.equal(status.unlocked, true); assert.equal(status.configured, true);
    const backupResponse = await post('backup'); assert.equal(backupResponse.status, 200);
    assert.equal((await post('lock')).status, 200);
    assert.equal((await post('backup')).status, 400);
    assert.equal((await post('unlock', { password: 'incorrect' })).status, 400);
    assert.equal((await post('unlock', { password: 'test-only-password-4581' })).status, 200);
    console.log('Local UI API: loopback host, Origin, CSRF, encrypted setup, locking and password checks passed.');
  } finally { child.kill('SIGTERM'); await new Promise<void>((res) => child.once('exit', () => res())); }
}
async function main() {
  const root = mkdtempSync(join(tmpdir(), 'bli-auth-test-'));
  try {
    const config = join(root, 'trust.json'); writeFileSync(config, JSON.stringify({ version: 1, keys: [] }));
    const directory = join(root, 'authority'); const password = 'test-only-password-9876';
    const admin = new Authority(directory, config);
    assert.throws(() => admin.issue({}, 'beta', false, true), /AUTHORITY_LOCKED/);
    // First-run phone test: a collector can prepare/share a request before BLI setup.
    const storage = new MemoryStorage(); let now = Date.now();
    const unconfigured = new OfflineAuth(storage, { version: 1, keys: [] }, randomBytes, () => now);
    await unconfigured.initialize();
    const request = await unconfigured.createRequest(identity);
    verifyRequest(parseDocument(JSON.stringify(request)));
    assert.equal(unconfigured.active(), null, 'Preparing a request does not grant access');
    assert.throws(() => unconfigured.requireSession(), /AUTH_LOCKED/);
    const pendingPhone = new OfflineAuth(storage, { version: 1, keys: [] }, randomBytes, () => now);
    await pendingPhone.initialize();
    assert.deepEqual(pendingPhone.snapshot().requests, [request], 'Pending request survives reload before BLI setup');
    admin.setup(password, 'AUTORITÉ DE TEST');
    assert.deepEqual(admin.inspectRequest(request).request, request);
    const trust = JSON.parse(readFileSync(config, 'utf8')) as TrustStore;
    assert.equal(trust.keys.length, 1); assert.equal(trust.keys[0]!.keyId, keyIdOf(trust.keys[0]!.publicKey));
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(join(directory, 'vault.json')).mode & 0o777, 0o600);
    assert.equal(readFileSync(join(directory, 'vault.json'), 'utf8').includes(password), false);
    const phone = new OfflineAuth(storage, trust, randomBytes, () => now);
    await phone.initialize(); assert.equal(phone.active(), null);
    assert.deepEqual(phone.snapshot().requests, [request], 'Configuring BLI preserves the original request and device key');
    const { signature: requestSignature, ...requestBody } = request;
    const nodeKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(request.payload.devicePublicKey, 'hex')]), format: 'der', type: 'spki' });
    assert.equal(verify(null, Buffer.from(`BLI-OFFLINE-V1\n${canonical(requestBody)}`), nodeKey, Buffer.from(requestSignature, 'hex')), true, 'Independent Node/OpenSSL verifier agrees with mobile Ed25519');
    const tamperedRequest = clone(request); tamperedRequest.payload.identity.firstName = 'Intrus';
    assert.throws(() => admin.inspectRequest(tamperedRequest), /INVALID_SIGNATURE/);
    assert.throws(() => admin.issue(request, 'beta', false, false), /IDENTITY_CHECK_REQUIRED/);
    const auth = admin.issue(request, 'beta-2026', false, true); verifyAuthorization(auth, trust);
    assert.throws(() => pendingPhone.previewAuthorization(auth), /ISSUER_NOT_CONFIGURED/);
    await assert.rejects(pendingPhone.activate(auth, '18273645'), /ISSUER_NOT_CONFIGURED/);
    assert.equal(pendingPhone.active(), null, 'An unconfigured app must not accept even a signed authorization');
    assert.deepEqual(pendingPhone.snapshot().requests, [request]);
    assert.equal(pendingPhone.snapshot().authorizations.length, 0);
    console.log('First-run request: empty BLI configuration, signed sharing, persistence and activation guard passed.');
    assert.deepEqual(admin.issue(request, 'beta-2026', false, true), auth, 'Issuance retries are idempotent');
    const altered = clone(auth); altered.payload.identity.language = 'ln';
    await assert.rejects(phone.activate(altered, '18273645'), /INVALID_SIGNATURE/);
    const rogue = randomBytes(32).toString('hex'); const { signature: ignoredSignature, ...unsignedAuth } = auth;
    const forged = signDocument(unsignedAuth, rogue);
    assert.throws(() => verifyAuthorization(forged, trust));
    const anotherPhone = new OfflineAuth(new MemoryStorage(), trust, randomBytes); await anotherPhone.initialize();
    await assert.rejects(anotherPhone.activate(auth, '18273645'), /WRONG_DEVICE/);
    await assert.rejects(phone.activate(auth, '1234'), /INVALID_PIN/);
    await phone.activate(auth, '18273645');
    assert.equal(phone.active()?.payload.authorizationId, auth.payload.authorizationId);
    assert.equal(storage.data!.includes('18273645'), false);
    assert.equal([...storage.secrets.values()].some((s) => s.includes('18273645')), false);
    assert.equal(storage.data!.includes('"seed"'), false);
    await assert.rejects(phone.activate(auth, '87654321'), /ALREADY_ACTIVATED/);
    const signed = phone.signExport(samplePayload(auth.payload.authorizationId));
    assert.deepEqual(verifySignedExport(signed, trust).current, 1);
    const checked = admin.verifyExport(signed); assert.equal(checked.total, 2); assert.equal(checked.previous, 1); assert.equal(checked.duplicate, false);
    assert.equal(admin.verifyExport(signed).duplicate, true);
    const modified = clone(signed); (modified.payload.collector as { code: string }).code = 'OTHER123';
    assert.throws(() => admin.verifyExport(modified), /INVALID_SIGNATURE/);
    assert.throws(() => phone.signExport({ ...samplePayload(auth.payload.authorizationId), collector: { code: 'OTHER123' } }), /AUTH_LOCKED/);
    assert.throws(() => admin.verifyExport(samplePayload(auth.payload.authorizationId)), /INVALID_DOCUMENT|UNSIGNED_EXPORT/);
    phone.lock(); assert.throws(() => phone.signExport(samplePayload(auth.payload.authorizationId)), /AUTH_LOCKED/);
    const reopened = new OfflineAuth(storage, trust, randomBytes, () => now); await reopened.initialize(); assert.equal(reopened.active(), null);
    for (let i = 0; i < 4; i++) await assert.rejects(reopened.unlock(auth.payload.authorizationId, '00000000'), /WRONG_PIN/);
    await assert.rejects(reopened.unlock(auth.payload.authorizationId, '00000000'), /PIN_WAIT/);
    const restarted = new OfflineAuth(storage, trust, randomBytes, () => now); await restarted.initialize();
    await assert.rejects(restarted.unlock(auth.payload.authorizationId, '18273645'), /PIN_WAIT/);
    now += 30_001; await restarted.unlock(auth.payload.authorizationId, '18273645');
    restarted.lock();
    const inFlight = restarted.unlock(auth.payload.authorizationId, '18273645'); restarted.lock(); await inFlight;
    assert.equal(restarted.active(), null, 'Explicit locking wins over a pending PIN operation');
    const recoveryRequest = await restarted.createRequest(identity);
    assert.throws(() => admin.issue(recoveryRequest, 'beta-2026', false, true), /REPLACEMENT_REQUIRED/);
    const replacement = admin.issue(recoveryRequest, 'beta-2026', true, true);
    assert.throws(() => admin.verifyExport(signed), /REVOKED_AUTHORIZATION/);
    await restarted.activate(replacement, '94716283');
    const newExport = restarted.signExport(samplePayload(replacement.payload.authorizationId));
    assert.equal(admin.verifyExport(newExport).current, 1);
    const backup = admin.backup();
    admin.lock(); assert.throws(() => admin.verifyExport(newExport), /AUTHORITY_LOCKED/);
    assert.throws(() => admin.unlock('wrong'), /WRONG_PASSWORD/); admin.unlock(password);
    const restored = new Authority(join(root, 'restored'), config); restored.restore(backup, password);
    assert.throws(() => restored.verifyExport(signed), /REVOKED_AUTHORIZATION/);
    assert.equal(restored.verifyExport(newExport).total, 2);
    const corruptedBackup = clone(backup); corruptedBackup.registry.revocations = [];
    assert.throws(() => new Authority(join(root, 'bad-backup'), config).restore(corruptedBackup, password), /INVALID_SIGNATURE/);
    assert.throws(() => new Authority(join(root, 'new-authority'), config).setup(password, 'Other'), /RESTORE_REQUIRED/);
    const reloadAdmin = new Authority(directory, config); reloadAdmin.unlock(password);
    assert.throws(() => reloadAdmin.verifyExport(signed), /REVOKED_AUTHORIZATION/);
    reloadAdmin.revoke(replacement.payload.authorizationId, 'Fin de la participation');
    assert.throws(() => reloadAdmin.verifyExport(newExport), /REVOKED_AUTHORIZATION/);
    assert.throws(() => parseDocument('x'.repeat(16_385)), /DOCUMENT_TOO_LARGE/);
    assert.throws(() => parseDocument('{bad'), /INVALID_DOCUMENT/);
    const secretMissing = new OfflineAuth({ ...storage, readPublic: () => storage.readPublic(), writePublic: (v) => storage.writePublic(v), readSecret: async () => null, writeSecret: async () => {} }, trust, randomBytes);
    await secretMissing.initialize(); await assert.rejects(secretMissing.unlock(replacement.payload.authorizationId, '94716283'), /DEVICE_KEY_MISSING/);
    console.log('Offline activation, Ed25519 interoperability, device binding, PIN persistence/backoff, recovery, signed exports, revocation and encrypted backup/restore passed.');
    await httpTest(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
