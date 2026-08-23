import type { TargetLanguage, TaskItem } from '../types';

export const TARGET_LANGUAGES: TargetLanguage[] = ['ln', 'ktu', 'kg'];

export const TARGET_LANGUAGE_LABELS: Record<TargetLanguage, string> = {
  ln: 'Lingala',
  ktu: 'Kituba',
  kg: 'Kikongo',
};

/** Étiquette longue utilisée dans les écrans de choix. */
export const TARGET_LANGUAGE_NATIVE: Record<TargetLanguage, string> = {
  ln: 'Lingála',
  ktu: 'Kituba / Munukutuba',
  kg: 'Kikongo',
};

export function isTargetLanguage(value: unknown): value is TargetLanguage {
  return typeof value === 'string' && (TARGET_LANGUAGES as string[]).includes(value);
}

export function normalizeTargetLanguage(value: unknown): TargetLanguage | null {
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  if (isTargetLanguage(lowered)) return lowered;
  // Tolérance sur les alias rencontrés dans les jeux de données existants.
  const aliases: Record<string, TargetLanguage> = {
    lin: 'ln',
    lingala: 'ln',
    mkw: 'ktu',
    kituba: 'ktu',
    munukutuba: 'ktu',
    kikongo: 'kg',
    kon: 'kg',
    kng: 'kg',
  };
  return aliases[lowered] ?? null;
}

/**
 * Consigne affichée au collecteur. La langue cible prime toujours : c'est dans
 * cette langue que la personne doit écrire, donc c'est dans cette langue que la
 * consigne doit être lue. Le repli français/anglais n'existe que pour les packs
 * de démonstration au format v1.
 */
export function resolvePrompt(
  item: Pick<TaskItem, 'prompts' | 'fallbackPrompt' | 'fallbackPromptEn'>,
  target: TargetLanguage,
  interfaceLanguage: 'fr' | 'en',
): string {
  const prompt = item.prompts?.[target];
  if (prompt && prompt.trim()) return prompt;
  if (interfaceLanguage === 'en' && item.fallbackPromptEn?.trim()) return item.fallbackPromptEn;
  return item.fallbackPrompt ?? '';
}

export function resolveMinWords(
  item: Pick<TaskItem, 'minWords' | 'minWordsByLanguage'>,
  target: TargetLanguage,
): number {
  const specific = item.minWordsByLanguage?.[target];
  return Number.isInteger(specific) && (specific as number) > 0 ? specific as number : item.minWords;
}

export function itemSupportsLanguage(
  item: Pick<TaskItem, 'prompts' | 'fallbackPrompt'>,
  target: TargetLanguage,
): boolean {
  const prompt = item.prompts?.[target];
  if (prompt && prompt.trim()) return true;
  // Un item v1 sans bloc `prompts` reste utilisable : sa consigne unique fait foi.
  return !item.prompts || Object.keys(item.prompts).length === 0
    ? Boolean(item.fallbackPrompt?.trim())
    : false;
}

export function languagesOf(items: Array<Pick<TaskItem, 'prompts'>>): TargetLanguage[] {
  const found = new Set<TargetLanguage>();
  items.forEach((item) => {
    Object.entries(item.prompts ?? {}).forEach(([key, value]) => {
      if (isTargetLanguage(key) && typeof value === 'string' && value.trim()) found.add(key);
    });
  });
  return TARGET_LANGUAGES.filter((language) => found.has(language));
}
