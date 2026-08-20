import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type {
  AbandonedCollection,
  Annotation,
  AppState,
  CollectionSession,
  CompactCollectionExport,
  CompactExport,
  Profile,
} from '../types';

const EXPORTS_DIRECTORY = `${FileSystem.documentDirectory}bli-exports/`;

function safeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

async function ensureDirectory(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

type ItemDetails = {
  id: string;
  originPackId?: string;
  metadata?: Record<string, unknown>;
};

function compactCollection({
  kind,
  abandonedAt,
  profile,
  pack,
  sessions,
  annotations,
  items,
}: {
  kind: CompactCollectionExport['kind'];
  abandonedAt?: string;
  profile: Profile;
  pack: { id: string; version: string; targetItems: number };
  sessions: CollectionSession[];
  annotations: Annotation[];
  items: ItemDetails[];
}): CompactCollectionExport {
  const meaningfulAnnotations = annotations
    .filter((annotation) => annotation.packId === pack.id && annotation.text.trim().length > 0)
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
  const itemsById = new Map(items.map((item) => [item.id, item]));

  return {
    kind,
    abandonedAt,
    pack,
    user: {
      id: profile.id,
      username: profile.username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      collectionStartedAt: profile.collectionStartedAt,
    },
    sessions: sessions
      .filter((session) => session.packId === pack.id)
      .map((session) => ({
        id: session.id,
        start: session.startedAt,
        end: session.endedAt,
        status: session.status,
        currentIndex: session.currentIndex,
      })),
    annotations: meaningfulAnnotations.map((annotation) => {
      const item = itemsById.get(annotation.taskId);
      return {
        id: annotation.taskId,
        session: annotation.sessionId,
        text: annotation.text,
        words: annotation.wordCount,
        status: annotation.status,
        updated: annotation.updatedAt,
        originPackId: item?.originPackId,
        metadata: item?.metadata,
      };
    }),
  };
}

function compactAbandonedCollection(collection: AbandonedCollection) {
  return compactCollection({
    kind: 'abandoned',
    abandonedAt: collection.abandonedAt,
    profile: collection.profile,
    pack: {
      id: collection.pack.id,
      version: collection.pack.version,
      targetItems: collection.pack.targetItems,
    },
    sessions: collection.sessions,
    annotations: collection.annotations,
    items: collection.items,
  });
}

export function buildCompactExport(state: AppState): CompactExport {
  const current = state.profile
    ? compactCollection({
        kind: 'current',
        profile: state.profile,
        pack: {
          id: state.pack.id,
          version: state.pack.version,
          targetItems: state.pack.items.length,
        },
        sessions: state.sessions,
        annotations: Object.values(state.annotations),
        items: state.pack.items,
      })
    : null;

  return {
    v: 3,
    app: 'BLI Collect',
    at: new Date().toISOString(),
    current,
    abandoned: (state.abandonedCollections ?? []).map(compactAbandonedCollection),
  };
}

export function countExportAnnotations(state: AppState) {
  const payload = buildCompactExport(state);
  return (payload.current?.annotations.length ?? 0)
    + payload.abandoned.reduce((total, collection) => total + collection.annotations.length, 0);
}

export async function writeExportFile(state: AppState) {
  await ensureDirectory(EXPORTS_DIRECTORY);
  const payload = buildCompactExport(state);
  const stamp = payload.at.replace(/[:.]/g, '-');
  const fileUri = `${EXPORTS_DIRECTORY}${safeSegment(state.pack.id)}-${stamp}.json`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload));

  return fileUri;
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
