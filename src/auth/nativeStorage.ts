import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import type { AuthStorage } from './engine';

export const authStorage: AuthStorage = {
  readPublic: () => Storage.getItem('@bli-collect/auth/v1'),
  writePublic: (value) => Storage.setItem('@bli-collect/auth/v1', value),
  readSecret: (id) => SecureStore.getItemAsync(`bli.auth.${id}`),
  writeSecret: (id, value) => SecureStore.setItemAsync(`bli.auth.${id}`, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
};
