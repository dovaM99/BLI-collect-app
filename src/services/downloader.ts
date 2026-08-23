import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

/**
 * Téléchargement reprenable.
 *
 * Le comportement d'origine (`downloadAsync` seul) repartait de zéro à chaque
 * coupure : sur une liaison brazzavilloise avec délestage, un ZIP de 200 Mo
 * n'arrivait jamais au bout et le collecteur reconsommait son forfait à chaque
 * tentative.
 *
 * Deux stratégies, dans cet ordre :
 *  1. `range`  — le serveur annonce `Accept-Ranges: bytes` : le fichier est tiré
 *                par tranches, chaque tranche étant écrite puis refermée sur le
 *                disque. Une coupure (réseau, batterie, kill Android) ne coûte
 *                au pire que la tranche en cours.
 *  2. `stream` — repli : téléchargement continu via expo-file-system, avec
 *                sauvegarde du jeton de reprise quand la plateforme en fournit un.
 *
 * On ne lit JAMAIS le corps d'une réponse non bornée : le `fetch` de React
 * Native met toute la réponse en mémoire avant de rendre la main, ce qui ferait
 * tomber un téléphone d'entrée de gamme sur une archive de plusieurs centaines
 * de mégaoctets. D'où la sonde HEAD préalable.
 */

const CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_ATTEMPTS_PER_CHUNK = 4;
const CHUNK_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 20_000;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_RATE_LIMIT_WAIT_MS = 120_000;

export type DownloadStrategy = 'range' | 'stream';

export type DownloadResult = {
  strategy: DownloadStrategy;
  totalBytes: number;
  resumedFromBytes: number;
};

export type DownloadOptions = {
  url: string;
  destination: File;
  stateFile: File;
  expectedBytes?: number;
  onProgress?: (writtenBytes: number, totalBytes: number | undefined) => void;
};

type PartState = {
  url: string;
  expectedBytes?: number;
  totalBytes?: number;
  etag?: string;
  resumeData?: string;
  updatedAt: string;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number) {
  const exponential = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  const jitter = Math.random() * BASE_RETRY_DELAY_MS;
  return Math.min(MAX_RETRY_DELAY_MS, exponential + jitter);
}

