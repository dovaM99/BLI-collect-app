import { sha256 } from '@noble/hashes/sha256';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { inflateSync } from 'fflate';
import { Platform } from 'react-native';

import { downloadWithResume } from './downloader';
import {
  isTargetLanguage,
  itemSupportsLanguage,
  languagesOf,
} from '../utils/targetLanguages';
import type {
  ArchivePackItem,
  ArchivePackManifest,
  AssignmentDownload,
  AssignmentManifest,
  AssignmentPackReference,
  TargetLanguage,
  TaskItem,
  TaskPack,
} from '../types';

const MAX_PACK_ITEMS = 20_000;
const MAX_SELECTED_ITEMS = 10_000;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_SINGLE_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_SELECTED_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 * 1024;
const MIN_FREE_SPACE_BUFFER = 50 * 1024 * 1024;
const DOWNLOAD_PROGRESS_INTERVAL_MS = 400;
const FILE_READ_CHUNK_BYTES = 1024 * 1024;
const MAX_FULL_SHA256_BYTES = 256 * 1024 * 1024;
const PROCESSING_PROGRESS_INTERVAL_MS = 250;

type InstalledArchive = {
  manifest: ArchivePackManifest;
  items: TaskItem[];
};

type ZipEntry = {
  path: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  crc32: number;
};

export type AssignmentInstallCallbacks = {
  onProgress: (progress: AssignmentDownload) => void;
  onPackReady: (pack: TaskPack, progress: AssignmentDownload) => void;
};

let activeInstall: { key: string; promise: Promise<void> } | null = null;

function packsDirectory() {
  if (Platform.OS === 'web') throw new Error('MOBILE_STORAGE_REQUIRED');
  return new Directory(Paths.document, 'bli-packs', 'assignments');
}

function safeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function normalizeArchivePath(value: string) {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.includes('\0')
    || normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error('INVALID_ARCHIVE');
  }
  return normalized;
}

function driveDownloadUrl(input: string) {
  const trimmed = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('INVALID_URL');
  if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return trimmed;

  const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
  const fileId = pathMatch?.[1] ?? parsed.searchParams.get('id');
  if (!fileId) throw new Error('INVALID_DRIVE_LINK');
  const resourceKey = parsed.searchParams.get('resourcekey');
  const result = new URL('https://drive.usercontent.google.com/download');
  result.searchParams.set('id', fileId);
  result.searchParams.set('export', 'download');
  result.searchParams.set('confirm', 't');
  if (resourceKey) result.searchParams.set('resourcekey', resourceKey);
  return result.toString();
}

function assertAssignmentManifest(value: unknown): asserts value is AssignmentManifest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_ASSIGNMENT');
  const manifest = value as Partial<AssignmentManifest>;
  if (
    manifest.schemaVersion !== 1
    || !manifest.assignmentId
    || manifest.version === undefined
    || !Number.isInteger(manifest.targetItems)
    || Number(manifest.targetItems) < 1
    || !Array.isArray(manifest.packs)
    || manifest.packs.length === 0
  ) {
    throw new Error('INVALID_ASSIGNMENT');
  }

  if (manifest.language !== undefined && !isTargetLanguage(manifest.language)) {
    throw new Error('INVALID_ASSIGNMENT');
  }

  const packIds = new Set<string>();
  for (const pack of manifest.packs) {
    if (
      !pack?.packId
      || pack.version === undefined
      || !pack.source?.shareUrl
      || !['google-drive', 'https'].includes(pack.source.provider)
      || packIds.has(pack.packId)
    ) {
      throw new Error('INVALID_ASSIGNMENT');
    }
    driveDownloadUrl(pack.source.shareUrl);
    if (pack.sha256 && !/^[a-f0-9]{64}$/i.test(pack.sha256)) throw new Error('INVALID_ASSIGNMENT');
    if (pack.sizeBytes !== undefined && (!Number.isFinite(pack.sizeBytes) || pack.sizeBytes <= 0)) {
      throw new Error('INVALID_ASSIGNMENT');
    }
    if (pack.include !== undefined && pack.include !== 'all' && !Array.isArray(pack.include)) {
      throw new Error('INVALID_ASSIGNMENT');
    }
    packIds.add(pack.packId);
  }

  if (manifest.sequence !== undefined) {
    if (
      !Array.isArray(manifest.sequence)
      || manifest.sequence.length === 0
      || manifest.sequence.length > Number(manifest.targetItems)
    ) {
      throw new Error('INVALID_ASSIGNMENT');
    }
    const sequenceIds = new Set<string>();
    for (const entry of manifest.sequence) {
      const sequenceId = `${entry?.packId}:${entry?.itemId}`;
      if (
        !entry?.packId
        || !entry.itemId
        || !packIds.has(entry.packId)
        || sequenceIds.has(sequenceId)
      ) {
        throw new Error('INVALID_ASSIGNMENT');
      }
      sequenceIds.add(sequenceId);
    }
  }
}

