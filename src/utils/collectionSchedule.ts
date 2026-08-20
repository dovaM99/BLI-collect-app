import type { Language, Profile } from '../types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const COLLECTION_DURATION_MONTHS = 2;

function parseDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addCalendarMonths(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function getCollectionSchedule(profile: Profile, now = new Date()) {
  const start = parseDate(profile.collectionStartedAt) ?? parseDate(profile.createdAt) ?? now;
  const lastTrusted = parseDate(profile.lastTrustedAt) ?? start;
  const effectiveNow = now.getTime() < lastTrusted.getTime() ? lastTrusted : now;
  const end = addCalendarMonths(start, COLLECTION_DURATION_MONTHS);
  const today = new Date(effectiveNow.getFullYear(), effectiveNow.getMonth(), effectiveNow.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const daysRemaining = Math.max(0, Math.ceil((endDay.getTime() - today.getTime()) / DAY_IN_MS));

  return {
    start,
    end,
    durationMonths: COLLECTION_DURATION_MONTHS,
    daysRemaining,
    expired: endDay < today,
  };
}

export function formatCollectionDate(date: Date, language: Language) {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
