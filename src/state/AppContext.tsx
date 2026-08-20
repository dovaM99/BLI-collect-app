import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { initialState, samplePack } from '../data/samplePack';
import { translate } from '../i18n';
import { loadState, saveState } from '../services/storage';
import { getTheme } from '../theme';
import type {
  Annotation,
  AssignmentDownload,
  AppState,
  CollectionSession,
  Language,
  Profile,
  TaskPack,
  ThemeMode,
} from '../types';

type LoginInput = Pick<Profile, 'username' | 'firstName' | 'lastName'>;

type AppContextValue = {
  hydrated: boolean;
  state: AppState;
  theme: ReturnType<typeof getTheme>;
  t: (key: string, values?: Record<string, string | number>) => string;
  completeOnboarding: () => void;
  login: (input: LoginInput) => void;
  logout: () => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  ensureSession: () => CollectionSession | null;
  pauseSession: () => void;
  abandonCollection: () => AppState;
  setCurrentIndex: (index: number) => void;
  updateDraft: (taskId: string, text: string) => void;
  validateAnnotation: (taskId: string, text: string) => { complete: boolean };
  replacePack: (pack: TaskPack) => void;
  updateAssignment: (assignment: AssignmentDownload) => void;
  applyAssignmentPack: (pack: TaskPack, assignment: AssignmentDownload) => void;
  useSamplePack: () => void;
  snapshot: () => AppState;
};

const AppContext = createContext<AppContextValue | null>(null);

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

function annotationKey(packId: string, taskId: string) {
  return `${packId}:${taskId}`;
}