function assertPackManifest(
  value: unknown,
  expected: AssignmentPackReference,
): asserts value is ArchivePackManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_PACK_MANIFEST');
  const manifest = value as Partial<ArchivePackManifest>;
  if (
    manifest.schemaVersion !== 1
    || manifest.packId !== expected.packId
    || String(manifest.version) !== String(expected.version)
    || !manifest.name
    || !Array.isArray(manifest.items)
    || manifest.items.length === 0
    || manifest.items.length > MAX_PACK_ITEMS
  ) {
    throw new Error('INVALID_PACK_MANIFEST');
  }

  if (manifest.languages !== undefined) {
    if (
      !Array.isArray(manifest.languages)
      || manifest.languages.length === 0
      || !manifest.languages.every(isTargetLanguage)
    ) {
      throw new Error('INVALID_PACK_MANIFEST');
    }
  }

  const ids = new Set<string>();
  for (const item of manifest.items) {
    if (!item?.id || ids.has(item.id) || !item.image) throw new Error('INVALID_PACK_MANIFEST');
    assertPackItemPrompts(item);
    assertPackItemMinWords(item);
    const imagePath = normalizeArchivePath(item.image);
    if (!imagePath.startsWith('images/') || !/\.(webp|jpe?g|png)$/i.test(imagePath)) {
      throw new Error('INVALID_PACK_MANIFEST');
    }
    ids.add(item.id);
  }
}

/**
 * Un item porte soit un bloc `prompts` (format v2, une consigne par langue de
 * collecte), soit la consigne unique `question` du format v1. Un item sans
 * aucune consigne exploitable invalide le manifeste : mieux vaut refuser le lot
 * à l'installation que livrer une image muette au collecteur.
 */
function assertPackItemPrompts(item: ArchivePackItem) {
  const prompts = item.prompts;
  if (prompts !== undefined) {
    if (!prompts || typeof prompts !== 'object' || Array.isArray(prompts)) {
      throw new Error('INVALID_PACK_MANIFEST');
    }
    const entries = Object.entries(prompts);
    if (entries.length === 0) throw new Error('INVALID_PACK_MANIFEST');
    for (const [language, prompt] of entries) {
      if (!isTargetLanguage(language) || typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('INVALID_PACK_MANIFEST');
      }
    }
    return;
  }
  if (!item.question?.trim()) throw new Error('INVALID_PACK_MANIFEST');
}

function assertPackItemMinWords(item: ArchivePackItem) {
  const minWords = item.minWords;
  if (Number.isInteger(minWords) && (minWords as number) >= 1) return;
  if (minWords && typeof minWords === 'object' && !Array.isArray(minWords)) {
    const entries = Object.entries(minWords);
    if (entries.length === 0) throw new Error('INVALID_PACK_MANIFEST');
    for (const [language, value] of entries) {
      if (!isTargetLanguage(language) || !Number.isInteger(value) || (value as number) < 1) {
        throw new Error('INVALID_PACK_MANIFEST');
      }
    }
    return;
  }
  throw new Error('INVALID_PACK_MANIFEST');
}