function fileSize(file: File) {
  try {
    return file.exists ? file.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

function readState(stateFile: File): PartState | null {
  try {
    if (!stateFile.exists) return null;
    const parsed = JSON.parse(stateFile.textSync()) as PartState;
    return parsed && typeof parsed.url === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(stateFile: File, state: PartState) {
  try {
    stateFile.create({ intermediates: true, overwrite: true });
    stateFile.write(JSON.stringify(state));
  } catch {
    // Un état de reprise non enregistré dégrade la reprise, il ne doit jamais
    // faire échouer un téléchargement qui progresse.
  }
}

function clearState(stateFile: File) {
  try {
    if (stateFile.exists) stateFile.delete();
  } catch {
    // idem
  }
}

function resetDownload(destination: File, stateFile: File) {
  try {
    if (destination.exists) destination.delete();
  } catch {
    // idem
  }
  clearState(stateFile);
}

function appendBytes(destination: File, bytes: Uint8Array) {
  if (!destination.exists) destination.create({ intermediates: true, overwrite: false });
  const handle = destination.open();
  try {
    handle.offset = handle.size ?? fileSize(destination);
    handle.writeBytes(bytes);
  } finally {
    handle.close();
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function retryAfterMs(response: Response) {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(0, seconds) * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(0, date - Date.now()));
  return null;
}

function isHtml(response: Response) {
  return (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
}

/**
 * Google Drive ne renvoie pas un code d'erreur exploitable quand le quota de
 * téléchargement d'un fichier partagé est épuisé : il sert une page HTML. Sans
 * ce test, l'app affichait « archive invalide » — message qui envoie le
 * collecteur chercher un problème inexistant dans le ZIP.
 */
async function classifyHtmlResponse(response: Response): Promise<never> {
  let body = '';
  try {
    body = (await response.text()).slice(0, 4000);
  } catch {
    body = '';
  }
  if (/quota|exceeded|too many|trop de|dépass/i.test(body)) throw new Error('DRIVE_QUOTA_EXCEEDED');
  if (/sign in|connexion|permission|access denied|autorisation/i.test(body)) {
    throw new Error('DRIVE_ACCESS_DENIED');
  }
  throw new Error('DRIVE_DOWNLOAD_REJECTED');
}

async function assertUsableResponse(response: Response) {
  if (response.status === 429) throw new Error('DOWNLOAD_RATE_LIMITED');
  if (isHtml(response)) await classifyHtmlResponse(response);
  if (response.status === 403) throw new Error('DRIVE_QUOTA_EXCEEDED');
  if (response.status === 404) throw new Error('DRIVE_DOWNLOAD_REJECTED');
}

type Probe = {
  supportsRange: boolean;
  totalBytes?: number;
  etag?: string;
};

async function probe(url: string): Promise<Probe> {
  try {
    const response = await fetchWithTimeout(url, { method: 'HEAD' }, PROBE_TIMEOUT_MS);
    if (response.status === 429) throw new Error('DOWNLOAD_RATE_LIMITED');
    if (!response.ok) return { supportsRange: false };
    const length = Number(response.headers.get('content-length'));
    return {
      supportsRange: (response.headers.get('accept-ranges') ?? '').toLowerCase().includes('bytes'),
      totalBytes: Number.isFinite(length) && length > 0 ? length : undefined,
      etag: response.headers.get('etag') ?? undefined,
    };
  } catch (caught) {
    if (caught instanceof Error && caught.message === 'DOWNLOAD_RATE_LIMITED') throw caught;
    // Une sonde qui échoue n'est pas une erreur : on retombe simplement sur le
    // téléchargement continu.
    return { supportsRange: false };
  }
}

function parseContentRangeTotal(response: Response) {
  const header = response.headers.get('content-range');
  const match = header?.match(/\/(\d+)\s*$/);
  const total = match ? Number(match[1]) : NaN;
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

async function downloadByRanges(options: DownloadOptions, initial: Probe): Promise<DownloadResult> {
  const { destination, stateFile, url, onProgress } = options;
  const resumedFromBytes = fileSize(destination);
  let total = initial.totalBytes ?? options.expectedBytes;
  let written = resumedFromBytes;
  let consecutiveRateLimits = 0;

  while (total === undefined || written < total) {
    const end = written + CHUNK_BYTES - 1;
    let chunk: Uint8Array | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CHUNK; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          url,
          { headers: { Range: `bytes=${written}-${end}` } },
          CHUNK_TIMEOUT_MS,
        );

        if (response.status === 416) {
          // Plage hors limites : le fichier est déjà complet sur le disque.
          total = written;
          chunk = new Uint8Array(0);
          break;
        }
        if (response.status === 429) {
          consecutiveRateLimits += 1;
          const delay = retryAfterMs(response) ?? backoffDelay(attempt);
          if (consecutiveRateLimits > MAX_ATTEMPTS_PER_CHUNK) throw new Error('DOWNLOAD_RATE_LIMITED');
          await wait(delay);
          continue;
        }
        await assertUsableResponse(response);

        if (response.status !== 206) {
          // Le serveur a ignoré l'en-tête Range. On ne peut pas assembler par
          // tranches : on bascule sur le téléchargement continu.
          throw new Error('RANGE_NOT_SUPPORTED');
        }

        consecutiveRateLimits = 0;
        total = parseContentRangeTotal(response) ?? total;
        chunk = new Uint8Array(await response.arrayBuffer());
        break;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '';
        if (['RANGE_NOT_SUPPORTED', 'DRIVE_QUOTA_EXCEEDED', 'DRIVE_ACCESS_DENIED', 'DRIVE_DOWNLOAD_REJECTED'].includes(message)) {
          throw caught;
        }
        if (attempt >= MAX_ATTEMPTS_PER_CHUNK) {
          throw new Error(message === 'DOWNLOAD_RATE_LIMITED' ? message : 'NETWORK_UNAVAILABLE');
        }
        await wait(backoffDelay(attempt));
      }
    }

    if (!chunk) throw new Error('NETWORK_UNAVAILABLE');
    if (chunk.length === 0) {
      total = total ?? written;
      break;
    }

    appendBytes(destination, chunk);
    written += chunk.length;
    writeState(stateFile, {
      url,
      expectedBytes: options.expectedBytes,
      totalBytes: total,
      etag: initial.etag,
      updatedAt: new Date().toISOString(),
    });
    onProgress?.(written, total);

    // Une tranche plus courte que demandée signale la fin du fichier.
    if (chunk.length < CHUNK_BYTES && total !== undefined && written >= total) break;
    if (chunk.length < CHUNK_BYTES && total === undefined) break;
  }

  return { strategy: 'range', totalBytes: written, resumedFromBytes };
}

async function downloadByStream(options: DownloadOptions, saved: PartState | null): Promise<DownloadResult> {
  const { destination, stateFile, url, onProgress } = options;
  const resumedFromBytes = saved?.resumeData ? fileSize(destination) : 0;
  if (!saved?.resumeData && destination.exists) destination.delete();

  const resumable = LegacyFileSystem.createDownloadResumable(
    url,
    destination.uri,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      onProgress?.(
        totalBytesWritten,
        totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : options.expectedBytes,
      );
    },
    saved?.resumeData,
  );

  try {
    const result = saved?.resumeData ? await resumable.resumeAsync() : await resumable.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300) throw new Error('DRIVE_DOWNLOAD_REJECTED');
    return { strategy: 'stream', totalBytes: fileSize(destination), resumedFromBytes };
  } catch (caught) {
    // Dernière chance de conserver un point de reprise avant de remonter l'erreur.
    try {
      const paused = await resumable.pauseAsync();
      if (paused?.resumeData) {
        writeState(stateFile, {
          url,
          expectedBytes: options.expectedBytes,
          resumeData: paused.resumeData,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // La plateforme ne fournit pas toujours un jeton de reprise.
    }
    if (caught instanceof Error && caught.message.startsWith('DRIVE_')) throw caught;
    throw new Error('NETWORK_UNAVAILABLE');
  }
}

export async function downloadWithResume(options: DownloadOptions): Promise<DownloadResult> {
  const { destination, stateFile, url, expectedBytes } = options;
  const saved = readState(stateFile);

  // Un lot republié sous la même URL ne doit jamais être recollé sur un reliquat
  // de l'ancienne version : à la moindre divergence, on repart proprement.
  if (saved && (saved.url !== url || saved.expectedBytes !== expectedBytes)) {
    resetDownload(destination, stateFile);
  }

  const current = fileSize(destination);
  if (expectedBytes !== undefined) {
    if (current === expectedBytes) {
      clearState(stateFile);
      return { strategy: 'range', totalBytes: current, resumedFromBytes: current };
    }
    if (current > expectedBytes) resetDownload(destination, stateFile);
  }

  const inspected = await probe(url);
  const freshState = readState(stateFile);

  let result: DownloadResult;
  if (inspected.supportsRange && !freshState?.resumeData) {
    try {
      result = await downloadByRanges(options, inspected);
    } catch (caught) {
      if (caught instanceof Error && caught.message === 'RANGE_NOT_SUPPORTED') {
        resetDownload(destination, stateFile);
        result = await downloadByStream(options, null);
      } else {
        throw caught;
      }
    }
  } else {
    result = await downloadByStream(options, freshState);
  }

  if (expectedBytes !== undefined && fileSize(destination) !== expectedBytes) {
    // On garde le fichier partiel : la prochaine tentative reprendra dessus.
    throw new Error('DOWNLOAD_INCOMPLETE');
  }
  clearState(stateFile);
  return result;
}
