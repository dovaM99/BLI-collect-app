import type { ImageSourcePropType } from 'react-native';

export type Language = 'fr' | 'en';
export type ThemeMode = 'light' | 'dark';
export type MainScreen = 'dashboard' | 'work' | 'files' | 'settings';

export type Profile = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  collectionStartedAt: string;
  lastTrustedAt: string;
};

export type TaskItem = {
  id: string;
  instruction: string;
  instructionEn?: string;
  minWords: number;
  imageUri?: string;
  bundledImage?: ImageSourcePropType;
  credit?: string;
  originPackId?: string;
  metadata?: Record<string, unknown>;
};

export type TaskPack = {
  id: string;
  name: string;
  nameEn?: string;
  version: string;
  source: 'bundled' | 'downloaded' | 'imported';
  downloadedAt: string;
  targetItems?: number;
  items: TaskItem[];
};

export type AssignmentDownloadStatus = 'downloading' | 'paused' | 'ready' | 'error';
export type AssignmentDownloadPhase = 'downloading' | 'verifying' | 'extracting';

export type AssignmentDownload = {
  id: string;
  version: string;
  sourceUrl?: string;
  targetItems: number;
  totalPacks: number;
  installedPackIds: string[];
  downloadedBytes: number;
  totalBytes: number;
  status: AssignmentDownloadStatus;
  phase?: AssignmentDownloadPhase;
  phaseProgress?: number;
  currentPackId?: string;
  errorCode?: string;
};

export type AnnotationStatus = 'draft' | 'validated';

export type Annotation = {
  taskId: string;
  packId: string;
  sessionId: string;
  text: string;
  wordCount: number;
  status: AnnotationStatus;
  updatedAt: string;
  validatedAt?: string;
};

export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export type CollectionSession = {
  id: string;
  profileId: string;
  packId: string;
  startedAt: string;
  lastActiveAt: string;
  endedAt?: string;
  status: SessionStatus;
  currentIndex: number;
  annotationIds: string[];
};

export type ProfileWorkspace = {
  profile: Profile;
  annotations: Record<string, Annotation>;
  sessions: CollectionSession[];
  activeSessionId: string | null;
  updatedAt: string;
};

export type AbandonedCollection = {
  id: string;
  abandonedAt: string;
  profile: Profile;
  pack: {
    id: string;
    name: string;
    version: string;
    targetItems: number;
  };
  sessions: CollectionSession[];
  annotations: Annotation[];
  items: Array<{
    id: string;
    originPackId?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type AppState = {
  schemaVersion: 3;
  onboardingCompleted: boolean;
  profile: Profile | null;
  collectionClocks: Record<string, { collectionStartedAt: string; lastTrustedAt: string }>;
  profileWorkspaces: Record<string, ProfileWorkspace>;
  abandonedCollections: AbandonedCollection[];
  preferences: {
    language: Language;
    theme: ThemeMode;
  };
  pack: TaskPack;
  assignment: AssignmentDownload | null;
  annotations: Record<string, Annotation>;
  sessions: CollectionSession[];
  activeSessionId: string | null;
};

export type ArchivePackManifest = {
  schemaVersion: 1;
  packId: string;
  version: string | number;
  name: string;
  nameEn?: string;
  language?: string;
  items: Array<{
    id: string;
    image: string;
    question: string;
    instructionEn?: string;
    minWords: number;
    credit?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type AssignmentPackReference = {
  packId: string;
  version: string | number;
  source: {
    provider: 'google-drive' | 'https';
    shareUrl: string;
  };
  sha256?: string;
  sizeBytes?: number;
  include?: 'all' | string[];
};

export type AssignmentSequenceItem = {
  packId: string;
  itemId: string;
};

export type AssignmentManifest = {
  schemaVersion: 1;
  assignmentId: string;
  version: string | number;
  targetItems: number;
  packs: AssignmentPackReference[];
  sequence?: AssignmentSequenceItem[];
};

export type CompactCollectionExport = {
  kind: 'current' | 'abandoned';
  abandonedAt?: string;
  pack: { id: string; version: string; targetItems: number };
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    collectionStartedAt: string;
  };
  sessions: Array<{
    id: string;
    start: string;
    end?: string;
    status: SessionStatus;
    currentIndex: number;
  }>;
  annotations: Array<{
    id: string;
    session: string;
    text: string;
    words: number;
    status: AnnotationStatus;
    updated: string;
    originPackId?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type CompactExport = {
  v: 3;
  app: 'BLI Collect';
  at: string;
  current: CompactCollectionExport | null;
  abandoned: CompactCollectionExport[];
};