async function readAssignmentFromUrl(url: string) {
  const response = await fetch(driveDownloadUrl(url), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const text = await response.text();
  if (/^\s*</.test(text)) throw new Error('DRIVE_DOWNLOAD_REJECTED');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('INVALID_ASSIGNMENT');
  }
  assertAssignmentManifest(parsed);
  return parsed;
}

function makeProgress(
  manifest: AssignmentManifest,
  sourceUrl: string | undefined,
  installedPackIds: string[],
  downloadedBytes: number,
  status: AssignmentDownload['status'],
  details: Pick<AssignmentDownload, 'currentPackId' | 'errorCode' | 'phase' | 'phaseProgress'> = {},
): AssignmentDownload {
  return {
    id: manifest.assignmentId,
    version: String(manifest.version),
    sourceUrl,
    targetItems: manifest.targetItems,
    totalPacks: manifest.packs.length,
    installedPackIds,
    downloadedBytes,
    totalBytes: manifest.packs.reduce((sum, pack) => sum + (pack.sizeBytes ?? 0), 0),
    status,
    ...details,
  };
}

function installedDirectory(manifest: AssignmentManifest, reference: AssignmentPackReference) {
  return new Directory(
    packsDirectory(),
    safeSegment(manifest.assignmentId),
    `${safeSegment(reference.packId)}-v${safeSegment(String(reference.version))}`,
  );
}

/**
 * Seule la consigne de la langue de collecte est chargée en mémoire et
 * persistée : sur un lot de plusieurs milliers d'items, conserver les trois
 * traductions triplerait inutilement la taille de l'état sauvegardé.
 */
function packItems(
  manifest: ArchivePackManifest,
  directory: Directory,
  language: TargetLanguage,
): TaskItem[] {
  return manifest.items.map((item) => {
    const prompt = item.prompts?.[language];
    const minWords = typeof item.minWords === 'number'
      ? item.minWords
      : item.minWords?.[language] ?? 1;
    return {
      id: item.id,
      prompts: prompt ? { [language]: prompt } : {},
      fallbackPrompt: item.question,
      fallbackPromptEn: item.instructionEn,
      minWords,
      imageUri: new File(directory, normalizeArchivePath(item.image)).uri,
      credit: item.credit,
      originPackId: manifest.packId,
      metadata: item.metadata,
    } satisfies TaskItem;
  });
}

