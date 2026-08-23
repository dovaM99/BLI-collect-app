import { Platform } from 'react-native';

// Metro résout les imports JSON : pas de dépendance supplémentaire à installer.
const appManifest = require('../../app.json') as {
  expo?: { version?: string; slug?: string; android?: { versionCode?: number } };
};

type PlatformConstants = Record<string, unknown> & {
  reactNativeVersion?: { major: number; minor: number; patch: number };
};

function constants(): PlatformConstants {
  try {
    return (Platform.constants ?? {}) as PlatformConstants;
  } catch {
    return {};
  }
}

function readString(source: PlatformConstants, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function reactNativeVersion(source: PlatformConstants) {
  const version = source.reactNativeVersion;
  if (!version) return undefined;
  return `${version.major}.${version.minor}.${version.patch}`;
}

export type BuildInfo = {
  appVersion: string;
  slug?: string;
  platform: string;
  osVersion?: string;
  deviceModel?: string;
  deviceBrand?: string;
  reactNative?: string;
};

/**
 * Signature du binaire et de l'appareil. Sans ces champs, un export corrompu par
 * une régression de build est impossible à isoler dans le corpus.
 */
export function buildInfo(): BuildInfo {
  const source = constants();
  return {
    appVersion: appManifest.expo?.version ?? '0.0.0',
    slug: appManifest.expo?.slug,
    platform: Platform.OS,
    osVersion: readString(source, 'Release')
      ?? readString(source, 'osVersion')
      ?? (Platform.Version !== undefined ? String(Platform.Version) : undefined),
    deviceModel: readString(source, 'Model') ?? readString(source, 'systemName'),
    deviceBrand: readString(source, 'Brand') ?? readString(source, 'Manufacturer'),
    reactNative: reactNativeVersion(source),
  };
}

/**
 * Identifiant d'installation : stable pour un même APK sur un même téléphone,
 * régénéré après une réinstallation. Sert à rattacher plusieurs exports au même
 * appareil sans collecter d'identifiant matériel.
 */
export function createInstallationId() {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `inst-${Date.now().toString(36)}-${random()}${random()}`;
}
