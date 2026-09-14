import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as ReactNativeAppState } from 'react-native';

import { initialState, packRecordFrom } from '../data/samplePack';
import { betaPack } from '../data/betaPack';
import { translate } from '../i18n';
import { loadState, saveState } from '../services/storage';
import { emptyMetrics } from '../services/storageState';
import { useAuth } from '../auth/AuthContext';
import { offlineAuth } from '../auth/runtime';
import { getTheme } from '../theme';
import { annotationKey } from '../utils/annotationKey';
import { describeCollectorCode, normalizeCollectorCode } from '../utils/collectorCode';
import type {
  Annotation,
  AnnotationMetrics,
  AssignmentDownload,
  AppState,
  CollectionSession,
  Language,
  PackRecord,
  Profile,
  TargetLanguage,
  TaskPack,
  ThemeMode,
} from '../types';

/** Au-delà de ce silence, on considère que la personne n'écrit plus. */
const ACTIVE_TYPING_GAP_MS = 10_000;
/** Ajout de caractères en un seul événement au-delà duquel on parle de collage. */
const BURST_THRESHOLD_CHARS = 20;

export type LoginInput = {
  collectorCode: string;
  username: string;
  firstName: string;
  lastName: string;
  targetLanguage: TargetLanguage;
};

type AppContextValue = {
  hydrated: boolean;
  authenticated: boolean;
  state: AppState;
  theme: ReturnType<typeof getTheme>;
  t: (key: string, values?: Record<string, string | number>) => string;
  completeOnboarding: () => void;
  logout: () => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  ensureSession: () => CollectionSession | null;
  pauseSession: () => void;
  abandonCollection: () => AppState;
  setCurrentIndex: (index: number) => void;
  noteItemShown: (taskId: string) => void;
  updateDraft: (taskId: string, text: string) => void;
  validateAnnotation: (taskId: string, text: string) => { complete: boolean };
  replacePack: (pack: TaskPack) => void;
  updateAssignment: (assignment: AssignmentDownload) => void;
  applyAssignmentPack: (pack: TaskPack, assignment: AssignmentDownload) => void;
  useBundledPack: () => void;
  snapshot: () => AppState;
};

const AppContext = createContext<AppContextValue | null>(null);

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

/**
 * L'identité repose désormais sur le code collecteur émis par BLI, et non plus
 * sur le triplet nom/prénom/pseudo : deux homonymes ne partagent plus le même
 * espace de travail, et une faute de frappe dans le nom ne crée plus un profil
 * fantôme qui « perd » la progression.
 */
function identityKey(input: Pick<LoginInput, 'collectorCode'>) {
  return normalizeCollectorCode(input.collectorCode);
}

function profileIdFrom(input: Pick<LoginInput, 'collectorCode'>) {
  const code = normalizeCollectorCode(input.collectorCode).toLowerCase() || 'inconnu';
  return `annotator-${code}`;
}

function registerPack(
  registry: Record<string, PackRecord>,
  pack: TaskPack,
  now: string,
): Record<string, PackRecord> {
  const existing = registry[pack.id];
  // Le registre est reconstruit uniquement quand le lot change réellement :
  // recopier des milliers d'items à chaque frappe coûterait bien plus cher que
  // ce que le registre fait gagner.
  if (
    existing
    && existing.version === pack.version
    && existing.targetLanguage === pack.targetLanguage
    && existing.items.length === pack.items.length
  ) {
    return registry;
  }
  const record = packRecordFrom(pack, now);
  return {
    ...registry,
    [pack.id]: existing ? { ...record, firstSeenAt: existing.firstSeenAt } : record,
  };
}

function syncActiveWorkspace(state: AppState) {
  const normalized: AppState = {
    ...state,
    schemaVersion: 4,
    profileWorkspaces: state.profileWorkspaces ?? {},
    packRegistry: registerPack(state.packRegistry ?? {}, state.pack, new Date().toISOString()),
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
    language: state.pack.targetLanguage,
    startedAt: now,
    lastActiveAt: now,
    status: 'active',
    currentIndex: 0,
    annotationIds: [],
  };
}

/**
 * Met à jour les signaux de saisie à partir de l'écart entre l'ancien et le
 * nouveau texte. Tout est calculé ici, dans le réducteur : aucun écran n'a à
 * instrumenter son champ de texte.
 */