function loadInstalledArchive(
  assignment: AssignmentManifest,
  reference: AssignmentPackReference,
  language: TargetLanguage,
): InstalledArchive | null {
  const directory = installedDirectory(assignment, reference);
  const marker = new File(directory, '.complete');
  const manifestFile = new File(directory, 'manifest.json');
  if (!marker.exists || !manifestFile.exists) return null;
  try {
    const parsed = JSON.parse(manifestFile.textSync()) as unknown;
    assertPackManifest(parsed, reference);
    for (const item of parsed.items) {
      if (!new File(directory, normalizeArchivePath(item.image)).exists) return null;
    }
    return { manifest: parsed, items: packItems(parsed, directory, language) };
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

async function streamFile(
  file: File,
  onChunk: (chunk: Uint8Array, final: boolean) => void,
) {
  if (!file.exists || file.size < 4) throw new Error('INVALID_ARCHIVE');
  const handle = file.open();
  let offset = 0;
  try {
    while (offset < file.size) {
      const chunk = handle.readBytes(Math.min(FILE_READ_CHUNK_BYTES, file.size - offset));
      if (!chunk.length) throw new Error('INVALID_ARCHIVE');
      offset += chunk.length;
      onChunk(chunk, offset === file.size);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    handle.close();
  }
}

function viewOf(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readExactly(
  handle: ReturnType<File['open']>,
  offset: number,
  length: number,
) {
  handle.offset = offset;
  const bytes = handle.readBytes(length);
  if (bytes.length !== length) throw new Error('INVALID_ARCHIVE');
  return bytes;
}

async function verifyArchiveFile(
  archive: File,
  expectedSha256?: string,
  onProgress?: (progress: number) => void,
) {
  if (!expectedSha256 || archive.size > MAX_FULL_SHA256_BYTES) {
    const handle = archive.open();
    try {
      const magic = readExactly(handle, 0, 4);
      if (magic[0] !== 0x50 || magic[1] !== 0x4b) throw new Error('INVALID_ARCHIVE');
    } finally {
      handle.close();
    }
    onProgress?.(1);
    return;
  }

  const hasher = expectedSha256 ? sha256.create() : null;
  let firstChunk = true;
  let processedBytes = 0;
  let lastProgressAt = 0;
  await streamFile(archive, (chunk) => {
    if (firstChunk) {
      firstChunk = false;
      if (chunk[0] !== 0x50 || chunk[1] !== 0x4b) throw new Error('INVALID_ARCHIVE');
    }
    hasher?.update(chunk);
    processedBytes += chunk.length;
    const now = Date.now();
    if (now - lastProgressAt >= PROCESSING_PROGRESS_INTERVAL_MS || processedBytes === archive.size) {
      lastProgressAt = now;
      onProgress?.(Math.min(1, processedBytes / archive.size));
    }
  });
  if (expectedSha256 && bytesToHex(hasher!.digest()).toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error('CHECKSUM_MISMATCH');
  }
}

function readZipIndex(archive: File) {
  const handle = archive.open();
  try {
    const tailLength = Math.min(archive.size, 65_557);
    const tailOffset = archive.size - tailLength;
    const tail = readExactly(handle, tailOffset, tailLength);
    const tailView = viewOf(tail);
    let endOffset = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tailView.getUint32(index, true) === 0x06054b50) {
        endOffset = index;
        break;
      }
    }
    if (endOffset < 0) throw new Error('UNSUPPORTED_ARCHIVE');

    const disk = tailView.getUint16(endOffset + 4, true);
    const centralDisk = tailView.getUint16(endOffset + 6, true);
    const entriesOnDisk = tailView.getUint16(endOffset + 8, true);
    const entryCount = tailView.getUint16(endOffset + 10, true);
    const centralSize = tailView.getUint32(endOffset + 12, true);
    const centralOffset = tailView.getUint32(endOffset + 16, true);
    const commentLength = tailView.getUint16(endOffset + 20, true);
    if (
      disk !== 0
      || centralDisk !== 0
      || entriesOnDisk !== entryCount
      || entryCount === 0xffff
      || centralSize === 0xffffffff
      || centralOffset === 0xffffffff
      || entryCount > MAX_PACK_ITEMS + 100
      || centralSize > 64 * 1024 * 1024
      || centralOffset + centralSize > archive.size
      || endOffset + 22 + commentLength > tail.length
    ) {
      throw new Error('UNSUPPORTED_ARCHIVE');
    }

    const central = readExactly(handle, centralOffset, centralSize);
    const centralView = viewOf(central);
    const decoder = new TextDecoder();
    const entries = new Map<string, ZipEntry>();
    let offset = 0;
    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > central.length || centralView.getUint32(offset, true) !== 0x02014b50) {
        throw new Error('INVALID_ARCHIVE');
      }
      const flags = centralView.getUint16(offset + 8, true);
      const compression = centralView.getUint16(offset + 10, true);
      const entryCrc32 = centralView.getUint32(offset + 16, true);
      const compressedSize = centralView.getUint32(offset + 20, true);
      const uncompressedSize = centralView.getUint32(offset + 24, true);
      const nameLength = centralView.getUint16(offset + 28, true);
      const extraLength = centralView.getUint16(offset + 30, true);
      const entryCommentLength = centralView.getUint16(offset + 32, true);
      const entryDisk = centralView.getUint16(offset + 34, true);
      const localHeaderOffset = centralView.getUint32(offset + 42, true);
      const recordLength = 46 + nameLength + extraLength + entryCommentLength;
      if (
        flags & 1
        || entryDisk !== 0
        || compressedSize === 0xffffffff
        || uncompressedSize === 0xffffffff
        || localHeaderOffset === 0xffffffff
        || offset + recordLength > central.length
      ) {
        throw new Error('UNSUPPORTED_ARCHIVE');
      }
      const path = normalizeArchivePath(
        decoder.decode(central.subarray(offset + 46, offset + 46 + nameLength)),
      );
      if (entries.has(path)) throw new Error('INVALID_ARCHIVE');
      entries.set(path, {
        path,
        compression,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        crc32: entryCrc32,
      });
      offset += recordLength;
    }
    return entries;
  } finally {
    handle.close();
  }
}

