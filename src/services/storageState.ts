import { initialState, packRecordFrom, samplePack } from '../data/samplePack';
import { createInstallationId } from '../utils/appInfo';
import { describeCollectorCode, normalizeCollectorCode } from '../utils/collectorCode';
import { normalizeTargetLanguage } from '../utils/targetLanguages';
import type {
  AbandonedCollection,
  Annotation,
  AnnotationMetrics,
  AppState,
  CollectionSession,
  PackRecord,
  Profile,
  ProfileWorkspace,
  TargetLanguage,
  TaskItem,
  TaskPack,
} from '../types';

export const STORAGE_KEY = '@bli-collect/state/v4';
export const PREVIOUS_STORAGE_KEYS = [
  '@bli-collect/state/v3',
  '@bli-collect/state/v2',
  '@bli-collect/state/v1',
];

/** Langue retenue quand un état antérieur à la v4 ne portait aucune langue. */
const MIGRATION_DEFAULT_LANGUAGE: TargetLanguage = 'ln';

type StoredState = Partial<Omit<AppState, 'schemaVersion'>> & { schemaVersion?: number };

export function emptyMetrics(): AnnotationMetrics {
  return {
    activeMs: 0,
    editCount: 0,
    charCount: 0,
    maxBurstChars: 0,
    burstCount: 0,
    deletionCount: 0,
    validationCount: 0,
  };
}

function normalizeMetrics(value: unknown): AnnotationMetrics {
  const base = emptyMetrics();
  if (!value || typeof value !== 'object') return base;
  const source = value as Partial<AnnotationMetrics>;
  const number = (candidate: unknown, fallback: number) =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : fallback;
  return {
    activeMs: number(source.activeMs, 0),
    timeToFirstInputMs: typeof source.timeToFirstInputMs === 'number' ? source.timeToFirstInputMs : undefined,
    editCount: number(source.editCount, 0),
    charCount: number(source.charCount, 0),
    maxBurstChars: number(source.maxBurstChars, 0),
    burstCount: number(source.burstCount, 0),
    deletionCount: number(source.deletionCount, 0),
    firstInputAt: typeof source.firstInputAt === 'string' ? source.firstInputAt : undefined,
    lastInputAt: typeof source.lastInputAt === 'string' ? source.lastInputAt : undefined,
    validationCount: number(source.validationCount, 0),
  };
}

function normalizeProfile(value: unknown): Profile | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<Profile> & { createdAt?: string };
  if (!source.id || !source.username || !source.firstName || !source.lastName) return null;

  const startedAt = source.collectionStartedAt ?? source.createdAt ?? new Date().toISOString();
  // Les profils antérieurs à la v4 n'ont pas de code collecteur : on reprend le
  // nom d'utilisateur pour ne pas casser la continuité, en le marquant « libre ».
  const rawCode = source.collectorCode ?? source.username;
  const status = describeCollectorCode(rawCode);

  return {
    id: source.id,
    collectorCode: normalizeCollectorCode(rawCode),
    collectorCodeFormat: status.format,
    collectorCodeChecksumOk: status.checksumOk,
    targetLanguage: normalizeTargetLanguage(source.targetLanguage) ?? MIGRATION_DEFAULT_LANGUAGE,
    username: source.username,
    firstName: source.firstName,
    lastName: source.lastName,
    createdAt: source.createdAt ?? startedAt,
    collectionStartedAt: startedAt,
    lastTrustedAt: source.lastTrustedAt ?? startedAt,
  };
}

function normalizeTaskItem(value: unknown): TaskItem | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<TaskItem> & { instruction?: string; instructionEn?: string };
  if (!source.id) return null;
  const prompts: Partial<Record<TargetLanguage, string>> = {};
  Object.entries(source.prompts ?? {}).forEach(([key, prompt]) => {
    const language = normalizeTargetLanguage(key);
    if (language && typeof prompt === 'string' && prompt.trim()) prompts[language] = prompt;
  });
  return {
    id: source.id,
    prompts,
    // `instruction` est le champ des états v1 à v3.
    fallbackPrompt: source.fallbackPrompt ?? source.instruction,
    fallbackPromptEn: source.fallbackPromptEn ?? source.instructionEn,
    minWords: typeof source.minWords === 'number' && source.minWords > 0 ? source.minWords : 1,
    minWordsByLanguage: source.minWordsByLanguage,
    imageUri: source.imageUri,
    bundledImage: source.bundledImage,
    credit: source.credit,
    originPackId: source.originPackId,
    metadata: source.metadata,
  };
}