function nextMetrics(
  previous: AnnotationMetrics | undefined,
  previousText: string,
  text: string,
  shownAt: number | undefined,
  now: number,
): AnnotationMetrics {
  const base = previous ?? emptyMetrics();
  const lastInputMs = base.lastInputAt ? Date.parse(base.lastInputAt) : Number.NaN;
  const gap = Number.isFinite(lastInputMs) ? now - lastInputMs : Number.POSITIVE_INFINITY;
  const delta = text.length - previousText.length;
  const nowIso = new Date(now).toISOString();

  return {
    activeMs: base.activeMs + (gap > 0 && gap <= ACTIVE_TYPING_GAP_MS ? gap : 0),
    timeToFirstInputMs: base.timeToFirstInputMs
      ?? (base.firstInputAt || shownAt === undefined ? base.timeToFirstInputMs : Math.max(0, now - shownAt)),
    editCount: base.editCount + 1,
    charCount: text.length,
    maxBurstChars: Math.max(base.maxBurstChars, delta > 0 ? delta : 0),
    burstCount: base.burstCount + (delta >= BURST_THRESHOLD_CHARS ? 1 : 0),
    deletionCount: base.deletionCount + (delta < 0 ? 1 : 0),
    firstInputAt: base.firstInputAt ?? nowIso,
    lastInputAt: nowIso,
    validationCount: base.validationCount,
  };
}