function readZipEntry(
  handle: ReturnType<File['open']>,
  entry: ZipEntry,
) {
  if (
    entry.path !== 'manifest.json'
    && (entry.compressedSize > MAX_SINGLE_IMAGE_BYTES || entry.uncompressedSize > MAX_SINGLE_IMAGE_BYTES)
  ) {
    throw new Error('ARCHIVE_TOO_LARGE');
  }
  const localHeader = readExactly(handle, entry.localHeaderOffset, 30);
  const headerView = viewOf(localHeader);
  if (headerView.getUint32(0, true) !== 0x04034b50) throw new Error('INVALID_ARCHIVE');
  const flags = headerView.getUint16(6, true);
  const compression = headerView.getUint16(8, true);
  const nameLength = headerView.getUint16(26, true);
  const extraLength = headerView.getUint16(28, true);
  if (flags & 1 || compression !== entry.compression || ![0, 8].includes(compression)) {
    throw new Error('UNSUPPORTED_ARCHIVE');
  }
  const compressed = readExactly(
    handle,
    entry.localHeaderOffset + 30 + nameLength + extraLength,
    entry.compressedSize,
  );
  let result: Uint8Array;
  try {
    result = compression === 0 ? compressed : inflateSync(compressed);
  } catch {
    throw new Error('INVALID_ARCHIVE');
  }
  if (result.length !== entry.uncompressedSize) throw new Error('INVALID_ARCHIVE');
  if (crc32(result) !== entry.crc32) throw new Error('CHECKSUM_MISMATCH');
  return result;
}

async function readAndVerifyPackManifest(
  archive: File,
  expected: AssignmentPackReference,
  onProgress?: (progress: number) => void,
) {
  await verifyArchiveFile(archive, expected.sha256, onProgress);
  const entries = readZipIndex(archive);
  const manifestEntry = entries.get('manifest.json');
  if (!manifestEntry || manifestEntry.uncompressedSize > MAX_MANIFEST_BYTES) {
    throw new Error('INVALID_PACK_MANIFEST');
  }
  const handle = archive.open();
  try {
    const text = new TextDecoder().decode(readZipEntry(handle, manifestEntry));
    const parsed = JSON.parse(text) as unknown;
    assertPackManifest(parsed, expected);
    return { manifest: parsed, entries };
  } catch (caught) {
    if (caught instanceof Error && ['INVALID_ARCHIVE', 'UNSUPPORTED_ARCHIVE'].includes(caught.message)) {
      throw caught;
    }
    throw new Error('INVALID_PACK_MANIFEST');
  } finally {
    handle.close();
  }
}

function selectedItemIds(
  assignment: AssignmentManifest,
  reference: AssignmentPackReference,
) {
  if (assignment.sequence) {
    return new Set(
      assignment.sequence
        .filter((entry) => entry.packId === reference.packId)
        .map((entry) => entry.itemId),
    );
  }
  if (Array.isArray(reference.include)) return new Set(reference.include);
  return null;
}

function selectPackManifestItems(
  manifest: ArchivePackManifest,
  itemIds: Set<string> | null,
  language: TargetLanguage,
) {
  const selected = itemIds
    ? manifest.items.filter((item) => itemIds.has(item.id))
    : manifest.items;
  if (itemIds && selected.length !== itemIds.size) throw new Error('ASSIGNMENT_ITEM_NOT_FOUND');

  // Un lot qui ne contient pas la langue du collecteur est une erreur
  // d'affectation, pas une donnée à ignorer silencieusement.
  const items = selected.filter((item) => itemSupportsLanguage(
    {
      prompts: item.prompts ?? {},
      fallbackPrompt: item.question,
    },
    language,
  ));
  if (items.length === 0) throw new Error('LANGUAGE_NOT_AVAILABLE');
  if (items.length > MAX_SELECTED_ITEMS) throw new Error('ARCHIVE_TOO_LARGE');
  return { ...manifest, items };
}

