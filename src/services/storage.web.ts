import AsyncStorage from '@react-native-async-storage/async-storage';

import { initialState } from '../data/samplePack';
import type { AppState } from '../types';
import { normalizeState, PREVIOUS_STORAGE_KEYS, STORAGE_KEY } from './storageState';

export async function loadState(): Promise<AppState> {
  try {
    const current = await AsyncStorage.getItem(STORAGE_KEY);
    if (current) return normalizeState(current) ?? initialState;

    for (const key of PREVIOUS_STORAGE_KEYS) {
      const previous = await AsyncStorage.getItem(key);
      if (!previous) continue;
      const migrated = normalizeState(previous) ?? initialState;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return initialState;
  } catch {
    return initialState;
  }
}

export async function saveState(state: AppState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
