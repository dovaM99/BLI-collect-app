import type { ImageSourcePropType } from 'react-native';

/** Langue de l'interface. */
export type Language = 'fr' | 'en';

/**
 * Langue de collecte : celle dans laquelle le collecteur écrit, et donc celle
 * dans laquelle la consigne doit lui être présentée. Distincte de la langue de
 * l'interface, qui reste français/anglais.
 */
export type TargetLanguage = 'ln' | 'ktu' | 'kg';

export type ThemeMode = 'light' | 'dark';
export type MainScreen = 'dashboard' | 'work' | 'lexicon' | 'files' | 'settings';

export type CollectorCodeFormat = 'bli' | 'free';

export type Profile = {
  id: string;
  /** Code généré par l'app à l'inscription. Clé d'identité : il rattache le travail à une personne. */
  collectorCode: string;
  collectorCodeFormat: CollectorCodeFormat;
  collectorCodeChecksumOk: boolean | null;
  targetLanguage: TargetLanguage;
  firstName: string;
  lastName: string;
  createdAt: string;
  collectionStartedAt: string;
  lastTrustedAt: string;
};

export type TaskItem = {
  id: string;
  /** Consignes par langue de collecte. Format de pack v2. */
  prompts: Partial<Record<TargetLanguage, string>>;
  /** Consigne unique des packs v1 et du lot de démonstration. */
  fallbackPrompt?: string;
  fallbackPromptEn?: string;
  minWords: number;
  minWordsByLanguage?: Partial<Record<TargetLanguage, number>>;
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
  /** Langue retenue à l'installation de ce lot. */
  targetLanguage: TargetLanguage;
  availableLanguages?: TargetLanguage[];
  items: TaskItem[];
};

/**
 * Trace durable d'un lot ayant été actif sur cet appareil. Sans ce registre, les
 * annotations d'un lot remplacé par le suivant restaient dans le stockage sans
 * jamais ressortir dans un export.
 */
export type PackRecord = {
  id: string;
  name: string;
  version: string;
  source: TaskPack['source'];
  targetItems: number;
  targetLanguage: TargetLanguage;
  availableLanguages?: TargetLanguage[];
  firstSeenAt: string;
  lastActiveAt: string;
  items: Array<{
    id: string;
    originPackId?: string;
    minWords: number;
    metadata?: Record<string, unknown>;
  }>;
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
  /** Octets déjà présents au démarrage : mesure l'efficacité de la reprise. */
  resumedBytes?: number;
};

export type AnnotationStatus = 'draft' | 'validated';

/**
 * Signaux de saisie. Ils ne servent pas à surveiller le collecteur mais à
 * repérer, au dépouillement, ce qui ne peut pas être une production spontanée :
 * un texte long apparu d'un bloc, ou quinze mots écrits en quatre secondes.
 */
export type AnnotationMetrics = {
  /** Temps de frappe cumulé, pauses longues exclues. */
  activeMs: number;
  /** Délai entre l'affichage de l'image et la première frappe. */
  timeToFirstInputMs?: number;
  editCount: number;
  charCount: number;
  /** Plus grand ajout de caractères en un seul événement : signature d'un collage. */
  maxBurstChars: number;
  burstCount: number;
  deletionCount: number;
  firstInputAt?: string;
  lastInputAt?: string;
  /** Nombre de validations successives du même item. */
  validationCount: number;
};

export type Annotation = {
  taskId: string;
  packId: string;
  sessionId: string;
  language: TargetLanguage;
  text: string;
  wordCount: number;
  status: AnnotationStatus;
  updatedAt: string;
  validatedAt?: string;
  metrics: AnnotationMetrics;
};

export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export type CollectionSession = {
  id: string;
  profileId: string;
  packId: string;
  language: TargetLanguage;
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
    targetLanguage: TargetLanguage;
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
  schemaVersion: 4;
  /** Stable pour une installation donnée, régénéré après réinstallation. */
  installationId: string;
  onboardingCompleted: boolean;
  profile: Profile | null;
  collectionClocks: Record<string, { collectionStartedAt: string; lastTrustedAt: string }>;
  profileWorkspaces: Record<string, ProfileWorkspace>;
  packRegistry: Record<string, PackRecord>;
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

/** Item de manifeste au format v2 : consignes trilingues. */
export type ArchivePackItem = {
  id: string;
  image: string;
  /** v2 : une consigne par langue de collecte. */
  prompts?: Partial<Record<TargetLanguage, string>>;
  /** v1 : consigne unique. */
  question?: string;
  instructionEn?: string;
  minWords: number | Partial<Record<TargetLanguage, number>>;
  credit?: string;
  metadata?: Record<string, unknown>;
};

export type ArchivePackManifest = {
  schemaVersion: 1 | 2;
  packId: string;
  version: string | number;
  name: string;
  nameEn?: string;
  /** v2 : langues effectivement fournies par ce lot. */
  languages?: TargetLanguage[];
  /** v1 : langue unique du lot. */
  language?: string;
  items: ArchivePackItem[];
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
  /** Optionnel : impose la langue de collecte de cette affectation. */
  language?: TargetLanguage;
  packs: AssignmentPackReference[];
  sequence?: AssignmentSequenceItem[];
};

export type CompactAnnotation = {
  id: string;
  session: string;
  language: TargetLanguage;
  text: string;
  words: number;
  status: AnnotationStatus;
  updated: string;
  validated?: string;
  originPackId?: string;
  metadata?: Record<string, unknown>;
  metrics: AnnotationMetrics;
};

export type CompactCollectionExport = {
  kind: 'current' | 'previous' | 'abandoned';
  abandonedAt?: string;
  pack: {
    id: string;
    name?: string;
    version: string;
    targetItems: number;
    targetLanguage: TargetLanguage;
    availableLanguages?: TargetLanguage[];
  };
  sessions: Array<{
    id: string;
    start: string;
    end?: string;
    status: SessionStatus;
    currentIndex: number;
    language: TargetLanguage;
  }>;
  annotations: CompactAnnotation[];
};

export type ExportBuild = {
  appVersion: string;
  slug?: string;
  platform: string;
  osVersion?: string;
  deviceModel?: string;
  deviceBrand?: string;
  reactNative?: string;
  installationId: string;
};

export type ExportCollector = {
  id: string;
  code: string;
  codeFormat: CollectorCodeFormat;
  codeChecksumOk: boolean | null;
  firstName: string;
  lastName: string;
  targetLanguage: TargetLanguage;
  collectionStartedAt: string;
  clockTrustedAt: string;
};

export type ExportTotals = {
  collections: number;
  annotations: number;
  validated: number;
  words: number;
};

export type CompactExportPayload = {
  v: 4;
  app: 'BLI Collect';
  at: string;
  build: ExportBuild;
  collector: ExportCollector | null;
  collections: CompactCollectionExport[];
  totals: ExportTotals;
};

export type CompactExport = CompactExportPayload & {
  integrity: {
    algorithm: 'sha256';
    /** SHA-256 de JSON.stringify(payload) sans le champ `integrity`. */
    value: string;
    bodyBytes: number;
  };
};