function normalizePack(value: unknown): TaskPack | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<TaskPack>;
  if (!source.id || !source.version) return null;
  const items = (Array.isArray(source.items) ? source.items : [])
    .map(normalizeTaskItem)
    .filter((item): item is TaskItem => item !== null);
  return {
    id: source.id,
    name: source.name ?? source.id,
    nameEn: source.nameEn,
    version: String(source.version),
    source: source.source ?? 'downloaded',
    downloadedAt: source.downloadedAt ?? new Date().toISOString(),
    targetItems: source.targetItems,
    targetLanguage: normalizeTargetLanguage(source.targetLanguage) ?? MIGRATION_DEFAULT_LANGUAGE,
    availableLanguages: Array.isArray(source.availableLanguages)
      ? source.availableLanguages
        .map(normalizeTargetLanguage)
        .filter((language): language is TargetLanguage => language !== null)
      : undefined,
    items,
  };
}

function normalizeAnnotation(value: unknown, fallbackLanguage: TargetLanguage): Annotation | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<Annotation>;
  if (!source.taskId || !source.packId || typeof source.text !== 'string') return null;
  return {
    taskId: source.taskId,
    packId: source.packId,
    sessionId: source.sessionId ?? 'session-inconnue',
    language: normalizeTargetLanguage(source.language) ?? fallbackLanguage,
    text: source.text,
    wordCount: typeof source.wordCount === 'number' ? source.wordCount : 0,
    status: source.status === 'validated' ? 'validated' : 'draft',
    updatedAt: source.updatedAt ?? new Date().toISOString(),
    validatedAt: source.validatedAt,
    metrics: normalizeMetrics(source.metrics),
  };
}

function normalizeAnnotations(
  value: unknown,
  languageOfPack: (packId: string) => TargetLanguage,
): Record<string, Annotation> {
  const result: Record<string, Annotation> = {};
  Object.entries((value ?? {}) as Record<string, unknown>).forEach(([key, candidate]) => {
    const packId = (candidate as Partial<Annotation>)?.packId ?? '';
    const annotation = normalizeAnnotation(candidate, languageOfPack(packId));
    if (annotation) result[key] = annotation;
  });
  return result;
}

function normalizeSessions(value: unknown, languageOfPack: (packId: string) => TargetLanguage): CollectionSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((candidate): CollectionSession | null => {
      const source = candidate as Partial<CollectionSession>;
      if (!source?.id || !source.profileId || !source.packId) return null;
      return {
        id: source.id,
        profileId: source.profileId,
        packId: source.packId,
        language: normalizeTargetLanguage(source.language) ?? languageOfPack(source.packId),
        startedAt: source.startedAt ?? new Date().toISOString(),
        lastActiveAt: source.lastActiveAt ?? source.startedAt ?? new Date().toISOString(),
        endedAt: source.endedAt,
        status: source.status ?? 'paused',
        currentIndex: typeof source.currentIndex === 'number' ? source.currentIndex : 0,
        annotationIds: Array.isArray(source.annotationIds) ? source.annotationIds : [],
      };
    })
    .filter((session): session is CollectionSession => session !== null);
}

function normalizePackRecord(value: unknown): PackRecord | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<PackRecord>;
  if (!source.id || !source.version) return null;
  const now = new Date().toISOString();
  return {
    id: source.id,
    name: source.name ?? source.id,
    version: String(source.version),
    source: source.source ?? 'downloaded',
    targetItems: typeof source.targetItems === 'number' ? source.targetItems : 0,
    targetLanguage: normalizeTargetLanguage(source.targetLanguage) ?? MIGRATION_DEFAULT_LANGUAGE,
    availableLanguages: source.availableLanguages,
    firstSeenAt: source.firstSeenAt ?? now,
    lastActiveAt: source.lastActiveAt ?? now,
    items: Array.isArray(source.items) ? source.items : [],
  };
}

function normalizeWorkspace(
  value: unknown,
  languageOfPack: (packId: string) => TargetLanguage,
): ProfileWorkspace | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ProfileWorkspace>;
  const profile = normalizeProfile(source.profile);
  if (!profile) return null;
  return {
    profile,
    annotations: normalizeAnnotations(source.annotations, languageOfPack),
    sessions: normalizeSessions(source.sessions, languageOfPack),
    activeSessionId: source.activeSessionId ?? null,
    updatedAt: source.updatedAt ?? profile.lastTrustedAt,
  };
}

