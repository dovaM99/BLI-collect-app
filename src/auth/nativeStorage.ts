import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import type { AuthStorage } from './engine';

export const authStorage: AuthStorage = {
  readPublic: () => Storage.getItem('@bli-collect/auth/v2'),
  writePublic: (value) => Storage.setItem('@bli-collect/auth/v2', value),
  readLegacy: () => Storage.getItem('@bli-collect/auth/v1'),
  readSecret: (code) => SecureStore.getItemAsync(`bli.pin.${code}`),
  writeSecret: (code, value) => SecureStore.setItemAsync(`bli.pin.${code}`, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
};
