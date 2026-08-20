import LegacyAsyncStorage from '@react-native-async-storage/async-storage';
import Storage from 'expo-sqlite/kv-store';

import { initialState } from '../data/samplePack';
import type { AppState } from '../types';
import {
  LEGACY_STORAGE_KEY,
  normalizeState,
  PREVIOUS_STORAGE_KEY,
  STORAGE_KEY,
} from './storageState';

export async function loadState(): Promise<AppState> {
  try {
    const current = await Storage.getItem(STORAGE_KEY);
    if (current) return normalizeState(current) ?? initialState;

    const previous = await Storage.getItem(PREVIOUS_STORAGE_KEY)
      ?? await LegacyAsyncStorage.getItem(PREVIOUS_STORAGE_KEY)
      ?? await LegacyAsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (!previous) return initialState;
    const migrated = normalizeState(previous) ?? initialState;
    await Storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return initialState;
  }
}

export async function saveState(state: AppState) {
  await Storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