function normalizeAbandoned(
  value: unknown,
  languageOfPack: (packId: string) => TargetLanguage,
): AbandonedCollection | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<AbandonedCollection>;
  const profile = normalizeProfile(source.profile);
  if (!profile || !source.id || !source.abandonedAt || !source.pack?.id || !source.pack.version) return null;
  const language = normalizeTargetLanguage(source.pack.targetLanguage) ?? profile.targetLanguage;
  return {
    id: source.id,
    abandonedAt: source.abandonedAt,
    profile,
    pack: {
      id: source.pack.id,
      name: source.pack.name ?? source.pack.id,
      version: String(source.pack.version),
      targetItems: source.pack.targetItems ?? 0,
      targetLanguage: language,
    },
    sessions: normalizeSessions(source.sessions, () => language),
    annotations: (Array.isArray(source.annotations) ? source.annotations : [])
      .map((candidate) => normalizeAnnotation(candidate, language))
      .filter((annotation): annotation is Annotation => annotation !== null),
    items: Array.isArray(source.items) ? source.items : [],
  };
}

export function normalizeState(raw: string): AppState | null {
  const parsed = JSON.parse(raw) as StoredState;
  if (![1, 2, 3, 4].includes(parsed.schemaVersion ?? 0)) return null;

  const pack = normalizePack(parsed.pack) ?? samplePack;

  const packRegistry: Record<string, PackRecord> = {};
  Object.values(parsed.packRegistry ?? {}).forEach((candidate) => {
    const record = normalizePackRecord(candidate);
    if (record) packRegistry[record.id] = record;
  });
  if (!packRegistry[samplePack.id]) packRegistry[samplePack.id] = packRecordFrom(samplePack);
  if (!packRegistry[pack.id]) packRegistry[pack.id] = packRecordFrom(pack);

  const languageOfPack = (packId: string): TargetLanguage =>
    packRegistry[packId]?.targetLanguage
    ?? normalizeTargetLanguage(parsed.profile?.targetLanguage)
    ?? MIGRATION_DEFAULT_LANGUAGE;

  const profile = normalizeProfile(parsed.profile);

  const profileWorkspaces: Record<string, ProfileWorkspace> = {};
  Object.values(parsed.profileWorkspaces ?? {}).forEach((candidate) => {
    const workspace = normalizeWorkspace(candidate, languageOfPack);
    if (workspace) profileWorkspaces[workspace.profile.id] = workspace;
  });

  const activeAnnotations = profile ? normalizeAnnotations(parsed.annotations, languageOfPack) : {};
  const activeSessions = profile ? normalizeSessions(parsed.sessions, languageOfPack) : [];
  const activeSessionId = profile ? parsed.activeSessionId ?? null : null;
  if (profile) {
    profileWorkspaces[profile.id] = {
      profile,
      annotations: activeAnnotations,
      sessions: activeSessions,
      activeSessionId,
      updatedAt: profile.lastTrustedAt,
    };
  }

  const collectionClocks = { ...(parsed.collectionClocks ?? {}) };
  if (profile) {
    collectionClocks[profile.id] = {
      collectionStartedAt: profile.collectionStartedAt,
      lastTrustedAt: profile.lastTrustedAt,
    };
  }

  const assignment = parsed.assignment
    ? {
        ...parsed.assignment,
        // Un téléchargement « en cours » au moment de la fermeture ne l'est plus.
        status: parsed.assignment.status === 'downloading' ? 'paused' as const : parsed.assignment.status,
      }
    : null;

  const abandonedCollections = (parsed.abandonedCollections ?? [])
    .map((candidate) => normalizeAbandoned(candidate, languageOfPack))
    .filter((collection): collection is AbandonedCollection => collection !== null);

  return {
    schemaVersion: 4,
    installationId: parsed.installationId ?? createInstallationId(),
    onboardingCompleted: parsed.onboardingCompleted ?? initialState.onboardingCompleted,
    profile,
    collectionClocks,
    profileWorkspaces,
    packRegistry,
    abandonedCollections,
    preferences: { ...initialState.preferences, ...parsed.preferences },
    // Le lot de démonstration est toujours relu depuis le bundle : son image est
    // une ressource, pas une donnée persistée.
    pack: pack.id === samplePack.id ? { ...samplePack, targetLanguage: pack.targetLanguage } : pack,
    assignment,
    annotations: activeAnnotations,
    sessions: activeSessions,
    activeSessionId,
  };
}