async function extractArchive(
  archive: File,
  destination: Directory,
  manifest: ArchivePackManifest,
  entries: Map<string, ZipEntry>,
  onProgress?: (progress: number) => void,
) {
  if (destination.exists) destination.delete();
  destination.create({ intermediates: true, idempotent: true });

  const selectedPaths = new Set(manifest.items.map((item) => normalizeArchivePath(item.image)));
  if (selectedPaths.size > MAX_SELECTED_ITEMS) throw new Error('ARCHIVE_TOO_LARGE');
  const selectedEntries = [...selectedPaths].map((path) => entries.get(path));
  if (selectedEntries.some((entry) => !entry)) throw new Error('MISSING_IMAGE');
  const declaredBytes = selectedEntries.reduce((sum, entry) => sum + (entry?.uncompressedSize ?? 0), 0);
  if (declaredBytes > MAX_SELECTED_UNCOMPRESSED_BYTES) throw new Error('ARCHIVE_TOO_LARGE');

  const handle = archive.open();
  let completed = 0;
  let lastProgressAt = 0;
  try {
    for (const entry of selectedEntries) {
      if (!entry) throw new Error('MISSING_IMAGE');
      const output = new File(destination, entry.path);
      output.create({ intermediates: true, overwrite: true });
      output.write(readZipEntry(handle, entry));
      completed += 1;
      const now = Date.now();
      if (now - lastProgressAt >= PROCESSING_PROGRESS_INTERVAL_MS || completed === selectedEntries.length) {
        lastProgressAt = now;
        onProgress?.(selectedEntries.length ? completed / selectedEntries.length : 1);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    handle.close();
  }

  const manifestFile = new File(destination, 'manifest.json');
  manifestFile.create({ intermediates: true, overwrite: true });
  manifestFile.write(JSON.stringify(manifest));
}

async function downloadArchive(
  assignment: AssignmentManifest,
  reference: AssignmentPackReference,
  sourceUrl: string | undefined,
  installedPackIds: string[],
  installedBytes: number,
  callbacks: AssignmentInstallCallbacks,
) {
  if (reference.sizeBytes) {
    // Le ZIP reste en cache pendant que seules les images retenues par
    // l'affectation sont extraites. On garde une marge prudente sans exiger de
    // pouvoir dupliquer toutes les images d'un gros lot source.
    const required = Math.ceil(reference.sizeBytes * 1.75) + MIN_FREE_SPACE_BUFFER;
    if (Paths.availableDiskSpace < required) throw new Error('NOT_ENOUGH_SPACE');
  }

  const baseName = `bli-${safeSegment(assignment.assignmentId)}-${safeSegment(reference.packId)}`;
  const cacheFile = new File(Paths.cache, `${baseName}.zip`);
  const stateFile = new File(Paths.cache, `${baseName}.part.json`);

  let lastProgressAt = 0;
  const outcome = await downloadWithResume({
    url: driveDownloadUrl(reference.source.shareUrl),
    destination: cacheFile,
    stateFile,
    expectedBytes: reference.sizeBytes,
    onProgress: (writtenBytes, totalBytes) => {
      const now = Date.now();
      const finished = totalBytes !== undefined && writtenBytes >= totalBytes;
      if (now - lastProgressAt < DOWNLOAD_PROGRESS_INTERVAL_MS && !finished) return;
      lastProgressAt = now;
      callbacks.onProgress(makeProgress(
        assignment,
        sourceUrl,
        installedPackIds,
        installedBytes + writtenBytes,
        'downloading',
        {
          currentPackId: reference.packId,
          phase: 'downloading',
          phaseProgress: totalBytes && totalBytes > 0
            ? Math.min(1, writtenBytes / totalBytes)
            : undefined,
        },
      ));
    },
  });

  if (!cacheFile.exists) throw new Error('DRIVE_DOWNLOAD_REJECTED');
  return { file: cacheFile, resumedBytes: outcome.resumedFromBytes };
}

async function installArchive(
  assignment: AssignmentManifest,
  reference: AssignmentPackReference,
  sourceUrl: string | undefined,
  installedPackIds: string[],
  installedBytes: number,
  language: TargetLanguage,
  callbacks: AssignmentInstallCallbacks,
): Promise<InstalledArchive> {
  const cached = loadInstalledArchive(assignment, reference, language);
  if (cached) return cached;

  const { file: archive } = await downloadArchive(
    assignment,
    reference,
    sourceUrl,
    installedPackIds,
    installedBytes,
    callbacks,
  );
  const transferredBytes = installedBytes + (reference.sizeBytes ?? archive.size);
  const reportPhase = (
    phase: NonNullable<AssignmentDownload['phase']>,
    phaseProgress: number,
  ) => callbacks.onProgress(makeProgress(
    assignment,
    sourceUrl,
    installedPackIds,
    transferredBytes,
    'downloading',
    { currentPackId: reference.packId, phase, phaseProgress },
  ));
  let installationComplete = false;
  try {
    reportPhase('verifying', 0);
    const indexedArchive = await readAndVerifyPackManifest(
      archive,
      reference,
      (progress) => reportPhase('verifying', progress),
    );
    const parsed = selectPackManifestItems(
      indexedArchive.manifest,
      selectedItemIds(assignment, reference),
      language,
    );
    const finalDirectory = installedDirectory(assignment, reference);
    reportPhase('extracting', 0);
    await extractArchive(
      archive,
      finalDirectory,
      parsed,
      indexedArchive.entries,
      (progress) => reportPhase('extracting', progress),
    );

    const manifestFile = new File(finalDirectory, 'manifest.json');
    if (!manifestFile.exists) throw new Error('INVALID_PACK_MANIFEST');
    for (const item of parsed.items) {
      if (!new File(finalDirectory, normalizeArchivePath(item.image)).exists) {
        throw new Error('MISSING_IMAGE');
      }
    }

    const marker = new File(finalDirectory, '.complete');
    marker.create({ intermediates: true, overwrite: true });
    marker.write(JSON.stringify({ packId: parsed.packId, version: parsed.version }));
    installationComplete = true;
    return { manifest: parsed, items: packItems(parsed, finalDirectory, language) };
  } finally {
    // Keep a fully downloaded ZIP after a local installation error so a retry
    // does not consume another multi-gigabyte download. It is removed only
    // after the block has been committed successfully.
    if (installationComplete && archive.exists) {
      try {
        archive.delete();
      } catch {
        // Cache cleanup must never invalidate an already installed block.
      }
    }
  }
}

function buildAssignmentPack(
  assignment: AssignmentManifest,
  installed: Map<string, InstalledArchive>,
  source: TaskPack['source'],
  language: TargetLanguage,
): TaskPack {
  const byPackAndItem = new Map<string, TaskItem>();
  for (const [packId, archive] of installed) {
    archive.items.forEach((item) => byPackAndItem.set(`${packId}:${item.id}`, item));
  }

  const items: TaskItem[] = [];
  if (assignment.sequence) {
    for (const entry of assignment.sequence) {
      const item = byPackAndItem.get(`${entry.packId}:${entry.itemId}`);
      if (item) items.push(item);
    }
  } else {
    for (const reference of assignment.packs) {
      const archive = installed.get(reference.packId);
      if (!archive) continue;
      const include = reference.include;
      if (!include || include === 'all') items.push(...archive.items);
      else {
        const allowed = new Set(include);
        items.push(...archive.items.filter((item) => allowed.has(item.id)));
      }
    }
  }

  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error('DUPLICATE_ITEM_ID');
    ids.add(item.id);
  }

  const availableLanguages = new Set<TargetLanguage>();
  for (const archive of installed.values()) {
    languagesOf(archive.items).forEach((candidate) => availableLanguages.add(candidate));
  }

  return {
    id: assignment.assignmentId,
    name: `Affectation ${assignment.assignmentId}`,
    nameEn: `Assignment ${assignment.assignmentId}`,
    version: String(assignment.version),
    source,
    downloadedAt: new Date().toISOString(),
    targetItems: assignment.targetItems,
    targetLanguage: language,
    availableLanguages: [...availableLanguages],
    items,
  };
}

async function runAssignmentInstall(
  manifest: AssignmentManifest,
  sourceUrl: string | undefined,
  callbacks: AssignmentInstallCallbacks,
  source: TaskPack['source'],
  requestedLanguage: TargetLanguage,
) {
  assertAssignmentManifest(manifest);
  // Une affectation peut imposer sa langue : c'est elle qui fait foi, sinon on
  // suit la langue déclarée par le collecteur à l'identification.
  const language = manifest.language ?? requestedLanguage;
  packsDirectory().create({ intermediates: true, idempotent: true });
  const installed = new Map<string, InstalledArchive>();
  const installedPackIds: string[] = [];
  let installedBytes = 0;
  let latestProgress = makeProgress(manifest, sourceUrl, [], 0, 'downloading');
  const trackedCallbacks: AssignmentInstallCallbacks = {
    onProgress: (progress) => {
      latestProgress = progress;
      callbacks.onProgress(progress);
    },
    onPackReady: callbacks.onPackReady,
  };
  callbacks.onProgress(latestProgress);

  try {
    for (const reference of manifest.packs) {
      const archive = await installArchive(
        manifest,
        reference,
        sourceUrl,
        installedPackIds,
        installedBytes,
        language,
        trackedCallbacks,
      );
      installed.set(reference.packId, archive);
      installedPackIds.push(reference.packId);
      installedBytes += reference.sizeBytes ?? 0;
      const progress = makeProgress(
        manifest,
        sourceUrl,
        [...installedPackIds],
        installedBytes,
        installedPackIds.length === manifest.packs.length ? 'ready' : 'downloading',
      );
      const pack = buildAssignmentPack(manifest, installed, source, language);
      latestProgress = progress;
      callbacks.onPackReady(pack, progress);
    }

    const finalPack = buildAssignmentPack(manifest, installed, source, language);
    const expectedAvailableItems = manifest.sequence?.length ?? manifest.targetItems;
    if (finalPack.items.length !== expectedAvailableItems) {
      throw new Error('ASSIGNMENT_ITEM_COUNT_MISMATCH');
    }
    const ready = makeProgress(manifest, sourceUrl, [...installedPackIds], installedBytes, 'ready');
    latestProgress = ready;
    callbacks.onPackReady(finalPack, ready);
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error('ASSIGNMENT_DOWNLOAD_FAILED');
    callbacks.onProgress({ ...latestProgress, status: 'error', errorCode: error.message });
    throw error;
  }
}

export async function installAssignmentFromUrl(
  url: string,
  language: TargetLanguage,
  callbacks: AssignmentInstallCallbacks,
) {
  if (Platform.OS === 'web') throw new Error('MOBILE_STORAGE_REQUIRED');
  const key = `${language}::${url.trim()}`;
  if (activeInstall?.key === key) return activeInstall.promise;
  const promise = readAssignmentFromUrl(url.trim())
    .then((manifest) => runAssignmentInstall(manifest, url.trim(), callbacks, 'downloaded', language))
    .finally(() => {
      if (activeInstall?.key === key) activeInstall = null;
    });
  activeInstall = { key, promise };
  return promise;
}

export async function importAssignmentDocument(
  language: TargetLanguage,
  callbacks: AssignmentInstallCallbacks,
) {
  if (Platform.OS === 'web') throw new Error('MOBILE_STORAGE_REQUIRED');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return false;
  const asset = result.assets[0];
  if (!asset) throw new Error('INVALID_ASSIGNMENT');
  const file = new File(asset.uri);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error('INVALID_ASSIGNMENT');
  }
  assertAssignmentManifest(parsed);
  await runAssignmentInstall(parsed, undefined, callbacks, 'imported', language);
  return true;
}
