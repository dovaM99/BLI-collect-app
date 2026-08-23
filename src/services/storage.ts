import LegacyAsyncStorage from '@react-native-async-storage/async-storage';
import Storage from 'expo-sqlite/kv-store';

import { initialState } from '../data/samplePack';
import type { AppState } from '../types';
import { normalizeState, PREVIOUS_STORAGE_KEYS, STORAGE_KEY } from './storageState';

async function readAnyPreviousState() {
  for (const key of PREVIOUS_STORAGE_KEYS) {
    const fromKvStore = await Storage.getItem(key);
    if (fromKvStore) return fromKvStore;
    const fromAsyncStorage = await LegacyAsyncStorage.getItem(key);
    if (fromAsyncStorage) return fromAsyncStorage;
  }
  return null;
}

export async function loadState(): Promise<AppState> {
  try {
    const current = await Storage.getItem(STORAGE_KEY);
    if (current) return normalizeState(current) ?? initialState;

    const previous = await readAnyPreviousState();
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
