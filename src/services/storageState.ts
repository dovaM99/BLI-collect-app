import { initialState, samplePack } from '../data/samplePack';
import type {
  AbandonedCollection,
  Annotation,
  AppState,
  CollectionSession,
  Profile,
  ProfileWorkspace,
} from '../types';

export const STORAGE_KEY = '@bli-collect/state/v3';
export const PREVIOUS_STORAGE_KEY = '@bli-collect/state/v2';
export const LEGACY_STORAGE_KEY = '@bli-collect/state/v1';

type StoredState = {
  schemaVersion?: number;
  onboardingCompleted?: boolean;
  profile?: Partial<Profile> | null;
  collectionClocks?: AppState['collectionClocks'];
  profileWorkspaces?: Record<string, Partial<ProfileWorkspace>>;
  abandonedCollections?: Array<Partial<AbandonedCollection>>;
  preferences?: Partial<AppState['preferences']>;
  pack?: AppState['pack'];
  assignment?: AppState['assignment'];
  annotations?: Record<string, Annotation>;
  sessions?: CollectionSession[];
  activeSessionId?: string | null;
};

function normalizeProfile(value: Partial<Profile> | null | undefined): Profile | null {
  if (!value?.id || !value.username || !value.firstName || !value.lastName) return null;
  const startedAt = value.collectionStartedAt ?? value.createdAt ?? new Date().toISOString();
  return {
    id: value.id,
    username: value.username,
    firstName: value.firstName,
    lastName: value.lastName,
    createdAt: value.createdAt ?? startedAt,
    collectionStartedAt: startedAt,
    lastTrustedAt: value.lastTrustedAt ?? startedAt,
  };
}

function normalizeWorkspace(value: Partial<ProfileWorkspace>): ProfileWorkspace | null {
  const profile = normalizeProfile(value.profile);
  if (!profile) return null;
  return {
    profile,
    annotations: value.annotations ?? {},
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    activeSessionId: value.activeSessionId ?? null,
    updatedAt: value.updatedAt ?? profile.lastTrustedAt,
  };
}

function normalizeAbandonedCollection(value: Partial<AbandonedCollection>): AbandonedCollection | null {
  const profile = normalizeProfile(value.profile);
  if (!profile || !value.id || !value.abandonedAt || !value.pack?.id || !value.pack.version) return null;
  return {
    id: value.id,
    abandonedAt: value.abandonedAt,
    profile,
    pack: {
      id: value.pack.id,
      name: value.pack.name ?? value.pack.id,
      version: value.pack.version,
      targetItems: value.pack.targetItems ?? 0,
    },
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    annotations: Array.isArray(value.annotations) ? value.annotations : [],
    items: Array.isArray(value.items) ? value.items : [],
  };
}

export function normalizeState(raw: string): AppState | null {
  const parsed = JSON.parse(raw) as StoredState;
  if (![1, 2, 3].includes(parsed.schemaVersion ?? 0)) return null;

  const profile = normalizeProfile(parsed.profile);
  const collectionClocks = { ...(parsed.collectionClocks ?? {}) };
  if (profile) {
    collectionClocks[profile.id] = {
      collectionStartedAt: profile.collectionStartedAt,
      lastTrustedAt: profile.lastTrustedAt,
    };
  }

  const profileWorkspaces: Record<string, ProfileWorkspace> = {};
  Object.values(parsed.profileWorkspaces ?? {}).forEach((candidate) => {
    const workspace = normalizeWorkspace(candidate);
    if (workspace) profileWorkspaces[workspace.profile.id] = workspace;
  });

  const activeAnnotations = profile ? parsed.annotations ?? {} : {};
  const activeSessions = profile && Array.isArray(parsed.sessions) ? parsed.sessions : [];
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

  const assignment = parsed.assignment
    ? {
        ...parsed.assignment,
        status: parsed.assignment.status === 'downloading' ? 'paused' as const : parsed.assignment.status,
      }
    : null;

  const abandonedCollections = (parsed.abandonedCollections ?? [])
    .map(normalizeAbandonedCollection)
    .filter((collection): collection is AbandonedCollection => collection !== null);

  return {
    schemaVersion: 3,
    onboardingCompleted: parsed.onboardingCompleted ?? initialState.onboardingCompleted,
    profile,
    collectionClocks,
    profileWorkspaces,
    abandonedCollections,
    preferences: { ...initialState.preferences, ...parsed.preferences },
    pack: parsed.pack?.id === samplePack.id ? samplePack : parsed.pack ?? samplePack,
    assignment,
    annotations: activeAnnotations,
    sessions: activeSessions,
    activeSessionId,
  };
}
