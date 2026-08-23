import { sha256 } from '@noble/hashes/sha256';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { buildInfo } from '../utils/appInfo';
import type {
  AbandonedCollection,
  Annotation,
  AppState,
  CollectionSession,
  CompactAnnotation,
  CompactCollectionExport,
  CompactExport,
  CompactExportPayload,
  ExportTotals,
  PackRecord,
  Profile,
  TargetLanguage,
} from '../types';

const EXPORTS_DIRECTORY = `${FileSystem.documentDirectory}bli-exports/`;

function safeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

async function ensureDirectory(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

function utf8Bytes(value: string) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);
  // Repli si le moteur JS n'expose pas TextEncoder.
  const escaped = unescape(encodeURIComponent(value));
  const bytes = new Uint8Array(escaped.length);
  for (let index = 0; index < escaped.length; index += 1) bytes[index] = escaped.charCodeAt(index);
  return bytes;
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function compactAnnotation(
  annotation: Annotation,
  item: PackRecord['items'][number] | undefined,
): CompactAnnotation {
  return {
    id: annotation.taskId,
    session: annotation.sessionId,
    language: annotation.language,
    text: annotation.text,
    words: annotation.wordCount,
    status: annotation.status,
    updated: annotation.updatedAt,
    validated: annotation.validatedAt,
    originPackId: item?.originPackId,
    metadata: item?.metadata,
    metrics: annotation.metrics,
  };
}

/**
 * Un lot dont le registre a été perdu ne doit pas faire disparaître ses
 * annotations : on reconstruit le minimum à partir des annotations elles-mêmes.
 */
function fallbackRecord(packId: string, annotations: Annotation[]): PackRecord {
  const first = annotations[0];
  return {
    id: packId,
    name: packId,
    version: '0',
    source: 'downloaded',
    targetItems: annotations.length,
    targetLanguage: first?.language ?? 'ln',
    firstSeenAt: first?.updatedAt ?? new Date().toISOString(),
    lastActiveAt: first?.updatedAt ?? new Date().toISOString(),
    items: [],
  };
}

function collectionFor(
  kind: CompactCollectionExport['kind'],
  record: PackRecord,
  sessions: CollectionSession[],
  annotations: Annotation[],
  abandonedAt?: string,
): CompactCollectionExport {
  const itemsById = new Map(record.items.map((item) => [item.id, item]));
  const meaningful = annotations
    .filter((annotation) => annotation.text.trim().length > 0)
    .sort((a, b) => a.taskId.localeCompare(b.taskId));

  return {
    kind,
    abandonedAt,
    pack: {
      id: record.id,
      name: record.name,
      version: record.version,
      targetItems: record.targetItems,
      targetLanguage: record.targetLanguage,
      availableLanguages: record.availableLanguages,
    },
    sessions: sessions.map((session) => ({
      id: session.id,
      start: session.startedAt,
      end: session.endedAt,
      status: session.status,
      currentIndex: session.currentIndex,
      language: session.language,
    })),
    annotations: meaningful.map((annotation) => compactAnnotation(annotation, itemsById.get(annotation.taskId))),
  };
}

function abandonedCollectionExport(collection: AbandonedCollection): CompactCollectionExport {
  const record: PackRecord = {
    id: collection.pack.id,
    name: collection.pack.name,
    version: collection.pack.version,
    source: 'downloaded',
    targetItems: collection.pack.targetItems,
    targetLanguage: collection.pack.targetLanguage,
    firstSeenAt: collection.abandonedAt,
    lastActiveAt: collection.abandonedAt,
    items: collection.items.map((item) => ({
      id: item.id,
      originPackId: item.originPackId,
      minWords: 0,
      metadata: item.metadata,
    })),
  };
  return collectionFor('abandoned', record, collection.sessions, collection.annotations, collection.abandonedAt);
}

function collectorOf(profile: Profile, state: AppState) {
  const clock = state.collectionClocks[profile.id];
  return {
    id: profile.id,
    code: profile.collectorCode,
    codeFormat: profile.collectorCodeFormat,
    codeChecksumOk: profile.collectorCodeChecksumOk,
    username: profile.username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    targetLanguage: profile.targetLanguage,
    collectionStartedAt: clock?.collectionStartedAt ?? profile.collectionStartedAt,
    clockTrustedAt: clock?.lastTrustedAt ?? profile.lastTrustedAt,
  };
}

function totalsOf(collections: CompactCollectionExport[]): ExportTotals {
  let annotations = 0;
  let validated = 0;
  let words = 0;
  collections.forEach((collection) => {
    collection.annotations.forEach((annotation) => {
      annotations += 1;
      if (annotation.status === 'validated') validated += 1;
      words += annotation.words;
    });
  });
  return { collections: collections.length, annotations, validated, words };
}