function normalizeIdentityPart(value: string) {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function identityKey(input: LoginInput) {
  return [input.username, input.lastName, input.firstName].map(normalizeIdentityPart).join('|');
}

function profileIdFrom(input: LoginInput) {
  const segment = (value: string) => normalizeIdentityPart(value)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profil';
  return `annotator-${segment(input.username)}-${segment(input.lastName)}-${segment(input.firstName)}`;
}

function syncActiveWorkspace(state: AppState) {
  const normalized: AppState = {
    ...state,
    schemaVersion: 3,
    profileWorkspaces: state.profileWorkspaces ?? {},
    abandonedCollections: state.abandonedCollections ?? [],
  };
  if (!normalized.profile) return normalized;
  return {
    ...normalized,
    profileWorkspaces: {
      ...normalized.profileWorkspaces,
      [normalized.profile.id]: {
        profile: normalized.profile,
        annotations: normalized.annotations,
        sessions: normalized.sessions,
        activeSessionId: normalized.activeSessionId,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

function withTrustedClock(state: AppState) {
  if (!state.profile) return state;
  const now = new Date().toISOString();
  const previous = state.collectionClocks[state.profile.id];
  const lastTrustedAt = previous?.lastTrustedAt && previous.lastTrustedAt > now
    ? previous.lastTrustedAt
    : now;
  const collectionStartedAt = previous?.collectionStartedAt ?? state.profile.collectionStartedAt;
  return {
    ...state,
    profile: { ...state.profile, collectionStartedAt, lastTrustedAt },
    collectionClocks: {
      ...state.collectionClocks,
      [state.profile.id]: { collectionStartedAt, lastTrustedAt },
    },
  };
}

function createSession(state: AppState): CollectionSession | null {
  if (!state.profile) return null;
  const now = new Date().toISOString();
  return {
    id: makeId('session'),
    profileId: state.profile.id,
    packId: state.pack.id,
    startedAt: now,
    lastActiveAt: now,
    status: 'active',
    currentIndex: 0,
    annotationIds: [],
  };
}

export function AppProvider({ children }: React.PropsWithChildren) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadState().then((storedState) => {
      const stored = syncActiveWorkspace(withTrustedClock(storedState));
      stateRef.current = stored;
      setState(stored);
      void saveState(stored);
      setHydrated(true);
    });
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void saveState(stateRef.current);
    };
  }, []);

  const commit = useCallback((updater: (current: AppState) => AppState, saveDelay = 0) => {
    const current = syncActiveWorkspace(stateRef.current);
    const next = syncActiveWorkspace(withTrustedClock(updater(current)));
    stateRef.current = next;
    setState(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveDelay > 0) {
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void saveState(stateRef.current);
      }, saveDelay);
    } else {
      saveTimerRef.current = null;
      void saveState(next);
    }
    return next;
  }, []);

  const completeOnboarding = useCallback(() => {
    commit((current) => ({ ...current, onboardingCompleted: true }));
  }, [commit]);

  const login = useCallback((input: LoginInput) => {
    commit((current) => {
      const now = new Date().toISOString();
      const key = identityKey(input);
      const storedWorkspace = Object.values(current.profileWorkspaces ?? {})
        .find((workspace) => identityKey(workspace.profile) === key);
      const archivedProfile = (current.abandonedCollections ?? [])
        .find((collection) => identityKey(collection.profile) === key)?.profile;
      const knownProfile = storedWorkspace?.profile ?? archivedProfile;
      const profileId = knownProfile?.id ?? profileIdFrom(input);
      const previousClock = current.collectionClocks[profileId];
      const collectionStartedAt = previousClock?.collectionStartedAt
        ?? knownProfile?.collectionStartedAt
        ?? now;
      const lastTrustedAt = previousClock?.lastTrustedAt && previousClock.lastTrustedAt > now
        ? previousClock.lastTrustedAt
        : now;
      const profile: Profile = {
        id: profileId,
        username: input.username.trim(),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        createdAt: knownProfile?.createdAt ?? collectionStartedAt,
        collectionStartedAt,
        lastTrustedAt,
      };
      const restoredSessions = (storedWorkspace?.sessions ?? []).map((session) =>
        session.status === 'active'
          ? { ...session, status: 'paused' as const, lastActiveAt: now }
          : session,
      );
      return {
        ...current,
        profile,
        collectionClocks: {
          ...current.collectionClocks,
          [profileId]: { collectionStartedAt, lastTrustedAt },
        },
        annotations: storedWorkspace?.annotations ?? {},
        sessions: restoredSessions,
        activeSessionId: null,
      };
    });
  }, [commit]);

  const pauseSession = useCallback(() => {
    commit((current) => {
      if (!current.activeSessionId) return current;
      const now = new Date().toISOString();
      return {
        ...current,
        sessions: current.sessions.map((session) =>
          session.id === current.activeSessionId
            ? { ...session, status: 'paused' as const, lastActiveAt: now }
            : session,
        ),
        activeSessionId: null,
      };
    });
  }, [commit]);

  const abandonCollection = useCallback(() => commit((current) => {
      if (!current.profile) return current;
      const now = new Date().toISOString();
      const collectionSessions = current.sessions
        .filter((session) => session.packId === current.pack.id)
        .map((session) => session.status === 'completed'
          ? session
          : { ...session, status: 'abandoned' as const, lastActiveAt: now, endedAt: now });
      const collectionAnnotations = Object.values(current.annotations)
        .filter((annotation) => annotation.packId === current.pack.id);
      const remainingAnnotations = Object.fromEntries(
        Object.entries(current.annotations).filter(([, annotation]) => annotation.packId !== current.pack.id),
      );
      const remainingSessions = current.sessions.filter((session) => session.packId !== current.pack.id);
      const archive = collectionSessions.length || collectionAnnotations.length
        ? {
            id: makeId('abandoned'),
            abandonedAt: now,
            profile: current.profile,
            pack: {
              id: current.pack.id,
              name: current.pack.name,
              version: current.pack.version,
              targetItems: current.pack.items.length,
            },
            sessions: collectionSessions,
            annotations: collectionAnnotations,
            items: current.pack.items.map((item) => ({
              id: item.id,
              originPackId: item.originPackId,
              metadata: item.metadata,
            })),
          }
        : null;
      const workspaceProfile = { ...current.profile, lastTrustedAt: now };
      return {
        ...current,
        profile: null,
        collectionClocks: {
          ...current.collectionClocks,
          [workspaceProfile.id]: {
            collectionStartedAt: workspaceProfile.collectionStartedAt,
            lastTrustedAt: now,
          },
        },
        profileWorkspaces: {
          ...current.profileWorkspaces,
          [workspaceProfile.id]: {
            profile: workspaceProfile,
            annotations: remainingAnnotations,
            sessions: remainingSessions,
            activeSessionId: null,
            updatedAt: now,
          },
        },
        abandonedCollections: archive
          ? [...(current.abandonedCollections ?? []), archive]
          : current.abandonedCollections ?? [],
        annotations: {},
        sessions: [],
        activeSessionId: null,
      };
    }), [commit]);

  const logout = useCallback(() => {
    commit((current) => {
      if (!current.profile) return current;
      const now = new Date().toISOString();
      const profile = {
        ...current.profile,
        lastTrustedAt: current.profile.lastTrustedAt > now ? current.profile.lastTrustedAt : now,
      };
      const sessions = current.sessions.map((session) =>
        session.id === current.activeSessionId
          ? { ...session, status: 'paused' as const, lastActiveAt: now }
          : session,
      );
      return {
        ...current,
        profile: null,
        collectionClocks: {
          ...current.collectionClocks,
          [profile.id]: {
            collectionStartedAt: profile.collectionStartedAt,
            lastTrustedAt: profile.lastTrustedAt,
          },
        },
        profileWorkspaces: {
          ...current.profileWorkspaces,
          [profile.id]: {
            profile,
            annotations: current.annotations,
            sessions,
            activeSessionId: null,
            updatedAt: now,
          },
        },
        annotations: {},
        sessions: [],
        activeSessionId: null,
      };
    });
  }, [commit]);

  const setLanguage = useCallback((language: Language) => {
    commit((current) => ({ ...current, preferences: { ...current.preferences, language } }));
  }, [commit]);

  const setThemeMode = useCallback((theme: ThemeMode) => {
    commit((current) => ({ ...current, preferences: { ...current.preferences, theme } }));
  }, [commit]);

  const ensureSession = useCallback(() => {
    let resolved: CollectionSession | null = null;
    commit((current) => {
      const existing = current.sessions.find(
        (session) => session.id === current.activeSessionId && session.packId === current.pack.id,
      );
      if (existing) {
        resolved = existing;
        return current;
      }

      const session = createSession(current);
      if (!session) return current;
      resolved = session;
      return {
        ...current,
        sessions: [...current.sessions, session],
        activeSessionId: session.id,
      };
    });
    return resolved;
  }, [commit]);

  const setCurrentIndex = useCallback((index: number) => {
    commit((current) => {
      if (!current.activeSessionId) return current;
      const safeIndex = Math.max(0, Math.min(index, current.pack.items.length - 1));
      return {
        ...current,
        sessions: current.sessions.map((session) =>
          session.id === current.activeSessionId
            ? { ...session, currentIndex: safeIndex, lastActiveAt: new Date().toISOString() }
            : session,
        ),
      };
    });
  }, [commit]);

  const updateDraft = useCallback((taskId: string, text: string) => {
    commit((currentState) => {
      let current = currentState;
      let sessionId = current.activeSessionId;
      if (!sessionId) {
        const session = createSession(current);
        if (!session) return current;
        sessionId = session.id;
        current = { ...current, sessions: [...current.sessions, session], activeSessionId: session.id };
      }

      const key = annotationKey(current.pack.id, taskId);
      const existing = current.annotations[key];
      if (existing?.text === text && existing.status === 'draft') return current;
      const now = new Date().toISOString();
      const annotation: Annotation = {
        taskId,
        packId: current.pack.id,
        sessionId,
        text,
        wordCount: countWords(text),
        status: 'draft',
        updatedAt: now,
      };
      return {
        ...current,
        annotations: { ...current.annotations, [key]: annotation },
        sessions: current.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                lastActiveAt: now,
                annotationIds: session.annotationIds.includes(key)
                  ? session.annotationIds
                  : [...session.annotationIds, key],
              }
            : session,
        ),
      };
    }, 450);
  }, [commit]);

  const validateAnnotation = useCallback((taskId: string, text: string) => {
    let complete = false;
    commit((currentState) => {
      let current = currentState;
      let sessionId = current.activeSessionId;
      if (!sessionId) {
        const session = createSession(current);
        if (!session) return current;
        sessionId = session.id;
        current = { ...current, sessions: [...current.sessions, session], activeSessionId: session.id };
      }

      const now = new Date().toISOString();
      const key = annotationKey(current.pack.id, taskId);
      const annotation: Annotation = {
        taskId,
        packId: current.pack.id,
        sessionId,
        text: text.trim(),
        wordCount: countWords(text),
        status: 'validated',
        updatedAt: now,
        validatedAt: now,
      };
      const annotations = { ...current.annotations, [key]: annotation };
      const allDownloadedItemsValidated = current.pack.items.every(
        (item) => annotations[annotationKey(current.pack.id, item.id)]?.status === 'validated',
      );
      const assignmentFullyInstalled = !current.assignment
        || current.assignment.status === 'ready';
      complete = assignmentFullyInstalled && allDownloadedItemsValidated;

      return {
        ...current,
        annotations,
        sessions: current.sessions.map((session) => {
          if (session.id !== sessionId) return session;
          return {
            ...session,
            lastActiveAt: now,
            endedAt: complete ? now : session.endedAt,
            status: complete ? 'completed' as const : 'active' as const,
            annotationIds: session.annotationIds.includes(key)
              ? session.annotationIds
              : [...session.annotationIds, key],
          };
        }),
        activeSessionId: complete ? null : sessionId,
      };
    });
    return { complete };
  }, [commit]);

  const replacePack = useCallback((pack: TaskPack) => {
    commit((current) => ({
      ...current,
      pack,
      assignment: null,
      sessions: current.sessions.map((session) =>
        session.id === current.activeSessionId
          ? { ...session, status: 'paused' as const, lastActiveAt: new Date().toISOString() }
          : session,
      ),
      activeSessionId: null,
    }));
  }, [commit]);

  const updateAssignment = useCallback((assignment: AssignmentDownload) => {
    commit((current) => {
      if (current.pack.id === assignment.id || assignment.installedPackIds.length > 0) {
        return { ...current, assignment };
      }
      const now = new Date().toISOString();
      return {
        ...current,
        assignment,
        pack: {
          id: assignment.id,
          name: `Affectation ${assignment.id}`,
          nameEn: `Assignment ${assignment.id}`,
          version: assignment.version,
          source: 'downloaded',
          downloadedAt: now,
          targetItems: assignment.targetItems,
          items: [],
        },
        sessions: current.sessions.map((session) =>
          session.id === current.activeSessionId
            ? { ...session, status: 'paused' as const, lastActiveAt: now }
            : session,
        ),
        activeSessionId: null,
      };
    }, assignment.status === 'downloading' ? 700 : 0);
  }, [commit]);

  const applyAssignmentPack = useCallback((pack: TaskPack, assignment: AssignmentDownload) => {
    commit((current) => {
      const sameAssignment = current.pack.id === pack.id;
      if (!sameAssignment) {
        const now = new Date().toISOString();
        return {
          ...current,
          pack,
          assignment,
          sessions: current.sessions.map((session) =>
            session.id === current.activeSessionId
              ? { ...session, status: 'paused' as const, lastActiveAt: now }
              : session,
          ),
          activeSessionId: null,
        };
      }

      const activeSession = current.sessions.find((session) => session.id === current.activeSessionId);
      const activeTaskId = activeSession ? current.pack.items[activeSession.currentIndex]?.id : undefined;
      const mappedIndex = activeTaskId ? pack.items.findIndex((item) => item.id === activeTaskId) : -1;
      return {
        ...current,
        pack,
        assignment,
        sessions: current.sessions.map((session) => {
          if (session.id !== current.activeSessionId || session.packId !== pack.id) return session;
          return {
            ...session,
            currentIndex: mappedIndex >= 0
              ? mappedIndex
              : Math.max(0, Math.min(session.currentIndex, pack.items.length - 1)),
          };
        }),
      };
    });
  }, [commit]);

  const useSamplePack = useCallback(() => replacePack(samplePack), [replacePack]);

  const value = useMemo<AppContextValue>(() => ({
    hydrated,
    state,
    theme: getTheme(state.preferences.theme),
    t: (key, values) => translate(state.preferences.language, key, values),
    completeOnboarding,
    login,
    logout,
    setLanguage,
    setTheme: setThemeMode,
    ensureSession,
    pauseSession,
    abandonCollection,
    setCurrentIndex,
    updateDraft,
    validateAnnotation,
    replacePack,
    updateAssignment,
    applyAssignmentPack,
    useSamplePack,
    snapshot: () => stateRef.current,
  }), [
    hydrated,
    state,
    completeOnboarding,
    login,
    logout,
    setLanguage,
    setThemeMode,
    ensureSession,
    pauseSession,
    abandonCollection,
    setCurrentIndex,
    updateDraft,
    validateAnnotation,
    replacePack,
    updateAssignment,
    applyAssignmentPack,
    useSamplePack,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