export function AppProvider({ children }: React.PropsWithChildren) {
  const auth = useAuth();
  const [boundAuthEpoch, setBoundAuthEpoch] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Horodatage d'affichage de chaque image, en mémoire seulement : sert à mesurer
  // le délai avant la première frappe.
  const shownAtRef = useRef<Map<string, number>>(new Map());

  const flush = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void saveState(stateRef.current);
  }, []);

  useEffect(() => {
    loadState().then((storedState) => {
      const stored = syncActiveWorkspace(withTrustedClock(storedState));
      stateRef.current = stored;
      setState(stored);
      void saveState(stored);
      setHydrated(true);
    });
    return () => {
      flush();
    };
  }, [flush]);

  // Android peut tuer l'application sans préavis (mémoire, batterie, délestage).
  // On force l'écriture dès que l'app passe en arrière-plan.
  useEffect(() => {
    const subscription = ReactNativeAppState.addEventListener('change', (status) => {
      if (status !== 'active') flush();
    });
    return () => subscription.remove();
  }, [flush]);

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
    offlineAuth.requireSession(input.collectorCode, input.targetLanguage);
    commit((current) => {
      const now = new Date().toISOString();
      const key = identityKey(input);
      const storedWorkspace = Object.values(current.profileWorkspaces ?? {})
        .find((workspace) => identityKey(workspace.profile) === key);
      const archivedProfile = (current.abandonedCollections ?? [])
        .find((collection) => identityKey(collection.profile) === key)?.profile;
      const knownProfile = storedWorkspace?.profile ?? archivedProfile;
      // Un profil déjà connu conserve son identifiant : on ne casse jamais le
      // rattachement d'un travail déjà produit.
      const profileId = knownProfile?.id ?? profileIdFrom(input);
      const previousClock = current.collectionClocks[profileId];
      const collectionStartedAt = previousClock?.collectionStartedAt
        ?? knownProfile?.collectionStartedAt
        ?? now;
      const lastTrustedAt = previousClock?.lastTrustedAt && previousClock.lastTrustedAt > now
        ? previousClock.lastTrustedAt
        : now;
      const status = describeCollectorCode(input.collectorCode);
      const profile: Profile = {
        id: profileId,
        collectorCode: status.normalized,
        collectorCodeFormat: status.format,
        collectorCodeChecksumOk: status.checksumOk,
        targetLanguage: input.targetLanguage,
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
      // Le lot embarqué suit la langue du collecteur ; un lot téléchargé
      // garde la langue avec laquelle il a été installé.
      const pack = current.pack.source === 'bundled'
        ? { ...current.pack, targetLanguage: input.targetLanguage }
        : current.pack.targetLanguage === input.targetLanguage ? current.pack : { ...betaPack, targetLanguage: input.targetLanguage };
      return {
        ...current,
        profile,
        pack,
        assignment: pack === current.pack || current.pack.source === 'bundled' ? current.assignment : null,
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

  useEffect(() => {
    if (!hydrated || !auth.session) return;
    const { language, ...identity } = auth.session.payload.identity;
    login({ ...identity, targetLanguage: language });
    setBoundAuthEpoch(auth.sessionEpoch);
  }, [hydrated, auth.session, auth.sessionEpoch, login]);

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
              targetLanguage: current.pack.targetLanguage,
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
    auth.lock();
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
  }, [commit, auth.lock]);

  const setLanguage = useCallback((language: Language) => {
    commit((current) => ({ ...current, preferences: { ...current.preferences, language } }));
  }, [commit]);

  const setThemeMode = useCallback((theme: ThemeMode) => {
    commit((current) => ({ ...current, preferences: { ...current.preferences, theme } }));
  }, [commit]);

  const ensureSession = useCallback(() => {
    offlineAuth.requireSession(stateRef.current.profile?.collectorCode, stateRef.current.pack.targetLanguage);
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

  const noteItemShown = useCallback((taskId: string) => {
    // Ecrase a chaque affichage. Conserver le tout premier faisait mesurer le
    // temps ecoule depuis l'ouverture initiale de l'app, pas depuis la
    // presentation qui a reellement precede la frappe.
    const current = stateRef.current;
    shownAtRef.current.set(
      annotationKey(current.pack.id, current.pack.targetLanguage, taskId),
      Date.now(),
    );
  }, []);

  const updateDraft = useCallback((taskId: string, text: string) => {
    const authorization = offlineAuth.requireSession(stateRef.current.profile?.collectorCode, stateRef.current.pack.targetLanguage);
    commit((currentState) => {
      let current = currentState;
      let sessionId = current.activeSessionId;
      if (!sessionId) {
        const session = createSession(current);
        if (!session) return current;
        sessionId = session.id;
        current = { ...current, sessions: [...current.sessions, session], activeSessionId: session.id };
      }

      const key = annotationKey(current.pack.id, current.pack.targetLanguage, taskId);
      const existing = current.annotations[key];
      if (existing?.text === text && existing.status === 'draft') return current;
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const annotation: Annotation = {
        authorizationId: existing ? existing.authorizationId : authorization.payload.authorizationId,
        taskId,
        packId: current.pack.id,
        sessionId,
        language: current.pack.targetLanguage,
        text,
        wordCount: countWords(text),
        status: 'draft',
        updatedAt: now,
        metrics: nextMetrics(
          existing?.metrics,
          existing?.text ?? '',
          text,
          shownAtRef.current.get(key),
          nowMs,
        ),
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
    const authorization = offlineAuth.requireSession(stateRef.current.profile?.collectorCode, stateRef.current.pack.targetLanguage);
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
      const key = annotationKey(current.pack.id, current.pack.targetLanguage, taskId);
      const existing = current.annotations[key];
      const trimmed = text.trim();
      const previousMetrics = existing?.metrics ?? emptyMetrics();
      const annotation: Annotation = {
        authorizationId: existing ? existing.authorizationId : authorization.payload.authorizationId,
        taskId,
        packId: current.pack.id,
        sessionId,
        language: current.pack.targetLanguage,
        text: trimmed,
        wordCount: countWords(trimmed),
        status: 'validated',
        updatedAt: now,
        validatedAt: now,
        metrics: {
          ...previousMetrics,
          charCount: trimmed.length,
          validationCount: previousMetrics.validationCount + 1,
        },
      };
      const annotations = { ...current.annotations, [key]: annotation };
      const allDownloadedItemsValidated = current.pack.items.every(
        (item) => annotations[annotationKey(current.pack.id, current.pack.targetLanguage, item.id)]
          ?.status === 'validated',
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
    offlineAuth.requireSession(stateRef.current.profile?.collectorCode, pack.targetLanguage);
    commit((current) => ({
      ...current,
      pack,
      packRegistry: registerPack(current.packRegistry, pack, new Date().toISOString()),
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
      const pack: TaskPack = {
        id: assignment.id,
        name: `Affectation ${assignment.id}`,
        nameEn: `Assignment ${assignment.id}`,
        version: assignment.version,
        source: 'downloaded',
        downloadedAt: now,
        targetItems: assignment.targetItems,
        targetLanguage: current.profile?.targetLanguage ?? current.pack.targetLanguage,
        items: [],
      };
      return {
        ...current,
        assignment,
        pack,
        packRegistry: registerPack(current.packRegistry, pack, now),
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
    offlineAuth.requireSession(stateRef.current.profile?.collectorCode, pack.targetLanguage);
    commit((current) => {
      const now = new Date().toISOString();
      const packRegistry = registerPack(current.packRegistry, pack, now);
      const sameAssignment = current.pack.id === pack.id;
      if (!sameAssignment) {
        return {
          ...current,
          pack,
          packRegistry,
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
        packRegistry,
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

  const useBundledPack = useCallback(() => {
    const language = stateRef.current.profile?.targetLanguage ?? betaPack.targetLanguage;
    replacePack({ ...betaPack, targetLanguage: language });
  }, [replacePack]);

  const value = useMemo<AppContextValue>(() => ({
    hydrated,
    authenticated: !!auth.session && boundAuthEpoch === auth.sessionEpoch,
    state,
    theme: getTheme(state.preferences.theme),
    t: (key, values) => translate(state.preferences.language, key, values),
    completeOnboarding,
    logout,
    setLanguage,
    setTheme: setThemeMode,
    ensureSession,
    pauseSession,
    abandonCollection,
    setCurrentIndex,
    noteItemShown,
    updateDraft,
    validateAnnotation,
    replacePack,
    updateAssignment,
    applyAssignmentPack,
    useBundledPack,
    snapshot: () => stateRef.current,
  }), [
    hydrated,
    auth.session,
    auth.sessionEpoch,
    boundAuthEpoch,
    state,
    completeOnboarding,
    logout,
    setLanguage,
    setThemeMode,
    ensureSession,
    pauseSession,
    abandonCollection,
    setCurrentIndex,
    noteItemShown,
    updateDraft,
    validateAnnotation,
    replacePack,
    updateAssignment,
    applyAssignmentPack,
    useBundledPack,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