/**
 * Construit le contenu de l'export.
 *
 * Correction majeure par rapport à la v3 : l'export ne se limite plus au lot
 * actif. Toutes les annotations du profil sont regroupées par lot, y compris
 * celles des lots déjà remplacés par un lot suivant — qui restaient auparavant
 * dans le stockage sans jamais ressortir.
 */
export function buildExportPayload(state: AppState): CompactExportPayload {
  const collections: CompactCollectionExport[] = [];

  if (state.profile) {
    const byPack = new Map<string, Annotation[]>();
    Object.values(state.annotations).forEach((annotation) => {
      const bucket = byPack.get(annotation.packId);
      if (bucket) bucket.push(annotation);
      else byPack.set(annotation.packId, [annotation]);
    });
    // Un lot actif encore vierge doit tout de même apparaître : il porte la
    // langue et l'objectif de la collecte en cours.
    if (!byPack.has(state.pack.id)) byPack.set(state.pack.id, []);

    const orderedPackIds = [
      state.pack.id,
      ...[...byPack.keys()].filter((packId) => packId !== state.pack.id).sort(),
    ];

    orderedPackIds.forEach((packId) => {
      const annotations = byPack.get(packId) ?? [];
      const record = state.packRegistry[packId] ?? fallbackRecord(packId, annotations);
      const sessions = state.sessions.filter((session) => session.packId === packId);
      if (packId !== state.pack.id && annotations.length === 0 && sessions.length === 0) return;
      collections.push(
        collectionFor(packId === state.pack.id ? 'current' : 'previous', record, sessions, annotations),
      );
    });
  }

  (state.abandonedCollections ?? []).forEach((collection) => {
    collections.push(abandonedCollectionExport(collection));
  });

  return {
    v: 4,
    app: 'BLI Collect',
    at: new Date().toISOString(),
    build: { ...buildInfo(), installationId: state.installationId },
    collector: state.profile ? collectorOf(state.profile, state) : null,
    collections,
    totals: totalsOf(collections),
  };
}

/**
 * Sceau d'intégrité.
 *
 * Le fichier voyage par WhatsApp ou clé USB : une troncature silencieuse est le
 * mode de panne le plus probable et le plus difficile à voir. `bodyBytes` la
 * détecte seul ; `value` détecte en plus une altération du contenu.
 *
 * Vérification côté dépouillement (Python) :
 *   payload = json.load(f); integrity = payload.pop("integrity")
 *   body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
 *   hashlib.sha256(body.encode()).hexdigest() == integrity["value"]
 */
export function sealExport(payload: CompactExportPayload): { document: CompactExport; serialized: string } {
  const body = JSON.stringify(payload);
  const bytes = utf8Bytes(body);
  const document: CompactExport = {
    ...payload,
    integrity: {
      algorithm: 'sha256',
      value: hex(sha256(bytes)),
      bodyBytes: bytes.length,
    },
  };
  return { document, serialized: JSON.stringify(document) };
}

export function buildCompactExport(state: AppState): CompactExport {
  return sealExport(buildExportPayload(state)).document;
}

export function countExportAnnotations(state: AppState) {
  return buildExportPayload(state).totals.annotations;
}

export function exportFileName(state: AppState, at: string) {
  const stamp = at.replace(/[:.]/g, '-');
  const code = state.profile ? safeSegment(state.profile.collectorCode) : 'sans-code';
  const language = state.profile?.targetLanguage ?? 'xx';
  return `bli_${code}_${language}_${safeSegment(state.pack.id)}_${stamp}.json`;
}

export async function writeExportFile(state: AppState) {
  await ensureDirectory(EXPORTS_DIRECTORY);
  const payload = buildExportPayload(state);
  const { serialized } = sealExport(payload);
  const fileUri = `${EXPORTS_DIRECTORY}${exportFileName(state, payload.at)}`;
  await FileSystem.writeAsStringAsync(fileUri, serialized);
  return fileUri;
}

export async function listExportFiles() {
  try {
    const info = await FileSystem.getInfoAsync(EXPORTS_DIRECTORY);
    if (!info.exists) return [];
    const names = await FileSystem.readDirectoryAsync(EXPORTS_DIRECTORY);
    return names.filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

export async function writeAndShareExport(state: AppState) {
  const fileUri = await writeExportFile(state);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Exporter les annotations BLI Collect',
      UTI: 'public.json',
    });
  }

  return { fileUri, canShare };
}
