/** Offline regressions: bundled assets, saved-state upgrades, and export continuity. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Exercise the real pure state/data functions with minimal native boundaries.
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return { Platform: { OS: 'test', constants: {} } };
  if (request === 'expo-file-system/legacy') return { documentDirectory: 'file:///test/' };
  if (request === 'expo-sharing') return {};
  return originalLoad.call(this, request, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
require.extensions['.webp'] = (module, filename) => { module.exports = filename; };

const { betaPack } = require('../src/data/betaPack.ts');
const { initialState, samplePack, packRecordFrom } = require('../src/data/samplePack.ts');
const { normalizeState, emptyMetrics } = require('../src/services/storageState.ts');
const { buildExportPayload } = require('../src/services/dataFiles.ts');
const { itemSupportsLanguage, resolvePrompt } = require('../src/utils/targetLanguages.ts');
const sources = JSON.parse(readFileSync(resolve(root, 'docs/beta-photo-sources.json'), 'utf8'));

assert.equal(initialState.pack.id, betaPack.id);
assert.equal(betaPack.items.length, 100);
assert.equal(betaPack.targetItems, 100);
assert.equal(new Set(betaPack.items.map((item) => item.id)).size, 100);
assert.equal(new Set(betaPack.items.map((item) => item.bundledImage)).size, 100);
assert.equal(new Set(sources.photos.map((photo) => photo.commonsPageId)).size, 100);
assert.equal(new Set(sources.photos.map((photo) => photo.sha256)).size, 100);
assert.equal(betaPack.items[0].bundledImage, samplePack.items[0].bundledImage);
for (const [i, photo] of sources.photos.entries()) {
  const bytes = readFileSync(resolve(root, photo.localPath));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), photo.sha256);
  assert.match(photo.licenseUrl, /^https:\/\/creativecommons\.org\//);
  assert.match(photo.sourceUrl, /^https:\/\/commons\.wikimedia\.org\//);
  assert.ok(photo.author && photo.license && photo.modifications);
  assert.equal(betaPack.items[i].metadata.imageSha256, photo.sha256);
  for (const language of ['ln', 'ktu', 'kg']) {
    assert.ok(itemSupportsLanguage(betaPack.items[i], language));
    assert.ok(resolvePrompt(betaPack.items[i], language, 'fr'));
    assert.ok(resolvePrompt(betaPack.items[i], language, 'en'));
  }
}
console.log('100 distinct, intact, attributed offline photos; all collection languages supported.');

const now = '2026-09-01T12:00:00.000Z';
const profile = {
  id: 'annotator-beta', collectorCode: 'TEST01', username: 'beta', firstName: 'Test', lastName: 'Collecteur',
  targetLanguage: 'ktu', createdAt: now, collectionStartedAt: now, lastTrustedAt: now,
};
const oldAnnotation = {
  taskId: 'iyoba-01', packId: samplePack.id, sessionId: 'old-session', language: 'ktu',
  text: 'Annotation de test conservée', wordCount: 4, status: 'validated', updatedAt: now, metrics: emptyMetrics(),
};
const oldSession = {
  id: 'old-session', profileId: profile.id, packId: samplePack.id, language: 'ktu', startedAt: now,
  lastActiveAt: now, status: 'active', currentIndex: 3, annotationIds: [],
};
const oldState = {
  ...initialState, profile, pack: { ...samplePack, targetLanguage: 'ktu' },
  packRegistry: { [samplePack.id]: packRecordFrom(samplePack) },
  annotations: { old: oldAnnotation }, sessions: [oldSession], activeSessionId: oldSession.id,
  collectionClocks: { [profile.id]: { collectionStartedAt: now, lastTrustedAt: now } },
  profileWorkspaces: {
    another: { profile: { ...profile, id: 'another', collectorCode: 'TEST02' }, annotations: { old: oldAnnotation }, sessions: [], activeSessionId: null, updatedAt: now },
  },
};
const migrated = normalizeState(JSON.stringify(oldState));
assert.equal(migrated.pack.id, betaPack.id);
assert.equal(migrated.pack.targetLanguage, 'ktu');
assert.equal(migrated.activeSessionId, null);
assert.equal(migrated.sessions[0].status, 'paused');
assert.equal(Object.values(migrated.annotations)[0].text, oldAnnotation.text);
assert.equal(Object.values(migrated.profileWorkspaces.another.annotations)[0].text, oldAnnotation.text);
assert.ok(migrated.packRegistry[samplePack.id]);
assert.equal(migrated.collectionClocks[profile.id].collectionStartedAt, now);
assert.equal(migrated.installationId, oldState.installationId);
// Compare the persisted representation: JSON intentionally omits undefined
// optional fields such as originPackId in a newly registered bundled pack.
assert.deepEqual(
  JSON.parse(JSON.stringify(normalizeState(JSON.stringify(migrated)))),
  JSON.parse(JSON.stringify(migrated)),
);
const oldExport = buildExportPayload(migrated).collections.find((collection) => collection.pack.id === samplePack.id);
assert.ok(oldExport);
assert.equal(oldExport.kind, 'previous');
assert.equal(oldExport.annotations[0].text, oldAnnotation.text);
console.log('Demo upgrade preserves annotations, profiles, clocks, and installation; old session paused.');

const stale = JSON.parse(JSON.stringify(migrated));
stale.pack.items[0].bundledImage = 999999;
assert.equal(normalizeState(JSON.stringify(stale)).pack.items[0].bundledImage, betaPack.items[0].bundledImage);

const betaSession = { ...oldSession, id: 'beta-session', packId: betaPack.id, currentIndex: 52 };
const resumedBeta = normalizeState(JSON.stringify({
  ...migrated, sessions: [...migrated.sessions, betaSession], activeSessionId: betaSession.id,
}));
assert.equal(resumedBeta.activeSessionId, betaSession.id);
assert.equal(resumedBeta.sessions.at(-1).currentIndex, 52);
assert.equal(resumedBeta.sessions.at(-1).status, 'active');

const betaItem = betaPack.items[0];
const exportWithBeta = buildExportPayload({
  ...migrated,
  annotations: { ...migrated.annotations, beta: { ...oldAnnotation, packId: betaPack.id, taskId: betaItem.id } },
});
const betaExport = exportWithBeta.collections.find((collection) => collection.pack.id === betaPack.id);
assert.equal(betaExport.annotations[0].metadata.sourceUrl, betaItem.metadata.sourceUrl);
assert.equal(betaExport.annotations[0].metadata.license, betaItem.metadata.license);
assert.equal(betaExport.annotations[0].language, 'ktu');

const downloaded = {
  ...oldState,
  pack: { ...samplePack, id: 'downloaded-assignment', source: 'downloaded', targetLanguage: 'kg' },
  assignment: { id: 'downloaded-assignment', status: 'downloading', targetItems: 200, installedPackIds: [] },
};
const restoredDownload = normalizeState(JSON.stringify(downloaded));
assert.equal(restoredDownload.pack.id, downloaded.pack.id);
assert.equal(restoredDownload.pack.targetLanguage, 'kg');
assert.equal(restoredDownload.assignment.status, 'paused');
console.log('Asset IDs refreshed after an update; downloaded assignments left in place.');

const activeAuthorizationId = 'a'.repeat(32);
const signedState = normalizeState(JSON.stringify({
  ...migrated,
  annotations: { old: oldAnnotation, beta: { ...oldAnnotation, taskId: betaItem.id, packId: betaPack.id, authorizationId: activeAuthorizationId } },
  abandonedCollections: [{ id: 'other-private', abandonedAt: now, profile: { ...profile, id: 'other-collector' },
    pack: { id: samplePack.id, name: 'Demo', version: '1', targetItems: 6, targetLanguage: 'ktu' },
    annotations: [{ ...oldAnnotation, text: 'PRIVATE_OTHER_COLLECTOR' }], sessions: [], items: [] }],
}));
const authenticatedExport = buildExportPayload(signedState);
const exportedAnnotations = authenticatedExport.collections.flatMap((c) => c.annotations);
assert.equal(exportedAnnotations.find((a) => a.id === betaItem.id).authorizationId, activeAuthorizationId);
assert.equal(exportedAnnotations.find((a) => a.id === oldAnnotation.taskId).authorizationId, undefined);
assert.equal(JSON.stringify(authenticatedExport).includes('PRIVATE_OTHER_COLLECTOR'), false);
console.log('Activation attribution survives storage; legacy work stays unverified; other collectors’ archives stay private.');
