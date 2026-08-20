import AsyncStorage from '@react-native-async-storage/async-storage';

import { initialState } from '../data/samplePack';
import type { AppState } from '../types';
import { LEGACY_STORAGE_KEY, normalizeState, STORAGE_KEY } from './storageState';

export async function loadState(): Promise<AppState> {
  try {
    const current = await AsyncStorage.getItem(STORAGE_KEY);
    if (current) return normalizeState(current) ?? initialState;
    const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return initialState;
    const migrated = normalizeState(legacy) ?? initialState;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return initialState;
  }
}

export async function saveState(state: AppState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
